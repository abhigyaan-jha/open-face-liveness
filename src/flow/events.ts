import type { VerificationSessionEvent } from '../types.js';

export const VERIFICATION_EVENT_TYPES = [
  'START',
  'STOP',
  'RESET',
  'CAMERA_GRANTED',
  'CAMERA_DENIED',
  'CAMERA_LOST',
  'MODELS_READY',
  'MODELS_FAILED',
  'FACE_FOUND',
  'FACE_LOST',
  'FACE_ALIGNED',
  'FACE_MISALIGNED',
  'FACE_STABLE',
  'FACE_UNSTABLE',
  'LIVENESS_PROGRESS',
  'LIVENESS_COMPLETED',
  'LIGHT_PROGRESS',
  'LIGHT_COMPLETED',
  'DEBUG_FRAME',
  'ERROR',
] as const satisfies readonly VerificationSessionEvent['type'][];
