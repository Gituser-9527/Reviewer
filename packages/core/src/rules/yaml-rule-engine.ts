import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  riskCategories,
  severities,
  type AuditDecision,
  type Evidence,
  type JobFacts,
  type RiskCategory,
  type Severity,
} from '@job-compliance/shared';
import { parse } from 'yaml';
import type { RuleEngine, RuleEngineInput } from '../ports/rule-engine.js';
import { ruleActions, type RuleAction, type RuleHit } from './types.js';

const defaultFields = ['rawText', 'normalizedText'] as const;
const maximumPatternLength = 500;

interface YamlMatcher {
  fields?: string[];
  values?: string[];
  patterns?: string[];
}

interface YamlRule {
  id: string;
  category: string;
  severity: string;
  action: string;
  containsAny?: YamlMatcher | string[];
  regex?: YamlMatcher | string[];
  patterns?: string[];
  fields?: string[];
  explanation: string;
  suggestion?: string;
  enabled?: boolean;
}

interface LoadedRule {
  ruleId: string;
  jurisdiction: string;
  ruleVersion: string;
  category: RiskCategory;
  severity: Severity;
  action: RuleAction;
  decision: AuditDecision;
  containsAny: MatcherDefinition | null;
  regex: MatcherDefinition | null;
  explanation: string;
  suggestion?: string;
  enabled: boolean;
}

interface MatcherDefinition {
  fields: string[];
  patterns: string[];
}

interface SearchableValue {
  fieldPath: string;
  text: string;
}

interface MatchRecord {
  conditionId: string;
  fieldPath: string;
  matchedText: string;
  start?: number;
  end?: number;
}

const actionDecisionMap: Record<RuleAction, AuditDecision> = {
  pass: 'PASS',
  reject: 'REJECT',
  manual_review: 'MANUAL_REVIEW',
  allow_with_warning: 'ALLOW_WITH_WARNING',
  need_more_info: 'NEED_MORE_INFO',
};

const severityRank: Record<Severity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeJurisdiction = (value: string): string => {
  const normalized = value.trim().toUpperCase().replaceAll('-', '_');
  return normalized === 'CN' ? 'CN_MAINLAND' : normalized;
};

const normalizeSeverity = (value: string, source: string): Severity => {
  const normalized = value.toUpperCase();
  if (!severities.includes(normalized as Severity)) {
    throw new TypeError(`${source}: unsupported severity ${value}`);
  }
  return normalized as Severity;
};

const normalizeCategory = (value: string, source: string): RiskCategory => {
  const normalized = value.toUpperCase();
  if (!riskCategories.includes(normalized as RiskCategory)) {
    throw new TypeError(`${source}: unsupported category ${value}`);
  }
  return normalized as RiskCategory;
};

const normalizeAction = (value: string, source: string): RuleAction => {
  const normalized = value.toLowerCase() as RuleAction;
  if (!ruleActions.includes(normalized)) {
    throw new TypeError(`${source}: unsupported action ${value}`);
  }
  return normalized;
};

const requireString = (value: unknown, field: string, source: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${source}: ${field} must be a non-empty string`);
  }
  return value;
};

const requireStringArray = (value: unknown, field: string, source: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new TypeError(`${source}: ${field} must be an array of non-empty strings`);
  }
  return value;
};

const normalizeMatcher = (
  value: YamlMatcher | string[] | undefined,
  fallbackPatterns: string[] | undefined,
  fallbackFields: string[] | undefined,
  kind: 'containsAny' | 'regex',
  source: string,
): MatcherDefinition | null => {
  if (value === undefined && fallbackPatterns === undefined) return null;

  let fields: string[];
  let patterns: string[];
  if (Array.isArray(value)) {
    fields = fallbackFields ?? [...defaultFields];
    patterns = requireStringArray(value, kind, source);
  } else if (value !== undefined) {
    if (!isRecord(value)) throw new TypeError(`${source}: ${kind} must be an array or object`);
    fields =
      value.fields === undefined
        ? (fallbackFields ?? [...defaultFields])
        : requireStringArray(value.fields, `${kind}.fields`, source);
    const matcherPatterns = kind === 'regex' ? value.patterns : value.values;
    patterns = requireStringArray(matcherPatterns, `${kind}.patterns`, source);
  } else {
    fields = fallbackFields ?? [...defaultFields];
    patterns = requireStringArray(fallbackPatterns, 'patterns', source);
  }

  for (const pattern of patterns) {
    if (pattern.length > maximumPatternLength) {
      throw new TypeError(`${source}: ${kind} pattern exceeds ${maximumPatternLength} characters`);
    }
    if (kind === 'regex') {
      try {
        new RegExp(pattern, 'iu');
      } catch (error) {
        throw new TypeError(`${source}: invalid regular expression ${pattern}`, { cause: error });
      }
    }
  }

  return { fields, patterns };
};

const parseRuleFile = (input: unknown, source: string): LoadedRule[] => {
  if (!isRecord(input)) throw new TypeError(`${source}: rule file must contain an object`);
  const jurisdiction = normalizeJurisdiction(
    requireString(input.jurisdiction, 'jurisdiction', source),
  );
  const ruleVersion = requireString(input.ruleVersion, 'ruleVersion', source);
  if (!Array.isArray(input.rules)) throw new TypeError(`${source}: rules must be an array`);

  return input.rules.map((entry, index) => {
    const entrySource = `${source} rules[${index}]`;
    if (!isRecord(entry)) throw new TypeError(`${entrySource}: rule must be an object`);
    const rule = entry as unknown as YamlRule;
    const action = normalizeAction(requireString(rule.action, 'action', entrySource), entrySource);
    const containsAny = normalizeMatcher(
      rule.containsAny,
      rule.patterns,
      rule.fields,
      'containsAny',
      entrySource,
    );
    const regex = normalizeMatcher(rule.regex, undefined, rule.fields, 'regex', entrySource);
    if (containsAny === null && regex === null) {
      throw new TypeError(`${entrySource}: rule must define containsAny, regex, or patterns`);
    }

    return {
      ruleId: requireString(rule.id, 'id', entrySource),
      jurisdiction,
      ruleVersion,
      category: normalizeCategory(
        requireString(rule.category, 'category', entrySource),
        entrySource,
      ),
      severity: normalizeSeverity(
        requireString(rule.severity, 'severity', entrySource),
        entrySource,
      ),
      action,
      decision: actionDecisionMap[action],
      containsAny,
      regex,
      explanation: requireString(rule.explanation, 'explanation', entrySource),
      ...(rule.suggestion === undefined
        ? {}
        : { suggestion: requireString(rule.suggestion, 'suggestion', entrySource) }),
      enabled: rule.enabled ?? true,
    };
  });
};

const flattenValue = (value: unknown, fieldPath: string): SearchableValue[] => {
  if (typeof value === 'string') return [{ fieldPath, text: value }];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [{ fieldPath, text: String(value) }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenValue(item, `${fieldPath}[${index}]`));
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) =>
      flattenValue(item, fieldPath.length === 0 ? key : `${fieldPath}.${key}`),
    );
  }
  return [];
};

const searchableValuesForField = (input: RuleEngineInput, field: string): SearchableValue[] => {
  if (field === 'rawText') return [{ fieldPath: field, text: input.rawText }];
  if (field === 'normalizedText') return [{ fieldPath: field, text: input.normalizedText }];
  if (field === 'extractedFacts') return flattenValue(input.extractedFacts, field);
  if (field.startsWith('extractedFacts.')) {
    const path = field.slice('extractedFacts.'.length).split('.');
    let value: unknown = input.extractedFacts;
    for (const segment of path) {
      if (!isRecord(value) || !(segment in value)) return [];
      value = value[segment];
    }
    return flattenValue(value, field);
  }
  return [];
};

const findContainsMatches = (input: RuleEngineInput, matcher: MatcherDefinition): MatchRecord[] =>
  matcher.fields.flatMap((field) =>
    searchableValuesForField(input, field).flatMap(({ fieldPath, text }) => {
      const lowerText = text.toLocaleLowerCase();
      return matcher.patterns.flatMap((pattern, patternIndex) => {
        const start = lowerText.indexOf(pattern.toLocaleLowerCase());
        if (start < 0) return [];
        return [
          {
            conditionId: `containsAny:${patternIndex}`,
            fieldPath,
            matchedText: text.slice(start, start + pattern.length),
            start,
            end: start + pattern.length,
          },
        ];
      });
    }),
  );

const findRegexMatches = (input: RuleEngineInput, matcher: MatcherDefinition): MatchRecord[] =>
  matcher.fields.flatMap((field) =>
    searchableValuesForField(input, field).flatMap(({ fieldPath, text }) =>
      matcher.patterns.flatMap((pattern, patternIndex) => {
        const expression = new RegExp(pattern, 'giu');
        const matches: MatchRecord[] = [];
        for (const match of text.matchAll(expression)) {
          if (match[0].length === 0) continue;
          const start = match.index;
          matches.push({
            conditionId: `regex:${patternIndex}`,
            fieldPath,
            matchedText: match[0],
            start,
            end: start + match[0].length,
          });
        }
        return matches;
      }),
    ),
  );

const uniqueMatches = (matches: MatchRecord[]): MatchRecord[] => {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.fieldPath}\u0000${match.start ?? ''}\u0000${match.matchedText}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const toEvidence = (rule: LoadedRule, match: MatchRecord, index: number): Evidence => ({
  id: `${rule.ruleId}:${index + 1}`,
  title: '岗位原文命中片段',
  sourceType: 'JOB_TEXT',
  url: 'urn:job-compliance:input:job-posting',
  version: 'submitted',
  fieldPath: match.fieldPath,
  quote: match.matchedText,
  ...(match.start === undefined ? {} : { start: match.start }),
  ...(match.end === undefined ? {} : { end: match.end }),
  sourceId: rule.ruleId,
  sourceName: rule.ruleId,
  sourceVersion: rule.ruleVersion,
});

/** Deterministic rule engine backed by validated YAML rule definitions. */
export class YamlRuleEngine implements RuleEngine {
  private constructor(private readonly rules: LoadedRule[]) {}

  /** Loads all .yml and .yaml rule files from a directory. */
  static async fromDirectory(directory: string): Promise<YamlRuleEngine> {
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const loadedRules = await Promise.all(
      files.map(async (file) => {
        const path = join(directory, file);
        const content = await readFile(path, 'utf8');
        return parseRuleFile(parse(content), path);
      }),
    );
    const rules = loadedRules.flat();
    const duplicateIds = rules
      .map((rule) => `${rule.jurisdiction}:${rule.ruleVersion}:${rule.ruleId}`)
      .filter((key, index, all) => all.indexOf(key) !== index);
    if (duplicateIds.length > 0) {
      throw new TypeError(`Duplicate rule identifiers: ${[...new Set(duplicateIds)].join(', ')}`);
    }
    return new YamlRuleEngine(rules);
  }

  /** Returns the number of loaded rules, including disabled and other-version rules. */
  get ruleCount(): number {
    return this.rules.length;
  }

  /** Scans text and extracted facts using the requested jurisdiction and rule version. */
  evaluate(input: RuleEngineInput): RuleHit[] {
    const jurisdiction = normalizeJurisdiction(input.jurisdiction);
    return this.rules
      .filter(
        (rule) =>
          rule.enabled &&
          rule.jurisdiction === jurisdiction &&
          rule.ruleVersion === input.ruleVersion,
      )
      .flatMap((rule) => {
        const containsMatches =
          rule.containsAny === null ? [] : findContainsMatches(input, rule.containsAny);
        const regexMatches = rule.regex === null ? [] : findRegexMatches(input, rule.regex);
        const matches = uniqueMatches([...containsMatches, ...regexMatches]);
        if (matches.length === 0) return [];
        const evidence = matches.map((match, index) => toEvidence(rule, match, index));
        return [
          {
            ruleId: rule.ruleId,
            ruleVersion: rule.ruleVersion,
            category: rule.category,
            severity: rule.severity,
            decision: rule.decision,
            action: rule.action,
            message: rule.explanation,
            evidence,
            matchedText: [...new Set(matches.map((match) => match.matchedText))],
            matchedConditionIds: [...new Set(matches.map((match) => match.conditionId))],
            ...(rule.suggestion === undefined ? {} : { suggestion: rule.suggestion }),
          } satisfies RuleHit,
        ];
      })
      .sort(
        (left, right) =>
          severityRank[right.severity] - severityRank[left.severity] ||
          left.ruleId.localeCompare(right.ruleId),
      );
  }
}

/** Creates an empty JobFacts value suitable for callers without an extractor yet. */
export function emptyJobFacts(normalizedText: string): JobFacts {
  return {
    jobTitle: '',
    title: '',
    normalizedText,
    responsibilities: [],
    requirements: [],
    locations: [],
    benefits: [],
    sensitiveConditions: [],
    feesOrDeposit: [],
    personalInfoRequests: [],
    unclearClaims: [],
    feeStatements: [],
    personalDataRequests: [],
    missingFields: [],
    attributes: {},
  };
}
