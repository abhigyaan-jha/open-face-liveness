export { defaultConfig, resolveConfig } from './config.js';
export type {
  CheckConfig,
  DebugConfig,
  ModelConfig,
  VerificationCheck,
  WebVerifyConfig,
  WebVerifyUserConfig,
} from './config.js';
export { emptyResult } from './result.js';
export type {
  FaceResult,
  LightResult,
  LivenessResult,
  Point3D,
  Rect,
  SpoofResult,
  VerificationResult,
} from './result.js';
export { loadModelManifest, parseModelManifest } from './models.js';
export type { ModelCapability, ModelManifest, ModelSpec } from './models.js';
export { defaultLivenessChallengeTypes, runLivenessCheck } from './liveness/index.js';
export type { LivenessChallengeType, LivenessCheckOptions } from './liveness/index.js';
export { WebVerify } from './web-verify.js';
