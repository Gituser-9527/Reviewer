/** Runtime validation issue returned by a schema. */
export interface ValidationIssue {
  /** Dot-separated path to the invalid value. */
  path: string;
  /** Human-readable validation failure. */
  message: string;
}

/** Successful runtime validation result. */
export interface ValidationSuccess<T> {
  /** Indicates that validation succeeded. */
  success: true;
  /** Structurally validated value. */
  data: T;
}

/** Failed runtime validation result. */
export interface ValidationFailure {
  /** Indicates that validation failed. */
  success: false;
  /** All structural validation issues found in the value. */
  issues: ValidationIssue[];
}

/** Result returned by a non-throwing runtime schema validation. */
export type SafeParseResult<T> = ValidationSuccess<T> | ValidationFailure;

/** Minimal dependency-free runtime schema contract. */
export interface RuntimeSchema<T> {
  /** Validates and returns a value, or throws a TypeError when invalid. */
  parse(input: unknown): T;
  /** Validates a value without throwing. */
  safeParse(input: unknown): SafeParseResult<T>;
}

/** Creates a runtime schema from a structural validator. */
export function createRuntimeSchema<T>(
  validate: (input: unknown, path: string) => ValidationIssue[],
): RuntimeSchema<T> {
  return {
    parse(input: unknown): T {
      const result = this.safeParse(input);
      if (!result.success) {
        const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
        throw new TypeError(`Schema validation failed: ${detail}`);
      }
      return result.data;
    },
    safeParse(input: unknown): SafeParseResult<T> {
      const issues = validate(input, '$');
      return issues.length === 0 ? { success: true, data: input as T } : { success: false, issues };
    },
  };
}
