import type {
  AuditDecision,
  Evidence,
  RiskCategory,
  RuntimeSchema,
  Severity,
  ValidationIssue,
} from '@job-compliance/shared';

/** JSON-compatible scalar accepted by a declarative rule condition. */
export type RuleScalar = string | number | boolean | null;

/** Action names accepted by YAML rule files. */
export const ruleActions = [
  'pass',
  'reject',
  'manual_review',
  'allow_with_warning',
  'need_more_info',
] as const;

/** Action requested by a YAML rule before API-level normalization. */
export type RuleAction = (typeof ruleActions)[number];

/** Declarative rule condition that contains no executable code. */
export interface RuleCondition {
  /** Stable condition identifier within the rule. */
  id: string;
  /** Matcher type interpreted by a future rule-engine implementation. */
  type: 'KEYWORD' | 'REGEX' | 'FIELD' | 'ALL' | 'ANY' | 'NOT' | 'SEMANTIC';
  /** Job field paths inspected by the matcher. */
  fields?: string[];
  /** Literal patterns or values supplied to the matcher. */
  values?: RuleScalar[];
  /** Nested conditions used by logical matchers. */
  conditions?: RuleCondition[];
  /** Additional declarative matcher options. */
  options?: Record<string, RuleScalar | RuleScalar[]>;
}

/** Reference to an approved authority associated with a rule. */
export interface RuleAuthorityReference {
  /** Stable authority identifier. */
  authorityId: string;
  /** Specific article, section, or policy clause. */
  article?: string;
  /** Authority version expected by the rule. */
  version?: string;
}

/** Versioned, declarative compliance rule definition. */
export interface RuleDefinition {
  /** Stable rule identifier across compatible revisions. */
  ruleId: string;
  /** Immutable rule revision identifier. */
  ruleVersion: string;
  /** Human-readable rule name. */
  name: string;
  /** Cautious description of the risk covered by the rule. */
  description?: string;
  /** Risk category produced when the rule matches. */
  category: RiskCategory;
  /** Severity produced when the rule matches. */
  severity: Severity;
  /** Recommended decision produced when the rule matches. */
  decision: AuditDecision;
  /** Lowercase action loaded from the YAML rule. */
  action?: RuleAction;
  /** Execution priority from 0 through 1000. */
  priority: number;
  /** Whether the rule is eligible for evaluation. */
  enabled: boolean;
  /** Declarative conditions evaluated by the rule engine. */
  conditions: RuleCondition[];
  /** Whether a match must include source evidence. */
  evidenceRequired: boolean;
  /** Explanation shown when the rule matches. */
  message: string;
  /** Suggested remediation shown when the rule matches. */
  suggestion?: string;
  /** Approved authority references associated with the rule. */
  authorities: RuleAuthorityReference[];
  /** First date on which the rule may be applied. */
  effectiveFrom: string;
  /** Last date on which the rule may be applied. */
  effectiveTo?: string;
  /** Searchable labels used for rule management. */
  tags?: string[];
  /** Team or role responsible for maintaining the rule. */
  owner?: string;
  /** External change ticket or approval reference. */
  changeTicket?: string;
}

/** Traceable result produced when a rule matches an input. */
export interface RuleHit {
  /** Rule identifier that produced the hit. */
  ruleId: string;
  /** Exact rule version that produced the hit. */
  ruleVersion: string;
  /** Risk category copied from the matched rule. */
  category: RiskCategory;
  /** Severity copied from the matched rule. */
  severity: Severity;
  /** Recommended decision copied from the matched rule. */
  decision: AuditDecision;
  /** Lowercase action copied from the matched YAML rule. */
  action: RuleAction;
  /** Explanation associated with the match. */
  message: string;
  /** Evidence supporting the match. */
  evidence: Evidence[];
  /** Unique text fragments that caused the rule to match. */
  matchedText: string[];
  /** Identifiers of the rule conditions that matched. */
  matchedConditionIds: string[];
  /** Suggested remediation associated with the match. */
  suggestion?: string;
  /** Additional trace metadata that is not used as authoritative evidence. */
  metadata?: Record<string, unknown>;
}

const auditDecisions = [
  'PASS',
  'REJECT',
  'MANUAL_REVIEW',
  'ALLOW_WITH_WARNING',
  'NEED_MORE_INFO',
] as const;
const riskCategories = [
  'DISCRIMINATION',
  'FEE_DEPOSIT',
  'PRIVACY',
  'FALSE_OR_MISLEADING',
  'INCOMPLETE_INFORMATION',
  'LABOR_CONTRACT_RISK',
  'PLATFORM_POLICY',
  'OTHER',
] as const;
const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issue = (path: string, message: string): ValidationIssue => ({ path, message });

const createSchema = <T>(
  validate: (input: unknown, path: string) => ValidationIssue[],
): RuntimeSchema<T> => ({
  parse(input: unknown): T {
    const result = this.safeParse(input);
    if (!result.success) {
      const detail = result.issues.map((entry) => `${entry.path}: ${entry.message}`).join('; ');
      throw new TypeError(`Schema validation failed: ${detail}`);
    }
    return result.data;
  },
  safeParse(input: unknown) {
    const issues = validate(input, '$');
    return issues.length === 0 ? { success: true, data: input as T } : { success: false, issues };
  },
});

const validateString = (value: unknown, path: string, required = true): ValidationIssue[] => {
  if (value === undefined && !required) return [];
  return typeof value === 'string' && value.length > 0
    ? []
    : [issue(path, 'expected a non-empty string')];
};

const validateEnum = (
  value: unknown,
  values: readonly string[],
  path: string,
): ValidationIssue[] =>
  typeof value === 'string' && values.includes(value)
    ? []
    : [issue(path, `expected one of: ${values.join(', ')}`)];

const validateStringArray = (value: unknown, path: string): ValidationIssue[] => {
  if (!Array.isArray(value)) return [issue(path, 'expected an array')];
  return value.flatMap((entry, index) => validateString(entry, `${path}[${index}]`));
};

const validateEvidenceArray = (value: unknown, path: string): ValidationIssue[] => {
  if (!Array.isArray(value)) return [issue(path, 'expected an array')];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [issue(`${path}[${index}]`, 'expected an object')];
    return [
      ...validateString(entry.id, `${path}[${index}].id`),
      ...validateString(entry.sourceType, `${path}[${index}].sourceType`),
    ];
  });
};

const validateCondition = (input: unknown, path: string): ValidationIssue[] => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  const nested =
    input.conditions === undefined
      ? []
      : Array.isArray(input.conditions)
        ? input.conditions.flatMap((entry, index) =>
            validateCondition(entry, `${path}.conditions[${index}]`),
          )
        : [issue(`${path}.conditions`, 'expected an array')];
  return [
    ...validateString(input.id, `${path}.id`),
    ...validateEnum(
      input.type,
      ['KEYWORD', 'REGEX', 'FIELD', 'ALL', 'ANY', 'NOT', 'SEMANTIC'],
      `${path}.type`,
    ),
    ...nested,
  ];
};

/** Runtime structural schema for RuleDefinition. */
export const ruleDefinitionSchema = createSchema<RuleDefinition>((input, path) => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  const conditions = Array.isArray(input.conditions)
    ? input.conditions.flatMap((entry, index) =>
        validateCondition(entry, `${path}.conditions[${index}]`),
      )
    : [issue(`${path}.conditions`, 'expected an array')];
  const priority =
    typeof input.priority === 'number' &&
    Number.isInteger(input.priority) &&
    input.priority >= 0 &&
    input.priority <= 1000
      ? []
      : [issue(`${path}.priority`, 'expected an integer from 0 through 1000')];
  const enabled =
    typeof input.enabled === 'boolean' ? [] : [issue(`${path}.enabled`, 'expected a boolean')];
  const evidenceRequired =
    typeof input.evidenceRequired === 'boolean'
      ? []
      : [issue(`${path}.evidenceRequired`, 'expected a boolean')];
  const authorities = Array.isArray(input.authorities)
    ? input.authorities.flatMap((entry, index) =>
        isRecord(entry)
          ? validateString(entry.authorityId, `${path}.authorities[${index}].authorityId`)
          : [issue(`${path}.authorities[${index}]`, 'expected an object')],
      )
    : [issue(`${path}.authorities`, 'expected an array')];
  return [
    ...validateString(input.ruleId, `${path}.ruleId`),
    ...validateString(input.ruleVersion, `${path}.ruleVersion`),
    ...validateString(input.name, `${path}.name`),
    ...validateEnum(input.category, riskCategories, `${path}.category`),
    ...validateEnum(input.severity, severities, `${path}.severity`),
    ...validateEnum(input.decision, auditDecisions, `${path}.decision`),
    ...validateString(input.message, `${path}.message`),
    ...validateString(input.effectiveFrom, `${path}.effectiveFrom`),
    ...priority,
    ...enabled,
    ...evidenceRequired,
    ...conditions,
    ...authorities,
  ];
});

/** Runtime structural schema for RuleHit. */
export const ruleHitSchema = createSchema<RuleHit>((input, path) => {
  if (!isRecord(input)) return [issue(path, 'expected an object')];
  return [
    ...validateString(input.ruleId, `${path}.ruleId`),
    ...validateString(input.ruleVersion, `${path}.ruleVersion`),
    ...validateEnum(input.category, riskCategories, `${path}.category`),
    ...validateEnum(input.severity, severities, `${path}.severity`),
    ...validateEnum(input.decision, auditDecisions, `${path}.decision`),
    ...validateEnum(input.action, ruleActions, `${path}.action`),
    ...validateString(input.message, `${path}.message`),
    ...validateEvidenceArray(input.evidence, `${path}.evidence`),
    ...validateStringArray(input.matchedText, `${path}.matchedText`),
    ...validateStringArray(input.matchedConditionIds, `${path}.matchedConditionIds`),
  ];
});
