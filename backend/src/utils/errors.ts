/**
 * Domain error types.
 *
 * Every error surfaced to the HTTP layer must be one of these. The error
 * middleware maps `code` → HTTP status and produces the uniform response
 * shape defined in the API contract.
 *
 * Raw errors from `simple-git`, `fs`, etc. must be wrapped before being
 * rethrown so we never leak stack traces or filesystem paths to clients.
 */

export type AppErrorCode =
  | 'INVALID_REPO_URL'
  | 'CLONE_FAILED'
  | 'REPO_TOO_LARGE'
  | 'SCAN_FAILED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'AI_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_RATE_LIMITED'
  | 'AI_FAILED';

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly publicMessage: string;

  constructor(code: AppErrorCode, status: number, publicMessage: string, cause?: unknown) {
    super(publicMessage);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.publicMessage = publicMessage;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export class InvalidRepoUrlError extends AppError {
  constructor(message = 'Only public GitHub HTTPS repository URLs are supported.') {
    super('INVALID_REPO_URL', 400, message);
    this.name = 'InvalidRepoUrlError';
  }
}

export class CloneFailedError extends AppError {
  constructor(message = 'Failed to clone the repository. It may be private or unavailable.', cause?: unknown) {
    super('CLONE_FAILED', 502, message, cause);
    this.name = 'CloneFailedError';
  }
}

export class RepoTooLargeError extends AppError {
  constructor(message = 'Repository is too large to analyze in Phase 1.', cause?: unknown) {
    super('REPO_TOO_LARGE', 413, message, cause);
    this.name = 'RepoTooLargeError';
  }
}

export class ScanFailedError extends AppError {
  constructor(message = 'Failed to scan the repository contents.', cause?: unknown) {
    super('SCAN_FAILED', 500, message, cause);
    this.name = 'ScanFailedError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super('NOT_FOUND', 404, message);
    this.name = 'NotFoundError';
  }
}

export class AiNotConfiguredError extends AppError {
  constructor(message = 'AI summaries are not configured on this server.') {
    super('AI_NOT_CONFIGURED', 503, message);
    this.name = 'AiNotConfiguredError';
  }
}

export class AiTimeoutError extends AppError {
  constructor(message = 'The AI provider timed out. Try again shortly.', cause?: unknown) {
    super('AI_TIMEOUT', 504, message, cause);
    this.name = 'AiTimeoutError';
  }
}

export class AiRateLimitedError extends AppError {
  constructor(message = 'The AI provider rate-limited this request. Try again shortly.', cause?: unknown) {
    super('AI_RATE_LIMITED', 429, message, cause);
    this.name = 'AiRateLimitedError';
  }
}

export class AiFailedError extends AppError {
  constructor(message = 'Failed to generate an architecture overview.', cause?: unknown) {
    super('AI_FAILED', 502, message, cause);
    this.name = 'AiFailedError';
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;
