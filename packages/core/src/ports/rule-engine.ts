import type { JobFacts } from '@job-compliance/shared';
import type { RuleHit } from '../rules/types.js';

/** Input scanned by the YAML rule engine. */
export interface RuleEngineInput {
  /** Original unmodified job text. */
  rawText: string;
  /** Normalized job text used for resilient matching. */
  normalizedText: string;
  /** Structured facts extracted before rule evaluation. */
  extractedFacts: JobFacts;
  /** Jurisdiction used to select a rule set. */
  jurisdiction: string;
  /** Exact rule version requested by the audit. */
  ruleVersion: string;
}

/** Port implemented by deterministic compliance rule engines. */
export interface RuleEngine {
  /** Scans the supplied text and facts and returns all matching rules. */
  evaluate(input: RuleEngineInput): RuleHit[];
}
