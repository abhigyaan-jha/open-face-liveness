export { defaultConfig, resolveConfig } from './config.js';
export type {
  CheckConfig,
  DebugConfig,
  ModelConfig,
  WebVerifyConfig,
  WebVerifyUserConfig,
} from './config.js';
export { WebVerify } from './web-verify.js';
export * from './runtime.js';
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
  VerificationCheck,
  VerificationFailureDetail,
  VerificationOptions,
  VerificationResult,
  VerificationSnapshot,
  VerificationStage,
} from './types.js';
