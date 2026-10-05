import type { VerificationCheck } from './config.js';

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

export interface FaceBlendshapeResult {
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  jawOpen: number;
  mouthClose: number;
  runMs: number;
  scores: Float32Array;
}

export interface FacePoseResult {
  matrix: readonly number[];
  pitch: number;
  roll: number;
  yaw: number;
}

export interface FaceGeometryResult {
  anchorBox: Rect | null;
  fitBox: Rect | null;
  pose: FacePoseResult | null;
}

export interface FaceMeshResult {
  blendshapes: FaceBlendshapeResult;
  bounds: LandmarkBounds;
  centroid: Point3D;
  crop: Rect;
  frameHeight: number;
  frameWidth: number;
  geometry: FaceGeometryResult;
  landmarkCount: number;
  landmarks: LandmarkList;
  runMs: number;
  score: number;
  visibleLandmarks: number;
  zRange: ZRange;
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

export interface LivenessChallengeMetrics {
  mouthClose: number;
  mouthRatio: number;
  pitch: number;
  roll: number;
  yaw: number;
}

export interface LivenessChallengePoseSnapshot {
  mouthClose: number | null;
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

export interface LivenessChallengeFrame {
  anchorPosition: FaceAnchorPosition | null;
  faceFit: FaceFitResult | null;
  metrics: LivenessChallengeMetrics | null;
  timestamp: number;
}

export interface LivenessChallengeState {
  completedChallenges: readonly LivenessChallengeType[];
  currentChallenge: LivenessChallengeType | null;
  currentStep: number;
  direction: LivenessChallengeDirection;
  instruction: string;
  phase: LivenessChallengePhase;
  progress: number;
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
  completedAt: number;
  completedChallenges: readonly LivenessChallengeType[];
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

export interface LightTestSample {
  averageBlue: number | null;
  averageGreen: number | null;
  averageHue?: number | null;
  averageHueDegrees?: number | null;
  /** Hue on OpenCV's 8-bit scale, 0-180 (degrees / 2). */
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
  /** Hue on OpenCV's 8-bit scale, 0-180 (degrees / 2). */
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

export interface FaceVerificationResult {
  completedAt: number;
  detection: FaceDetectionResult;
  faceFit: FaceFitResult;
  mesh: FaceMeshResult;
  stability: FaceStabilityResult;
}

export interface VerificationResult {
  checks: readonly VerificationCheck[];
  completedAt: number;
  face: FaceVerificationResult | null;
  light: LightTestResult | null;
  liveness: LivenessChallengeResult | null;
  spoof: SpoofSummaryResult | null;
}
