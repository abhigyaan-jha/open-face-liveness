import type { InspectionEvent, Observer } from 'xstate';

export type VerificationFailureCode =
  | 'model_load_failed'
  | 'required_check_unavailable'
  | 'required_check_missing'
  | 'required_check_failed'
  | 'insufficient_evidence';

export type VerificationFailureCheck =
  | 'face'
  | 'liveness'
  | 'spoof'
  | 'light'
  | 'face_match';

export interface VerificationFailureDetail {
  check: VerificationFailureCheck;
  code: VerificationFailureCode;
  message: string;
}
export type ModelCapability = 'detector' | 'light' | 'liveness' | 'mesh' | 'spoof';
export type RuntimeVerificationCheck = 'face' | 'light' | 'liveness' | 'spoof';

export interface Rect {
  height: number;
  label?: string;
  width: number;
  x: number;
  y: number;
}

export interface LandmarkBounds {
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ZRange {
  max: number;
  min: number;
  span: number;
}

export interface ModelSpec {
  capability: ModelCapability;
  format: 'onnx';
  id: string;
  required: boolean;
  url: string;
  version?: string;
}

export interface ModelManifest {
  models: ModelSpec[];
  version: number;
}

export interface ResolvedModelSpec extends ModelSpec {
  inputs?: string[];
  outputs?: string[];
}

export interface VerificationModelsOptions {
  manifestUrl: string;
  overrides?: Partial<Record<ModelCapability, string>>;
}

export interface FrameSize {
  height: number;
  width: number;
}

export interface FaceDetectionResult {
  box: Rect;
  runMs: number;
  score: number;
}

export type LandmarkList = Float32Array | readonly number[];

export interface FaceMeshResult {
  bounds: LandmarkBounds;
  centroid: Point3D;
  crop: Rect;
  frameHeight: number;
  frameWidth: number;
  landmarkCount: number;
  landmarks: LandmarkList;
  runMs: number;
  score: number;
  visibleLandmarks: number;
  zRange: ZRange;
}

export interface FaceFitOptions {
  cameraZoom: number;
  guideContainmentTolerancePx: number;
  guideMaxHorizontalOverflowRatio: number;
  guideMaxVerticalOverflowRatio: number;
  guideMinHeightFillRatio: number;
  guideMinInsideAreaRatio: number;
  guideMinWidthFillRatio: number;
  guideRelaxedCenterMarginRatio: number;
  roiExpandFactor: number;
  stabilizationDurationMs: number;
  stabilityDistanceIncreaseThreshold: number;
  stabilityMovementThreshold: number;
  stabilityVerticalMovementThreshold: number;
}

export interface FaceFitResult {
  comparisonBox: Rect | null;
  guideBox: Rect | null;
  heightFillRatio: number | null;
  horizontalOverflowRatio: number | null;
  insideAreaRatio: number | null;
  isAligned: boolean;
  isCenterWithinRelaxedBounds: boolean;
  isCentered: boolean;
  isContainedHorizontally: boolean;
  isContainedVertically: boolean;
  isFaceLargeEnough: boolean;
  isOverflowWithinBounds: boolean;
  verticalOverflowRatio: number | null;
  widthFillRatio: number | null;
}

export interface FaceAnchorPosition {
  width: number;
  x: number;
  y: number;
}

export interface FaceAnchorDrift {
  deltaX: number;
  deltaY: number;
  distanceIncreaseRatio: number;
  widthDelta: number;
}

export interface FaceStabilityResult {
  anchorDrift: FaceAnchorDrift | null;
  anchorPosition: FaceAnchorPosition | null;
  isStable: boolean;
  progress: number;
  requiredMs: number;
  stableMs: number;
}

export type LivenessChallengeType =
  | 'head_pan_left'
  | 'head_pan_right'
  | 'head_pitch_up'
  | 'head_pitch_down'
  | 'mouth_open';

export type LivenessChallengePhase =
  | 'idle'
  | 'stabilizing'
  | 'active'
  | 'celebrating'
  | 'recentering'
  | 'complete';

export type LivenessChallengeDirection = 'down' | 'left' | 'none' | 'right' | 'up';

export interface LivenessChallengeOptions {
  activeDistanceIncreaseThreshold?: number;
  activeMovementThreshold?: number;
  activeVerticalMovementThreshold?: number;
  celebrationDurationMs?: number;
  challengeCount?: number;
  challengeMouthOpenRatio?: number;
  challengePitchLimit?: number;
  challengeTypes?: readonly LivenessChallengeType[];
  challengeYawLimit?: number;
  ejectionDebounceMs?: number;
  mouthDwellMs?: number;
  neutralAbsolutePitchLimit?: number;
  neutralAbsoluteRollLimit?: number;
  neutralAbsoluteYawLimit?: number;
  neutralEjectionPitchLimit?: number;
  neutralEjectionRollLimit?: number;
  neutralEjectionYawLimit?: number;
  neutralMouthOpenRatio?: number;
  panDwellMs?: number;
  pitchDwellMs?: number;
  recenterGracePeriodMs?: number;
  recenterTimeoutMs?: number;
  smoothingAlpha?: number;
  stabilityPoseThreshold?: number;
  stabilityThreshold?: number;
  stabilizationDurationMs?: number;
}

export interface ResolvedLivenessChallengeOptions {
  activeDistanceIncreaseThreshold: number;
  activeMovementThreshold: number;
  activeVerticalMovementThreshold: number;
  celebrationDurationMs: number;
  challengeCount: number;
  challengeMouthOpenRatio: number;
  challengePitchLimit: number;
  challengeTypes: readonly LivenessChallengeType[];
  challengeYawLimit: number;
  ejectionDebounceMs: number;
  mouthDwellMs: number;
  neutralAbsolutePitchLimit: number;
  neutralAbsoluteRollLimit: number;
  neutralAbsoluteYawLimit: number;
  neutralEjectionPitchLimit: number;
  neutralEjectionRollLimit: number;
  neutralEjectionYawLimit: number;
  neutralMouthOpenRatio: number;
  panDwellMs: number;
  pitchDwellMs: number;
  recenterGracePeriodMs: number;
  recenterTimeoutMs: number;
  smoothingAlpha: number;
  stabilityPoseThreshold: number;
  stabilityThreshold: number;
  stabilizationDurationMs: number;
}

export interface LivenessChallengeMetrics {
  mouthRatio: number;
  pitch: number;
  roll: number;
  yaw: number;
}

export interface LivenessChallengePoseSnapshot {
  mouthRatio: number | null;
  pitch: number | null;
  roll: number | null;
  yaw: number | null;
}

export interface LivenessChallengeRecord {
  challenge: LivenessChallengeType;
  completedAt: number;
  final: LivenessChallengePoseSnapshot;
  start: LivenessChallengePoseSnapshot;
  startedAt: number;
}

export type LivenessSelfieCheckpoint = 1 | 2 | 3;

export interface LivenessChallengePlan {
  challengeId: string;
  checksum: string;
  nonce: string;
  policyVersion: string;
  selfieCheckpoint: LivenessSelfieCheckpoint;
  sequence: readonly LivenessChallengeType[];
}

export interface LivenessChallengeFrame {
  anchorPosition: FaceAnchorPosition | null;
  faceFit: FaceFitResult | null;
  metrics: LivenessChallengeMetrics | null;
  timestamp: number;
}

export interface LivenessChallengeState {
  challengeId: string;
  checksum: string;
  completedChallenges: readonly LivenessChallengeType[];
  currentChallenge: LivenessChallengeType | null;
  currentStep: number;
  direction: LivenessChallengeDirection;
  instruction: string;
  nonce: string;
  phase: LivenessChallengePhase;
  policyVersion: string;
  progress: number;
  selfieCheckpoint: LivenessSelfieCheckpoint | null;
  sequence: readonly LivenessChallengeType[];
  totalSteps: number;
}

export interface LivenessChallengeTelemetry {
  maxAbsPitch: number;
  maxAbsRoll: number;
  maxAbsYaw: number;
  maxMouthRatio: number;
  sessionDurationMs: number;
}

export interface LivenessChallengeResult {
  challengeRecords: readonly LivenessChallengeRecord[];
  challengeId: string;
  checksum: string;
  completedAt: number;
  completedChallenges: readonly LivenessChallengeType[];
  nonce: string;
  policyVersion: string;
  selfieCheckpoint: LivenessSelfieCheckpoint;
  sequence: readonly LivenessChallengeType[];
  telemetry: LivenessChallengeTelemetry;
}

export interface LightTestColor {
  css: string;
  id: string;
  label: string;
  rgb: readonly [number, number, number];
}

export type LightTestPhase = 'idle' | 'baseline' | 'color-wait' | 'complete';
export type LightTestStatus = 'failed' | 'inconclusive' | 'passed';

export interface LightTestChroma {
  blue: number;
  green: number;
  red: number;
  vector: readonly [number, number, number];
}

export interface LightTestOptions {
  ambientValueWashoutThreshold?: number;
  colorSequenceLength?: number;
  colorSettleMs?: number;
  colors?: readonly LightTestColor[];
  maxProcessingWidth?: number;
  minColorDirectionSimilarity?: number;
  minColorResponseMagnitude?: number;
  minColorSequenceScore?: number;
  minSamplePixels?: number;
  opencvAssetBaseUrl?: string;
  opencvReadyTimeoutMs?: number;
  opencvWorkerUrl?: string;
  stableDurationMs?: number;
  stabilityThreshold?: number;
}

export interface ResolvedLightTestOptions {
  ambientValueWashoutThreshold: number;
  colorSequenceLength: number;
  colorSettleMs: number;
  colors: readonly LightTestColor[];
  maxProcessingWidth: number;
  minColorDirectionSimilarity: number;
  minColorResponseMagnitude: number;
  minColorSequenceScore: number;
  minSamplePixels: number;
  opencvAssetBaseUrl: string;
  opencvReadyTimeoutMs: number;
  opencvWorkerUrl: string | null;
  stableDurationMs: number;
  stabilityThreshold: number;
}

export interface LightTestSample {
  averageBlue: number | null;
  averageGreen: number | null;
  averageHue?: number | null;
  averageHueDegrees?: number | null;
  averageHueOpenCv?: number | null;
  averageRed: number | null;
  averageSaturation: number | null;
  averageValue: number | null;
  chroma: LightTestChroma | null;
  skippedPixels: number;
  sampledPixels: number;
  sampleRects: readonly Rect[];
  statusMessage?: string;
  totalPixels: number;
  usableRegionCount: number;
}

export interface LightTestPassChecks {
  colorDirection: boolean;
  colorResponse: boolean;
  sampledPixels: boolean;
}

export interface LightTestStepComparison {
  afterChroma: LightTestChroma | null;
  baselineChroma: LightTestChroma | null;
  color: LightTestColor;
  colorDirectionSimilarity?: number | null;
  expectedHueDegrees?: number | null;
  expectedHueOpenCv?: number | null;
  hsvExpectedVector?: readonly [number, number] | null;
  hsvObservedVector?: readonly [number, number] | null;
  hsvResponseMagnitude?: number | null;
  hsvStepScore?: number | null;
  index: number;
  matchScore: number;
  observedDelta: readonly [number, number, number];
  passChecks: LightTestPassChecks;
  passed: boolean;
  responseMagnitude: number;
  sampledPixelsAfter: number;
  sampledPixelsBefore: number;
  status: LightTestStatus;
  statusMessage?: string;
}

export interface LightTestState {
  activeColor: LightTestColor | null;
  baselineSample: LightTestSample | null;
  colorIndex: number;
  completed: boolean;
  instruction: string;
  matchedSteps: number;
  passed: boolean;
  phase: LightTestPhase;
  progress: number;
  resultMessage: string;
  sampleRects: readonly Rect[];
  sequence: readonly LightTestColor[];
  sequenceAverageScore: number | null;
  sequenceCorrelation: number | null;
  sequenceResponseMagnitude: number | null;
  totalSteps: number;
}

export interface LightTestResult {
  baseline: LightTestSample | null;
  completedAt: number;
  matchedSteps: number;
  passed: boolean;
  resultMessage: string;
  sequence: readonly LightTestColor[];
  sequenceAverageScore: number | null;
  sequenceCorrelation: number | null;
  sequenceResponseMagnitude: number | null;
  status: LightTestStatus;
  steps: readonly LightTestStepComparison[];
}

export type SpoofLabel = 'paper' | 'real' | 'screen';

export interface SpoofFrameResult {
  confidence: number;
  label: SpoofLabel;
  labelIndex: number;
  modelsUsed: number;
  paperScore: number;
  realScore: number;
  runMs: number;
  screenScore: number;
}

export interface SpoofSummaryResult {
  averageConfidence: number | null;
  averagePaperScore: number | null;
  averageRealScore: number | null;
  averageScreenScore: number | null;
  medianConfidence: number | null;
  medianPaperScore: number | null;
  medianRealScore: number | null;
  medianScreenScore: number | null;
  modelsUsed: number;
  realFrameRatio: number | null;
  sampleCount: number;
  skippedSampleCount: number;
}

export interface DetectorRawResult {
  boxes: Float32Array;
  runMs: number;
  scores: Float32Array;
}

export interface MeshRawInput {
  crop: Rect;
  image: Float32Array;
}

export interface MeshRawResult {
  landmarks: Float32Array;
  runMs: number;
  score: number;
}

export interface SpoofRawResult {
  logits: Float32Array;
  runMs: number;
}

export interface DetectorAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  dispose(): Promise<void>;
  run(input: Float32Array): Promise<DetectorRawResult>;
}

export interface MeshAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  dispose(): Promise<void>;
  run(input: MeshRawInput): Promise<MeshRawResult | null>;
}

export interface SpoofAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  readonly model: ResolvedModelSpec;
  dispose(): Promise<void>;
  run(input: Float32Array): Promise<SpoofRawResult | null>;
}

export interface DetectorPipeline {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  destroy(): Promise<void>;
  detect(video: HTMLVideoElement): Promise<FaceDetectionResult | null>;
}

export interface MeshPipeline {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  destroy(): Promise<void>;
  estimate(
    video: HTMLVideoElement,
    detection: FaceDetectionResult,
    options: { roiExpandFactor: number },
  ): Promise<FaceMeshResult | null>;
}

export interface SpoofPipeline {
  readonly metadata: {
    models: Array<{
      id: string;
      inputs: string[];
      outputs: string[];
    }>;
  };
  analyze(video: HTMLVideoElement, detection: FaceDetectionResult): Promise<SpoofFrameResult | null>;
  destroy(): Promise<void>;
}

export interface PhaseOneRuntimeBundle {
  destroy(): Promise<void>;
  detector: DetectorPipeline;
  mesh: MeshPipeline;
  models: ResolvedModelSpec[];
  spoof: SpoofPipeline | null;
}

export interface LoadPhaseOneRuntimeOptions {
  checks?: readonly RuntimeVerificationCheck[];
  models: VerificationModelsOptions;
}

export type VerificationCheck = 'face' | 'light' | 'liveness' | 'spoof';

export type VerificationActorInspect = Observer<InspectionEvent> | ((inspectionEvent: InspectionEvent) => void);

export type VerificationStage =
  | 'idle'
  | 'booting'
  | 'requestingCamera'
  | 'loadingModels'
  | 'acquiringFace'
  | 'stabilizingFace'
  | 'faceReady'
  | 'livenessChallenge'
  | 'lightChallenge'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DebugOptions {
  drawBoundingBox?: boolean;
  drawGuide?: boolean;
  drawLandmarks?: boolean;
  events?: boolean;
  overlay?: boolean;
  throttleMs?: number;
  timings?: boolean;
}

export interface ResolvedDebugOptions {
  drawBoundingBox: boolean;
  drawGuide: boolean;
  drawLandmarks: boolean;
  enabled: boolean;
  events: boolean;
  overlay: boolean;
  throttleMs: number;
  timings: boolean;
}

export interface ResolvedVerificationOptions<TVideo = unknown> {
  challengePlan: LivenessChallengePlan | null;
  checks: readonly VerificationCheck[];
  debug: ResolvedDebugOptions;
  face: FaceFitOptions;
  light: ResolvedLightTestOptions;
  liveness: ResolvedLivenessChallengeOptions;
  models: VerificationModelsOptions;
  primarySelfie: ResolvedPrimarySelfieOptions;
  video: TVideo;
}

export interface PrimarySelfieOptions {
  required?: boolean;
}

export interface ResolvedPrimarySelfieOptions {
  required: boolean;
}

export interface VerificationOptions<TVideo = unknown> {
  challengePlan?: LivenessChallengePlan;
  checks?: readonly VerificationCheck[];
  debug?: boolean | DebugOptions;
  face?: Partial<FaceFitOptions>;
  light?: LightTestOptions;
  liveness?: LivenessChallengeOptions;
  models: VerificationModelsOptions;
  primarySelfie?: PrimarySelfieOptions;
  video: TVideo;
  xstateInspect?: VerificationActorInspect;
}

export interface FrameTimings {
  detectorMs: number | null;
  frameMs: number | null;
  meshMs: number | null;
  spoofMs: number | null;
}

export interface DiagnosticsFrame {
  detection: FaceDetectionResult | null;
  faceFit: FaceFitResult | null;
  frameIndex: number;
  frameSize: FrameSize;
  light: LightTestState | null;
  livenessMetrics: LivenessChallengeMetrics | null;
  mesh: FaceMeshResult | null;
  spoof: SpoofFrameResult | null;
  stability: FaceStabilityResult | null;
  stage: VerificationStage;
  timestamp: number;
  timings: FrameTimings;
}

export interface FaceVerificationResult {
  completedAt: number;
  detection: FaceDetectionResult;
  faceFit: FaceFitResult;
  mesh: FaceMeshResult;
  stability: FaceStabilityResult;
}

export interface PrimarySelfieCapture {
  capturedAt: number;
  checkpoint: LivenessSelfieCheckpoint;
  frameSize: FrameSize;
  imageDataUrl: string;
}

export interface EvidenceTranscriptChallenge {
  challengeId: string;
  checksum: string;
  nonce: string;
  policyVersion: string;
  selfieCheckpoint: LivenessSelfieCheckpoint;
  sequence: readonly LivenessChallengeType[];
}

export interface EvidenceTranscriptCaptureQuality {
  detectionScore: number | null;
  faceAligned: boolean;
  faceDetected: boolean;
  faceStable: boolean;
  faceWithinBounds: boolean;
  landmarksDetected: boolean;
  visibleLandmarks: number | null;
}

export interface EvidenceTranscriptCapture {
  capturedAt: number;
  checkpoint: LivenessSelfieCheckpoint;
  frameIndex: number;
  frameSize: FrameSize;
  quality: EvidenceTranscriptCaptureQuality;
}

export interface EvidenceTranscript {
  capture: EvidenceTranscriptCapture;
  challenge: EvidenceTranscriptChallenge;
  primarySelfie: PrimarySelfieCapture;
}

export interface VerificationResult {
  checks: readonly VerificationCheck[];
  completedAt: number;
  evidenceTranscript: EvidenceTranscript | null;
  face: FaceVerificationResult | null;
  light: LightTestResult | null;
  liveness: LivenessChallengeResult | null;
  primarySelfie: PrimarySelfieCapture | null;
  spoof: SpoofSummaryResult | null;
}

export interface CameraStreamInfo {
  zoomApplied: number | null;
  zoomSupported: boolean | null;
}

export interface VerificationAnalysisPayload {
  detection?: FaceDetectionResult | null;
  diagnostics?: DiagnosticsFrame | null;
  evidenceTranscript?: EvidenceTranscript | null;
  faceFit?: FaceFitResult | null;
  light?: LightTestState | null;
  lightResult?: LightTestResult | null;
  mesh?: FaceMeshResult | null;
  primarySelfie?: PrimarySelfieCapture | null;
  spoof?: SpoofFrameResult | null;
  spoofSummary?: SpoofSummaryResult | null;
  stability?: FaceStabilityResult | null;
}

export type VerificationSessionEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'RESET' }
  | { streamInfo: CameraStreamInfo; type: 'CAMERA_GRANTED' }
  | { error: string; failureDetail?: VerificationFailureDetail | null; type: 'CAMERA_DENIED' }
  | { error: string; failureDetail?: VerificationFailureDetail | null; type: 'CAMERA_LOST' }
  | { models: ResolvedModelSpec[]; type: 'MODELS_READY' }
  | { error: string; failureDetail?: VerificationFailureDetail | null; type: 'MODELS_FAILED' }
  | ({ type: 'FACE_FOUND' } & VerificationAnalysisPayload)
  | ({ type: 'FACE_LOST' } & VerificationAnalysisPayload)
  | ({ type: 'FACE_ALIGNED' } & VerificationAnalysisPayload)
  | ({ type: 'FACE_MISALIGNED' } & VerificationAnalysisPayload)
  | ({ type: 'FACE_STABLE' } & VerificationAnalysisPayload)
  | ({ type: 'FACE_UNSTABLE' } & VerificationAnalysisPayload)
  | ({ liveness: LivenessChallengeState; type: 'LIVENESS_PROGRESS' } & VerificationAnalysisPayload)
  | ({ liveness: LivenessChallengeState; result: LivenessChallengeResult; type: 'LIVENESS_COMPLETED' } & VerificationAnalysisPayload)
  | ({ light: LightTestState; type: 'LIGHT_PROGRESS' } & VerificationAnalysisPayload)
  | ({ light: LightTestState; result: LightTestResult; type: 'LIGHT_COMPLETED' } & VerificationAnalysisPayload)
  | ({ type: 'DEBUG_FRAME' } & VerificationAnalysisPayload)
  | { error: string; failureDetail?: VerificationFailureDetail | null; type: 'ERROR' };

export type VerificationEvent = VerificationSessionEvent;

export interface VerificationContext<TVideo = unknown> {
  checks: readonly VerificationCheck[];
  completedAt: number | null;
  debug: ResolvedDebugOptions;
  detection: FaceDetectionResult | null;
  diagnostics: DiagnosticsFrame | null;
  evidenceTranscript: EvidenceTranscript | null;
  error: string | null;
  failureDetail: VerificationFailureDetail | null;
  faceFit: FaceFitResult | null;
  instruction: string;
  lastEvent: VerificationSessionEvent | null;
  light: LightTestState | null;
  lightResult: LightTestResult | null;
  liveness: LivenessChallengeState | null;
  livenessResult: LivenessChallengeResult | null;
  mesh: FaceMeshResult | null;
  models: ResolvedModelSpec[];
  options: ResolvedVerificationOptions<TVideo>;
  primarySelfie: PrimarySelfieCapture | null;
  result: VerificationResult | null;
  spoof: SpoofFrameResult | null;
  spoofSummary: SpoofSummaryResult | null;
  stage: VerificationStage;
  stability: FaceStabilityResult | null;
  streamInfo: CameraStreamInfo | null;
  startedAt: number | null;
}

export type VerificationSnapshot<TVideo = unknown> = VerificationContext<TVideo>;
