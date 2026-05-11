import type { VerificationFailureDetail } from './types.js';

export type VerificationErrorCode =
  | 'analysis.failed'
  | 'camera.lost'
  | 'camera.permission_denied'
  | 'camera.unavailable'
  | 'models.load_failed'
  | 'unknown';

export class VerificationRuntimeError extends Error {
  readonly detail: VerificationFailureDetail;

  constructor(
    detail: VerificationFailureDetail,
    options?: { cause?: unknown },
  ) {
    super(detail.message, options);
    this.name = 'VerificationRuntimeError';
    this.detail = detail;
  }
}

export const isVerificationRuntimeError = (error: unknown): error is VerificationRuntimeError =>
  error instanceof VerificationRuntimeError;

export class VerificationError extends Error {
  readonly code: VerificationErrorCode;
  readonly detail: VerificationFailureDetail | null;

  constructor(
    code: VerificationErrorCode,
    message: string,
    options?: { cause?: unknown; detail?: VerificationFailureDetail | null },
  ) {
    super(message, options);
    this.name = 'VerificationError';
    this.code = code;
    this.detail = options?.detail ?? null;
  }
}

export const isVerificationError = (error: unknown): error is VerificationError =>
  error instanceof VerificationError;

