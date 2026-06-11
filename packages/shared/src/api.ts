export interface HealthResponse {
  /** Service identifier. */
  service: string;
  /** Current service health. */
  status: 'ok';
  /** Time at which health was evaluated. */
  timestamp: string;
}

export interface ApiErrorResponse {
  /** Request correlation identifier. */
  requestId: string;
  /** Public error details safe to return to callers. */
  error: {
    /** Stable machine-readable error code. */
    code: string;
    /** Human-readable error summary. */
    message: string;
    /** Whether retrying the same request may succeed. */
    retryable: boolean;
  };
}
