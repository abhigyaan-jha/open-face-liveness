export { defaultConfig, resolveConfig } from './config.js';
export type {
  CheckConfig,
  DebugConfig,
  DebugOptions,
  FaceFitOptions,
  LightTestOptions,
  LivenessChallengeOptions,
  ModelConfig,
  ResolvedDebugOptions,
  ResolvedLightTestOptions,
  ResolvedLivenessChallengeOptions,
  ResolvedVerificationOptions,
  RuntimeVerificationCheck,
  VerificationActorInspect,
  VerificationCheck,
  VerificationOptions,
  WebVerifyConfig,
  WebVerifyUserConfig,
} from './config.js';
export { WebVerify, createWebVerifyClient } from './web-verify.js';
export type {
  WebVerifyCheckSelection,
  WebVerifyClient,
  WebVerifyLoadOptions,
  WebVerifyStartOptions,
} from './web-verify.js';
export { createLightSequence } from './light/sequence.js';
export type { CreateLightSequenceOptions } from './light/sequence.js';
export { createLivenessSequence } from './liveness/sequence.js';
export type { CreateLivenessSequenceOptions } from './liveness/sequence.js';
export {
  createVerificationSession,
  resolveDebugOptions,
  resolveLightOptions,
  resolveVerificationOptions,
} from './flow/index.js';
export type {
  VerificationSession,
  WebVerificationSnapshot,
} from './flow/index.js';
export type {
  VerificationSnapshot,
  VerificationStage,
} from './events.js';
export {
  VerificationError,
  isVerificationError,
  toVerificationError,
} from './errors.js';
export type {
  VerificationErrorArea,
  VerificationErrorCode,
  VerificationErrorDetail,
  VerificationErrorOptions,
} from './errors.js';
export type { VerificationResult } from './result.js';
