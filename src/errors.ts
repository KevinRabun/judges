/**
 * Custom error hierarchy for the Judges Panel.
 *
 * Provides typed error classes so consumers can catch and handle
 * specific failure modes (config validation, evaluation, parsing)
 * instead of relying on untyped `Error` messages.
 */

// ─── Base Error ──────────────────────────────────────────────────────────────

/**
 * Base error class for all judges errors.
 * Carries a machine-readable `code` for programmatic matching.
 */
export class JudgesError extends Error {
  /** Machine-readable error code, e.g. "JUDGES_CONFIG_INVALID". */
  readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "JudgesError";
    this.code = code;
    // Fix prototype chain for instanceof checks in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Config Errors ───────────────────────────────────────────────────────────

/**
 * Thrown when a `.judgesrc` / inline config is malformed or invalid.
 */
export class ConfigError extends JudgesError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "JUDGES_CONFIG_INVALID", options);
    this.name = "ConfigError";
  }
}

// ─── Evaluation Errors ───────────────────────────────────────────────────────

/**
 * Thrown when an evaluation fails (unknown judge, analyzer crash, etc.).
 */
export class EvaluationError extends JudgesError {
  /** ID of the judge that failed, if applicable. */
  readonly judgeId?: string;

  constructor(message: string, judgeId?: string, options?: ErrorOptions) {
    super(message, "JUDGES_EVALUATION_FAILED", options);
    this.name = "EvaluationError";
    this.judgeId = judgeId;
  }
}

// ─── Parse Errors ────────────────────────────────────────────────────────────

/**
 * Thrown when source code or input data cannot be parsed.
 */
export class ParseError extends JudgesError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, "JUDGES_PARSE_FAILED", options);
    this.name = "ParseError";
  }
}
