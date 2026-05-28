import type { VerificationCheck } from '../config.js';
import type { VerificationStage } from '../events.js';

export const VERIFICATION_CHECKS = ['face', 'liveness', 'spoof', 'light'] as const satisfies readonly VerificationCheck[];

export const VERIFICATION_STAGES = [
  'idle',
  'booting',
  'requestingCamera',
  'loadingModels',
  'acquiringFace',
  'stabilizingFace',
  'faceReady',
  'livenessChallenge',
  'lightChallenge',
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly VerificationStage[];

export const getInstructionForStage = (stage: VerificationStage, error?: string | null): string => {
  switch (stage) {
    case 'booting':
      return 'Starting verification';
    case 'requestingCamera':
      return 'Requesting camera permission';
    case 'loadingModels':
      return 'Loading face detector and landmarks';
    case 'acquiringFace':
      return 'Place your face inside the guide';
    case 'stabilizingFace':
      return 'Hold still while we confirm a stable face';
    case 'faceReady':
      return 'Face acquisition complete';
    case 'livenessChallenge':
      return 'Follow the liveness prompt';
    case 'lightChallenge':
      return 'Hold still for the light reflection check';
    case 'completed':
      return 'Face verification complete';
    case 'failed':
      return error?.length ? error : 'Verification failed, please retry';
    case 'cancelled':
      return 'Verification cancelled';
    case 'idle':
    default:
      return 'Allow camera access to start verification';
  }
};

export const isTerminalStage = (stage: VerificationStage): boolean =>
  stage === 'cancelled' || stage === 'completed' || stage === 'failed';
