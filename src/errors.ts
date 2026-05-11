export type VerificationErrorArea =
  | 'analysis'
  | 'camera'
  | 'face'
  | 'light'
  | 'liveness'
  | 'models'
  | 'session'
  | 'spoof'
  | 'unknown';

export type VerificationErrorCode =
  | 'analysis.failed'
  | 'camera.lost'
  | 'camera.permission_denied'
  | 'camera.unavailable'
  | 'face.canvas_unavailable'
  | 'light.invalid_sequence'
  | 'liveness.invalid_challenge'
  | 'models.adapter_invalid'
  | 'models.load_failed'
  | 'models.manifest_invalid'
  | 'models.manifest_load_failed'
  | 'models.required_model_missing'
  | 'session.cancelled'
  | 'session.completed_without_result'
  | 'session.invalid_state'
  | 'spoof.insufficient_evidence'
  | 'spoof.unavailable'
  | 'unknown';

export interface VerificationErrorDetail {
  area: VerificationErrorArea;
  code: VerificationErrorCode;
  message: string;
  recoverable: boolean;
}

export interface VerificationErrorOptions {
  area?: VerificationErrorArea;
  cause?: unknown;
  detail?: Partial<VerificationErrorDetail> | null;
  recoverable?: boolean;
}

const inferAreaFromCode = (code: VerificationErrorCode): VerificationErrorArea => {
  const [area] = code.split('.');

  switch (area) {
    case 'analysis':
    case 'camera':
    case 'face':
    case 'light':
    case 'liveness':
    case 'models':
    case 'session':
    case 'spoof':
      return area;
    default:
      return 'unknown';
  }
};

const createDetail = (
  code: VerificationErrorCode,
  message: string,
  options: VerificationErrorOptions = {},
): VerificationErrorDetail => ({
  area: options.detail?.area ?? options.area ?? inferAreaFromCode(code),
  code: options.detail?.code ?? code,
  message: options.detail?.message ?? message,
  recoverable: options.detail?.recoverable ?? options.recoverable ?? false,
});

export class VerificationError extends Error {
  readonly area: VerificationErrorArea;
  readonly code: VerificationErrorCode;
  readonly detail: VerificationErrorDetail;
  readonly recoverable: boolean;

  constructor(
    code: VerificationErrorCode,
    message: string,
    options: VerificationErrorOptions = {},
  ) {
    const detail = createDetail(code, message, options);
    super(detail.message, { cause: options.cause });
    this.name = 'VerificationError';
    this.area = detail.area;
    this.code = detail.code;
    this.detail = detail;
    this.recoverable = detail.recoverable;
  }
}

export const isVerificationError = (error: unknown): error is VerificationError =>
  error instanceof VerificationError;

export const isVerificationErrorDetail = (value: unknown): value is VerificationErrorDetail => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<VerificationErrorDetail>;
  return typeof candidate.area === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.recoverable === 'boolean' &&
    candidate.message.length > 0;
};

export const toVerificationError = (
  error: unknown,
  fallback: {
    area?: VerificationErrorArea;
    code: VerificationErrorCode;
    message: string;
    recoverable?: boolean;
  },
): VerificationError => {
  if (isVerificationError(error)) {
    return error;
  }

  const message = error instanceof Error && error.message.length > 0
    ? error.message
    : typeof error === 'string' && error.length > 0
      ? error
      : fallback.message;

  return new VerificationError(fallback.code, message, {
    area: fallback.area,
    cause: error,
    recoverable: fallback.recoverable,
  });
};

export class VerificationRuntimeError extends VerificationError {
  constructor(detail: VerificationErrorDetail, options?: { cause?: unknown }) {
    super(detail.code, detail.message, {
      area: detail.area,
      cause: options?.cause,
      detail,
      recoverable: detail.recoverable,
    });
    this.name = 'VerificationRuntimeError';
  }
}

export const isVerificationRuntimeError = (error: unknown): error is VerificationRuntimeError =>
  error instanceof VerificationRuntimeError;
