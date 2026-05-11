export { loadModelManifest, parseModelManifest, requireModelCapability, resolveModelSpecs } from './models/manifest.js';
export { loadPhaseOneRuntime } from './models/loader.js';
export {
  VerificationError,
  VerificationRuntimeError,
  isVerificationError,
  isVerificationRuntimeError,
  toVerificationError,
} from './errors.js';
export type {
  VerificationErrorArea,
  VerificationErrorCode,
  VerificationErrorDetail,
  VerificationErrorOptions,
} from './errors.js';
export { attachIoMetadata, createOnnxDetectorAdapter, createOnnxMeshAdapter, createOnnxSpoofAdapter } from './onnx/adapters.js';
export {
  validateFaceFit,
} from './face/fit.js';
export {
  FACE_GUIDE_ASPECT_RATIO,
  clampRectToFrame,
  getFaceComparisonBox,
  getFaceGuideRect,
} from './face/geometry.js';
export {
  getAnchorDrift,
  getAnchorPosition,
  isAnchorStable,
} from './face/stability.js';
export { createDetectorPipeline } from './face/detector.js';
export {
  clampLightTestRect,
  createLightPipeline,
  createLightTestTargetColorComparison,
  getLightTestSampleRects,
  getPearsonCorrelation,
  getRgbChromaticity,
  sampleLightTestImageData,
  summarizeLightTestSequence,
} from './light/pipeline.js';
export type {
  CreateLightPipelineOptions,
  LightPipeline,
  LightPipelineFrame,
  LightPipelineUpdate,
} from './light/pipeline.js';
export {
  DEFAULT_LIVENESS_OPTIONS,
  createLivenessChallengeController,
  extractLivenessChallengeMetrics,
  resolveLivenessOptions,
} from './liveness/challenge.js';
export {
  DEFAULT_LIVENESS_CHALLENGES,
  LIVENESS_CHALLENGE_TYPES,
  createLivenessSequence,
  resolveLivenessSequence,
} from './liveness/sequence.js';
export type {
  CreateLivenessChallengeControllerOptions,
  LivenessChallengeController,
} from './liveness/challenge.js';
export type {
  CreateLivenessSequenceOptions,
  LivenessRandomSource,
} from './liveness/sequence.js';
export { createMeshPipeline } from './face/mesh.js';
export {
  createEmptySpoofSummary,
  createSpoofPipeline,
  fuseSpoofScores,
  parseSpoofModelScale,
  softmax,
  summarizeSpoofSamples,
} from './spoof/pipeline.js';
export {
  DEFAULT_LIGHT_SEQUENCE,
  DEFAULT_LIGHT_TEST_COLORS,
  createLightSequence,
  resolveLightSequence,
} from './light/sequence.js';
export type {
  CreateLightSequenceOptions,
  LightRandomSource,
} from './light/sequence.js';
export { loadPhaseOneRuntime as createPhaseOneRuntime } from './models/loader.js';
export type {
  FaceFitOptions,
  LightTestOptions,
  LivenessChallengeOptions,
  ResolvedLivenessChallengeOptions,
  ResolvedLightTestOptions,
} from './config.js';
export type {
  DetectorAdapter,
  DetectorPipeline,
  DetectorRawResult,
  LoadPhaseOneRuntimeOptions,
  MeshAdapter,
  MeshPipeline,
  MeshRawInput,
  MeshRawResult,
  ModelCapability,
  ModelManifest,
  ModelSpec,
  PhaseOneRuntimeBundle,
  ResolvedModelSpec,
  SpoofAdapter,
  SpoofPipeline,
  SpoofRawResult,
  VerificationModelsOptions,
} from './models.js';
export type {
  FaceDetectionResult,
  FaceAnchorDrift,
  FaceAnchorPosition,
  FaceFitResult,
  FaceStabilityResult,
  FaceMeshResult,
  FrameSize,
  LandmarkBounds,
  LandmarkList,
  LightTestChroma,
  LightTestColor,
  LightTestPassChecks,
  LightTestPhase,
  LightTestResult,
  LightTestSample,
  LightTestState,
  LightTestStatus,
  LightTestStepComparison,
  LivenessChallengeDirection,
  LivenessChallengeFrame,
  LivenessChallengeMetrics,
  LivenessChallengePhase,
  LivenessChallengePoseSnapshot,
  LivenessChallengeRecord,
  LivenessChallengeResult,
  LivenessChallengeState,
  LivenessChallengeTelemetry,
  LivenessChallengeType,
  Point3D,
  Rect,
  SpoofFrameResult,
  SpoofLabel,
  SpoofSummaryResult,
  ZRange,
} from './result.js';
