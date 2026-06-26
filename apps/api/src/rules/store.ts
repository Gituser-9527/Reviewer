import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { emptyJobFacts, normalizeAuditText, YamlRuleEngine } from '@job-compliance/core';
import { parse, stringify } from 'yaml';
import type { ManagedRuleInput, RuleStatus } from './schemas.js';

const execFileAsync = promisify(execFile);
const yamlFilePattern = /\.ya?ml$/iu;

interface RuleFileDocument {
  jurisdiction: string;
  ruleVersion: string;
  rules: ManagedRuleRecord[];
}

export interface ManagedRuleRecord {
  id: string;
  category: string;
  severity: string;
  action: string;
  containsAny?: {
    fields?: string[];
    values?: string[];
  };
  regex?: {
    fields?: string[];
    patterns?: string[];
  };
  patterns?: string[];
  fields?: string[];
  explanation: string;
  suggestion?: string;
  enabled?: boolean;
}

export interface ManagedRuleView extends ManagedRuleRecord {
  status: RuleLifecycleStatus;
  jurisdiction: string;
  ruleVersion: string;
  fileName: string;
  hitCount: number;
}

export type RuleLifecycleStatus = 'draft' | 'testing' | 'published' | 'disabled' | 'archived';

export interface RuleSetRecord {
  id: string;
  name: string;
  jurisdiction: string;
  status: RuleLifecycleStatus;
  currentVersion?: string;
  draftVersion: string;
  description?: string;
  ruleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleVersionRecord {
  ruleVersion: string;
  jurisdiction: string;
  publishedAt: string;
  actorId: string;
  ruleCount: number;
  evalPassed: boolean;
}

export interface RulePublishRecord extends RuleVersionRecord {
  id: string;
  ruleSetId: string;
  previousVersion?: string;
  action: 'publish' | 'rollback';
  forcePublished: boolean;
  evalSummary?: Record<string, unknown>;
}

export interface PublishRulesResult {
  ruleVersion: string;
  evalPassed: boolean;
  publishedAt: string;
  ruleCount: number;
  evalOutput: string;
  forcePublished?: boolean;
  previousVersion?: string;
}

export interface RuleTestResult {
  ruleSetId: string;
  ruleVersion: string;
  finalDecision: string;
  hits: Array<{
    ruleId: string;
    matchedText: string[];
    category: string;
    severity: string;
    action: string;
  }>;
}

export interface FileRuleManagementStoreOptions {
  rootDirectory?: string;
  evalCommand?: string | string[];
}

interface LocatedRule {
  document: RuleFileDocument;
  fileName: string;
  filePath: string;
  rule: ManagedRuleRecord;
  ruleIndex: number;
}

/** File-backed rule management store with draft/published separation. */
export class FileRuleManagementStore {
  private readonly rootDirectory: string;
  private readonly evalCommand: string[];

  constructor(options: FileRuleManagementStoreOptions = {}) {
    this.rootDirectory = resolve(options.rootDirectory ?? process.cwd(), 'rules');
    this.evalCommand =
      typeof options.evalCommand === 'string'
        ? options.evalCommand.split(/\s+/u)
        : (options.evalCommand ?? ['npm', 'run', 'eval']);
  }

  async listRuleSets(): Promise<RuleSetRecord[]> {
    const jurisdictions = await this.knownJurisdictions();
    return Promise.all(jurisdictions.map((jurisdiction) => this.getRuleSet(jurisdiction)));
  }

  async createRuleSet(input: {
    id?: string;
    name: string;
    jurisdiction?: string;
    description?: string;
  }): Promise<RuleSetRecord> {
    const jurisdiction = normalizeJurisdiction(input.jurisdiction ?? input.id ?? 'CN_MAINLAND');
    await this.ensureDraftInitialized(jurisdiction);
    const manifest = await this.readRuleSetManifest();
    const existing = manifest.find((entry) => entry.id === jurisdiction);
    const now = new Date().toISOString();
    const currentVersion =
      existing?.currentVersion ?? (await this.currentPublishedVersion(jurisdiction));
    const record: RuleSetRecord = {
      id: jurisdiction,
      name: input.name,
      jurisdiction,
      status: existing?.status ?? 'draft',
      ...(currentVersion === undefined ? {} : { currentVersion }),
      draftVersion: await this.currentDraftVersion(jurisdiction),
      ...(input.description === undefined ? {} : { description: input.description }),
      ruleCount: (await this.readRuleViews(jurisdiction, 'draft')).length,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.writeRuleSetManifest([
      ...manifest.filter((entry) => entry.id !== jurisdiction),
      record,
    ]);
    return record;
  }

  async getRuleSet(id: string): Promise<RuleSetRecord> {
    const jurisdiction = normalizeJurisdiction(id);
    await this.ensureDraftInitialized(jurisdiction);
    const manifest = await this.readRuleSetManifest();
    const existing = manifest.find((entry) => entry.id === jurisdiction);
    const publishedVersion = await this.currentPublishedVersion(jurisdiction);
    const draftVersion = await this.currentDraftVersion(jurisdiction);
    const now = new Date().toISOString();
    return {
      id: jurisdiction,
      name: existing?.name ?? `${jurisdiction} Rules`,
      jurisdiction,
      status: existing?.status ?? (publishedVersion === undefined ? 'draft' : 'published'),
      ...(publishedVersion === undefined ? {} : { currentVersion: publishedVersion }),
      draftVersion,
      ...(existing?.description === undefined ? {} : { description: existing.description }),
      ruleCount: (await this.readRuleViews(jurisdiction, 'draft')).length,
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing?.updatedAt ?? now,
    };
  }

  async getCurrentRuleVersion(id: string): Promise<string> {
    const jurisdiction = normalizeJurisdiction(id);
    return (await this.currentPublishedVersion(jurisdiction)) ?? '1.0.0';
  }

  async getRulesDirectoryForVersion(id: string, ruleVersion: string): Promise<string> {
    const jurisdiction = normalizeJurisdiction(id);
    const releaseDirectory = this.releaseDirectory(jurisdiction, ruleVersion);
    if ((await this.safeYamlFiles(releaseDirectory)).length > 0) {
      return releaseDirectory;
    }
    return this.rulesDirectory(jurisdiction, 'published');
  }

  async addRuleToRuleSet(
    id: string,
    input: ManagedRuleInput,
    fileName?: string,
  ): Promise<ManagedRuleView> {
    return this.createRule(id, input, fileName);
  }

  async patchRule(
    id: string,
    input: Partial<ManagedRuleInput> & { jurisdiction?: string },
  ): Promise<ManagedRuleView> {
    const jurisdiction = normalizeJurisdiction(input.jurisdiction ?? 'CN_MAINLAND');
    await this.ensureDraftInitialized(jurisdiction);
    const located = await this.findDraftRule(jurisdiction, id);
    if (located === undefined) {
      throw new RuleManagementError('RULE_NOT_FOUND', `Rule ${id} was not found.`);
    }
    const merged = {
      ...located.rule,
      ...input,
      id,
      containsAny: input.containsAny ?? located.rule.containsAny,
      regex: input.regex ?? located.rule.regex,
      patterns: input.patterns ?? located.rule.patterns,
      fields: input.fields ?? located.rule.fields,
    } as ManagedRuleInput;
    return this.updateRule(jurisdiction, id, merged);
  }

  async testRuleSet(
    id: string,
    input: { text: string; ruleVersion?: string },
  ): Promise<RuleTestResult> {
    const jurisdiction = normalizeJurisdiction(id);
    await this.ensureDraftInitialized(jurisdiction);
    const ruleVersion = input.ruleVersion ?? (await this.currentDraftVersion(jurisdiction));
    await this.updateDraftVersion(jurisdiction, ruleVersion);
    const engine = await YamlRuleEngine.fromDirectory(this.rulesDirectory(jurisdiction, 'draft'));
    const normalizedText = normalizeAuditText(input.text);
    const hits = engine.evaluate({
      rawText: input.text,
      normalizedText,
      extractedFacts: emptyJobFacts(normalizedText),
      jurisdiction,
      ruleVersion,
    });
    return {
      ruleSetId: jurisdiction,
      ruleVersion,
      finalDecision: finalDecisionForHits(hits),
      hits: hits.map((hit) => ({
        ruleId: hit.ruleId,
        matchedText: hit.matchedText,
        category: hit.category,
        severity: hit.severity,
        action: hit.action,
      })),
    };
  }

  async runEvalForRuleSet(
    id: string,
    options: { ruleVersion?: string } = {},
  ): Promise<{
    ruleSetId: string;
    ruleVersion: string;
    evalPassed: boolean;
    evalOutput: string;
    evalSummary?: Record<string, unknown>;
  }> {
    const jurisdiction = normalizeJurisdiction(id);
    await this.ensureDraftInitialized(jurisdiction);
    const ruleVersion = options.ruleVersion ?? (await this.currentDraftVersion(jurisdiction));
    await this.updateDraftVersion(jurisdiction, ruleVersion);
    const evalResult = await this.runEvalSafe(
      this.rulesDirectory(jurisdiction, 'draft'),
      ruleVersion,
    );
    return {
      ruleSetId: jurisdiction,
      ruleVersion,
      evalPassed: evalResult.passed,
      evalOutput: evalResult.output,
      ...(evalResult.summary === undefined ? {} : { evalSummary: evalResult.summary }),
    };
  }

  async listRules(jurisdiction: string, status: RuleStatus): Promise<ManagedRuleView[]> {
    const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
    const statuses = status === 'all' ? (['draft', 'published'] as const) : ([status] as const);
    const views = await Promise.all(
      statuses.map(async (entryStatus) => {
        if (entryStatus === 'draft') {
          await this.ensureDraftInitialized(normalizedJurisdiction);
        }
        return this.readRuleViews(normalizedJurisdiction, entryStatus);
      }),
    );
    return views.flat().sort((left, right) => left.id.localeCompare(right.id));
  }

  async createRule(
    jurisdiction: string,
    input: ManagedRuleInput,
    fileName?: string,
  ): Promise<ManagedRuleView> {
    const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
    await this.ensureDraftInitialized(normalizedJurisdiction);
    const draftDirectory = this.rulesDirectory(normalizedJurisdiction, 'draft');
    const targetFileName = sanitizeRuleFileName(fileName ?? fileNameForCategory(input.category));
    const filePath = join(draftDirectory, targetFileName);
    const document = await this.readRuleFileOrDefault(
      filePath,
      normalizedJurisdiction,
      await this.currentDraftVersion(normalizedJurisdiction),
    );
    const rule = normalizeRuleInput(input);
    if (rule.id === undefined || rule.id.length === 0) {
      rule.id = createRuleId(normalizedJurisdiction, input.category);
    }
    if (document.rules.some((entry) => entry.id === rule.id)) {
      throw new RuleManagementError('RULE_ALREADY_EXISTS', `Rule ${rule.id} already exists.`);
    }
    document.rules.push(rule as ManagedRuleRecord);
    await this.writeRuleFile(filePath, document);
    return this.toView(rule as ManagedRuleRecord, document, targetFileName, 'draft');
  }

  async updateRule(
    jurisdiction: string,
    id: string,
    input: ManagedRuleInput,
  ): Promise<ManagedRuleView> {
    const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
    await this.ensureDraftInitialized(normalizedJurisdiction);
    const located = await this.findDraftRule(normalizedJurisdiction, id);
    if (located === undefined) {
      throw new RuleManagementError('RULE_NOT_FOUND', `Rule ${id} was not found.`);
    }
    const updated = normalizeRuleInput({ ...input, id });
    located.document.rules[located.ruleIndex] = updated as ManagedRuleRecord;
    await this.writeRuleFile(located.filePath, located.document);
    return this.toView(updated as ManagedRuleRecord, located.document, located.fileName, 'draft');
  }

  async setRuleEnabled(
    jurisdiction: string,
    id: string,
    enabled: boolean,
  ): Promise<ManagedRuleView> {
    const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
    await this.ensureDraftInitialized(normalizedJurisdiction);
    const located = await this.findDraftRule(normalizedJurisdiction, id);
    if (located === undefined) {
      throw new RuleManagementError('RULE_NOT_FOUND', `Rule ${id} was not found.`);
    }
    located.rule.enabled = enabled;
    located.document.rules[located.ruleIndex] = located.rule;
    await this.writeRuleFile(located.filePath, located.document);
    return this.toView(located.rule, located.document, located.fileName, 'draft');
  }

  async listVersions(jurisdiction: string): Promise<RuleVersionRecord[]> {
    const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
    const manifest = await this.readVersionManifest(normalizedJurisdiction);
    return manifest.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  async publishRules(
    jurisdiction: string,
    options: { ruleVersion?: string; actorId: string },
  ): Promise<PublishRulesResult> {
    return this.publishRuleSet(jurisdiction, {
      actorId: options.actorId,
      ...(options.ruleVersion === undefined ? {} : { ruleVersion: options.ruleVersion }),
    });
  }

  async publishRuleSet(
    id: string,
    options: {
      ruleVersion?: string;
      actorId: string;
      forcePublish?: boolean;
      minDecisionAccuracy?: number;
      minCategoryRecall?: number;
    },
  ): Promise<PublishRulesResult> {
    const normalizedJurisdiction = normalizeJurisdiction(id);
    await this.ensureDraftInitialized(normalizedJurisdiction);
    const ruleVersion = options.ruleVersion ?? (await this.nextRuleVersion(normalizedJurisdiction));
    const previousVersion = await this.currentPublishedVersion(normalizedJurisdiction);
    const draftDirectory = this.rulesDirectory(normalizedJurisdiction, 'draft');
    const publishedDirectory = this.rulesDirectory(normalizedJurisdiction, 'published');
    await this.updateDraftVersion(normalizedJurisdiction, ruleVersion);

    const evalResult = await this.runEvalSafe(draftDirectory, ruleVersion);
    const minDecisionAccuracy = options.minDecisionAccuracy ?? 0.9;
    const minCategoryRecall = options.minCategoryRecall ?? 0.9;
    const metricsPassed =
      evalResult.summary === undefined ||
      ((numberMetric(evalResult.summary.decisionAccuracy) ?? 1) >= minDecisionAccuracy &&
        (numberMetric(evalResult.summary.categoryRecall) ?? 1) >= minCategoryRecall);
    const evalPassed = evalResult.passed && metricsPassed;
    const forcePublished = options.forcePublish ?? false;
    if (!evalPassed && !forcePublished) {
      throw new RuleManagementError(
        'EVAL_FAILED',
        'Rule eval did not meet the publish threshold. Draft was not published.',
      );
    }
    await rm(publishedDirectory, { recursive: true, force: true });
    await mkdir(publishedDirectory, { recursive: true });
    await cp(draftDirectory, publishedDirectory, { recursive: true });
    await this.writeReleaseSnapshot(normalizedJurisdiction, ruleVersion);

    const publishedAt = new Date().toISOString();
    const ruleCount = (await this.readRuleViews(normalizedJurisdiction, 'published')).length;
    const record: RulePublishRecord = {
      id: `rule_publish_${randomUUID()}`,
      ruleSetId: normalizedJurisdiction,
      ruleVersion,
      jurisdiction: normalizedJurisdiction,
      publishedAt,
      actorId: options.actorId,
      ruleCount,
      evalPassed,
      ...(previousVersion === undefined ? {} : { previousVersion }),
      action: 'publish',
      forcePublished,
      ...(evalResult.summary === undefined ? {} : { evalSummary: evalResult.summary }),
    };
    const manifest = await this.readVersionManifest(normalizedJurisdiction);
    manifest.push(record);
    await this.writeVersionManifest(normalizedJurisdiction, manifest);
    await this.markRuleSetPublished(normalizedJurisdiction, ruleVersion);
    return {
      ruleVersion,
      evalPassed,
      publishedAt,
      ruleCount,
      evalOutput: evalResult.output,
      forcePublished,
      ...(previousVersion === undefined ? {} : { previousVersion }),
    };
  }

  async rollbackRuleSet(
    id: string,
    options: { actorId: string; targetVersion?: string },
  ): Promise<PublishRulesResult> {
    const jurisdiction = normalizeJurisdiction(id);
    const manifest = await this.readVersionManifest(jurisdiction);
    const publishRecords = manifest
      .filter((record) => record.action !== 'rollback')
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
    const current = publishRecords[0];
    const targetVersion = options.targetVersion ?? publishRecords[1]?.ruleVersion;
    if (targetVersion === undefined) {
      throw new RuleManagementError(
        'ROLLBACK_TARGET_NOT_FOUND',
        'No previous published version exists.',
      );
    }
    const releaseDirectory = this.releaseDirectory(jurisdiction, targetVersion);
    if ((await this.safeYamlFiles(releaseDirectory)).length === 0) {
      throw new RuleManagementError(
        'ROLLBACK_TARGET_NOT_FOUND',
        `Release ${targetVersion} was not found.`,
      );
    }
    const publishedDirectory = this.rulesDirectory(jurisdiction, 'published');
    const draftDirectory = this.rulesDirectory(jurisdiction, 'draft');
    await rm(publishedDirectory, { recursive: true, force: true });
    await mkdir(publishedDirectory, { recursive: true });
    await cp(releaseDirectory, publishedDirectory, { recursive: true });
    await rm(draftDirectory, { recursive: true, force: true });
    await mkdir(draftDirectory, { recursive: true });
    await cp(releaseDirectory, draftDirectory, { recursive: true });

    const publishedAt = new Date().toISOString();
    const ruleCount = (await this.readRuleViews(jurisdiction, 'published')).length;
    const record: RulePublishRecord = {
      id: `rule_publish_${randomUUID()}`,
      ruleSetId: jurisdiction,
      ruleVersion: targetVersion,
      jurisdiction,
      publishedAt,
      actorId: options.actorId,
      ruleCount,
      evalPassed: true,
      ...(current?.ruleVersion === undefined ? {} : { previousVersion: current.ruleVersion }),
      action: 'rollback',
      forcePublished: false,
    };
    manifest.push(record);
    await this.writeVersionManifest(jurisdiction, manifest);
    await this.markRuleSetPublished(jurisdiction, targetVersion);
    return {
      ruleVersion: targetVersion,
      evalPassed: true,
      publishedAt,
      ruleCount,
      evalOutput: 'rollback: eval not rerun',
      ...(current?.ruleVersion === undefined ? {} : { previousVersion: current.ruleVersion }),
    };
  }

  async listPublishRecords(): Promise<RulePublishRecord[]> {
    const jurisdictions = await this.knownJurisdictions();
    const records = await Promise.all(
      jurisdictions.map((entry) => this.readVersionManifest(entry)),
    );
    return records.flat().sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  }

  private async ensureDraftInitialized(jurisdiction: string): Promise<void> {
    const draftDirectory = this.rulesDirectory(jurisdiction, 'draft');
    const publishedDirectory = this.rulesDirectory(jurisdiction, 'published');
    await mkdir(this.draftRootDirectory(), { recursive: true });
    const draftFiles = await this.safeYamlFiles(draftDirectory);
    if (draftFiles.length > 0) return;
    await mkdir(draftDirectory, { recursive: true });
    const publishedFiles = await this.safeYamlFiles(publishedDirectory);
    for (const file of publishedFiles) {
      await cp(join(publishedDirectory, file), join(draftDirectory, file));
    }
  }

  private async readRuleViews(
    jurisdiction: string,
    status: 'draft' | 'published',
  ): Promise<ManagedRuleView[]> {
    const directory = this.rulesDirectory(jurisdiction, status);
    const files = await this.safeYamlFiles(directory);
    const documents = await Promise.all(
      files.map(async (fileName) => ({
        fileName,
        document: await this.readRuleFile(join(directory, fileName)),
      })),
    );
    return documents.flatMap(({ fileName, document }) =>
      document.rules.map((rule) => this.toView(rule, document, fileName, status)),
    );
  }

  private async findDraftRule(jurisdiction: string, id: string): Promise<LocatedRule | undefined> {
    const directory = this.rulesDirectory(jurisdiction, 'draft');
    const files = await this.safeYamlFiles(directory);
    for (const fileName of files) {
      const filePath = join(directory, fileName);
      const document = await this.readRuleFile(filePath);
      const ruleIndex = document.rules.findIndex((rule) => rule.id === id);
      if (ruleIndex >= 0) {
        const rule = document.rules[ruleIndex];
        if (rule === undefined) return undefined;
        return { document, fileName, filePath, rule, ruleIndex };
      }
    }
    return undefined;
  }

  private async currentDraftVersion(jurisdiction: string): Promise<string> {
    const views = await this.readRuleViews(jurisdiction, 'draft');
    return views[0]?.ruleVersion ?? (await this.currentPublishedVersion(jurisdiction)) ?? '1.0.0';
  }

  private async currentPublishedVersion(jurisdiction: string): Promise<string | undefined> {
    const views = await this.readRuleViews(jurisdiction, 'published');
    return views[0]?.ruleVersion;
  }

  private async nextRuleVersion(jurisdiction: string): Promise<string> {
    const current = (await this.currentDraftVersion(jurisdiction)) ?? '1.0.0';
    const segments = current.split('.').map((segment) => Number.parseInt(segment, 10));
    const [major = 1, minor = 0, patch = 0] = segments.map((segment) =>
      Number.isFinite(segment) ? segment : 0,
    );
    return `${major}.${minor}.${patch + 1}`;
  }

  private async updateDraftVersion(jurisdiction: string, ruleVersion: string): Promise<void> {
    const directory = this.rulesDirectory(jurisdiction, 'draft');
    const files = await this.safeYamlFiles(directory);
    for (const fileName of files) {
      const filePath = join(directory, fileName);
      const document = await this.readRuleFile(filePath);
      document.ruleVersion = ruleVersion;
      document.jurisdiction = jurisdiction;
      await this.writeRuleFile(filePath, document);
    }
  }

  private async runEval(rulesDirectory: string, ruleVersion: string): Promise<string> {
    const result = await this.runEvalSafe(rulesDirectory, ruleVersion);
    if (!result.passed) {
      throw new RuleManagementError('EVAL_FAILED', 'Rule eval failed. Draft was not published.');
    }
    return result.output;
  }

  private async runEvalSafe(
    rulesDirectory: string,
    ruleVersion: string,
  ): Promise<{ passed: boolean; output: string; summary?: Record<string, unknown> }> {
    const [command, ...args] = this.evalCommand;
    if (command === undefined) {
      throw new RuleManagementError('EVAL_COMMAND_INVALID', 'Eval command is empty.');
    }
    try {
      const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
      const { stdout, stderr } = await execFileAsync(executable, args, {
        cwd: resolve(this.rootDirectory, '..'),
        env: {
          ...process.env,
          RULES_DIRECTORY: rulesDirectory,
          RULE_VERSION: ruleVersion,
        },
        timeout: 120_000,
      });
      const output = `${stdout}${stderr}`.trim();
      return { passed: true, output, ...(parseEvalSummary(output) ?? undefined) };
    } catch (cause) {
      const output = outputFromExecError(cause);
      return { passed: false, output, ...(parseEvalSummary(output) ?? undefined) };
    }
  }

  private rulesDirectory(jurisdiction: string, status: 'draft' | 'published'): string {
    if (status === 'published') {
      return join(this.rootDirectory, directoryNameForJurisdiction(jurisdiction));
    }
    return join(this.draftRootDirectory(), directoryNameForJurisdiction(jurisdiction));
  }

  private draftRootDirectory(): string {
    return join(this.rootDirectory, 'drafts');
  }

  private versionsDirectory(): string {
    return join(this.rootDirectory, 'versions');
  }

  private ruleSetsManifestPath(): string {
    return join(this.rootDirectory, 'rule-sets.json');
  }

  private releasesRootDirectory(): string {
    return join(this.rootDirectory, 'releases');
  }

  private releaseDirectory(jurisdiction: string, ruleVersion: string): string {
    return join(
      this.releasesRootDirectory(),
      directoryNameForJurisdiction(jurisdiction),
      ruleVersion,
    );
  }

  private async writeReleaseSnapshot(jurisdiction: string, ruleVersion: string): Promise<void> {
    const releaseDirectory = this.releaseDirectory(jurisdiction, ruleVersion);
    await rm(releaseDirectory, { recursive: true, force: true });
    await mkdir(releaseDirectory, { recursive: true });
    await cp(this.rulesDirectory(jurisdiction, 'published'), releaseDirectory, { recursive: true });
  }

  private async knownJurisdictions(): Promise<string[]> {
    const manifest = await this.readRuleSetManifest();
    const fromManifest = manifest.map((entry) => entry.jurisdiction);
    const fromPublished = await this.safeDirectories(this.rootDirectory);
    const fromDrafts = await this.safeDirectories(this.draftRootDirectory());
    const values = [...fromManifest, ...fromPublished, ...fromDrafts]
      .filter((entry) => !['drafts', 'versions', 'releases'].includes(entry))
      .map((entry) => normalizeJurisdiction(entry));
    return [...new Set(values.length === 0 ? ['CN_MAINLAND'] : values)].sort();
  }

  private async safeDirectories(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  private async safeYamlFiles(directory: string): Promise<string[]> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && yamlFilePattern.test(entry.name))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  private async readRuleFile(filePath: string): Promise<RuleFileDocument> {
    const content = await readFile(filePath, 'utf8');
    const parsed = parse(content) as Partial<RuleFileDocument>;
    return {
      jurisdiction: normalizeJurisdiction(String(parsed.jurisdiction ?? 'CN_MAINLAND')),
      ruleVersion: String(parsed.ruleVersion ?? '1.0.0'),
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    };
  }

  private async readRuleFileOrDefault(
    filePath: string,
    jurisdiction: string,
    ruleVersion: string,
  ): Promise<RuleFileDocument> {
    try {
      return await this.readRuleFile(filePath);
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error;
      }
      return { jurisdiction, ruleVersion, rules: [] };
    }
  }

  private async writeRuleFile(filePath: string, document: RuleFileDocument): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, stringify(document, { lineWidth: 0 }), 'utf8');
  }

  private async readRuleSetManifest(): Promise<RuleSetRecord[]> {
    try {
      const content = await readFile(this.ruleSetsManifestPath(), 'utf8');
      const parsed = JSON.parse(content) as RuleSetRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeRuleSetManifest(records: RuleSetRecord[]): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true });
    await writeFile(this.ruleSetsManifestPath(), `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  }

  private async markRuleSetPublished(jurisdiction: string, ruleVersion: string): Promise<void> {
    const manifest = await this.readRuleSetManifest();
    const existing = manifest.find((entry) => entry.id === jurisdiction);
    const now = new Date().toISOString();
    const record: RuleSetRecord = {
      id: jurisdiction,
      name: existing?.name ?? `${jurisdiction} Rules`,
      jurisdiction,
      status: 'published',
      currentVersion: ruleVersion,
      draftVersion: ruleVersion,
      ...(existing?.description === undefined ? {} : { description: existing.description }),
      ruleCount: (await this.readRuleViews(jurisdiction, 'published')).length,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.writeRuleSetManifest([
      ...manifest.filter((entry) => entry.id !== jurisdiction),
      record,
    ]);
  }

  private async readVersionManifest(jurisdiction: string): Promise<RulePublishRecord[]> {
    try {
      const content = await readFile(this.versionManifestPath(jurisdiction), 'utf8');
      const parsed = JSON.parse(content) as Array<Partial<RulePublishRecord>>;
      return Array.isArray(parsed)
        ? parsed.map((entry) => normalizePublishRecord(entry, jurisdiction))
        : [];
    } catch {
      return [];
    }
  }

  private async writeVersionManifest(
    jurisdiction: string,
    records: RulePublishRecord[],
  ): Promise<void> {
    await mkdir(this.versionsDirectory(), { recursive: true });
    await writeFile(
      this.versionManifestPath(jurisdiction),
      `${JSON.stringify(records, null, 2)}\n`,
    );
  }

  private versionManifestPath(jurisdiction: string): string {
    return join(this.versionsDirectory(), `${directoryNameForJurisdiction(jurisdiction)}.json`);
  }

  private toView(
    rule: ManagedRuleRecord,
    document: RuleFileDocument,
    fileName: string,
    status: 'draft' | 'published',
  ): ManagedRuleView {
    return {
      ...rule,
      enabled: rule.enabled ?? true,
      status,
      jurisdiction: document.jurisdiction,
      ruleVersion: document.ruleVersion,
      fileName,
      hitCount: 0,
    };
  }
}

export class RuleManagementError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'RuleManagementError';
  }
}

function normalizeJurisdiction(value: string): string {
  return value.trim().toUpperCase().replaceAll('-', '_');
}

function directoryNameForJurisdiction(jurisdiction: string): string {
  return jurisdiction.toLowerCase().replaceAll('_', '-');
}

function sanitizeRuleFileName(fileName: string): string {
  const safe = fileName.replace(/[^a-z0-9._-]/giu, '').replace(/^\.+/u, '');
  return yamlFilePattern.test(safe) ? safe : `${safe}.yml`;
}

function fileNameForCategory(category: string): string {
  return `${category.toLowerCase().replaceAll('_', '-')}.yml`;
}

function createRuleId(jurisdiction: string, category: string): string {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  return `${jurisdiction.replaceAll('_', '')}_${category}_${suffix}`;
}

function normalizeRuleInput(input: ManagedRuleInput): Partial<ManagedRuleRecord> {
  return {
    ...(input.id === undefined ? {} : { id: input.id }),
    category: input.category,
    severity: input.severity,
    action: input.action,
    ...(input.containsAny === undefined
      ? {}
      : {
          containsAny: {
            fields: input.containsAny.fields,
            values: input.containsAny.values ?? input.containsAny.patterns ?? [],
          },
        }),
    ...(input.regex === undefined
      ? {}
      : {
          regex: {
            fields: input.regex.fields,
            patterns: input.regex.patterns ?? input.regex.values ?? [],
          },
        }),
    ...(input.patterns === undefined ? {} : { patterns: input.patterns }),
    ...(input.fields === undefined ? {} : { fields: input.fields }),
    explanation: input.explanation,
    ...(input.suggestion === undefined ? {} : { suggestion: input.suggestion }),
    enabled: input.enabled,
  };
}

/** Returns a relative path string for diagnostics without leaking host-specific details. */
export function relativeRulePath(root: string, filePath: string): string {
  return relative(root, filePath).replaceAll('\\', '/');
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function finalDecisionForHits(hits: Array<{ severity: string; decision: string }>): string {
  if (hits.some((hit) => hit.severity === 'CRITICAL' || hit.decision === 'REJECT')) return 'REJECT';
  if (hits.some((hit) => hit.severity === 'HIGH' || hit.decision === 'MANUAL_REVIEW')) {
    return 'MANUAL_REVIEW';
  }
  if (hits.some((hit) => hit.severity === 'MEDIUM' || hit.decision === 'ALLOW_WITH_WARNING')) {
    return 'ALLOW_WITH_WARNING';
  }
  return hits.length > 0 ? 'ALLOW_WITH_WARNING' : 'PASS';
}

function numberMetric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseEvalSummary(output: string): { summary: Record<string, unknown> } | undefined {
  const firstBrace = output.indexOf('{');
  const lastBrace = output.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) return undefined;
  try {
    const parsed = JSON.parse(output.slice(firstBrace, lastBrace + 1)) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { summary: parsed as Record<string, unknown> }
      : undefined;
  } catch {
    return undefined;
  }
}

function outputFromExecError(error: unknown): string {
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const stdout = typeof record.stdout === 'string' ? record.stdout : '';
    const stderr = typeof record.stderr === 'string' ? record.stderr : '';
    const message = error instanceof Error ? error.message : '';
    return `${stdout}${stderr}${message}`.trim();
  }
  return String(error);
}

function normalizePublishRecord(
  input: Partial<RulePublishRecord>,
  jurisdiction: string,
): RulePublishRecord {
  const publishedAt =
    typeof input.publishedAt === 'string' ? input.publishedAt : new Date().toISOString();
  const ruleVersion = typeof input.ruleVersion === 'string' ? input.ruleVersion : '1.0.0';
  return {
    id: typeof input.id === 'string' ? input.id : `rule_publish_${randomUUID()}`,
    ruleSetId: typeof input.ruleSetId === 'string' ? input.ruleSetId : jurisdiction,
    ruleVersion,
    jurisdiction:
      typeof input.jurisdiction === 'string'
        ? normalizeJurisdiction(input.jurisdiction)
        : jurisdiction,
    publishedAt,
    actorId: typeof input.actorId === 'string' ? input.actorId : 'unknown',
    ruleCount: typeof input.ruleCount === 'number' ? input.ruleCount : 0,
    evalPassed: input.evalPassed ?? true,
    action: input.action ?? 'publish',
    forcePublished: input.forcePublished ?? false,
    ...(input.previousVersion === undefined ? {} : { previousVersion: input.previousVersion }),
    ...(input.evalSummary === undefined ? {} : { evalSummary: input.evalSummary }),
  };
}
