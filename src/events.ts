import type {
  ResolvedDebugOptions,
  ResolvedVerificationOptions,
  VerificationCheck,
} from './config.js';
import type { VerificationErrorDetail } from './errors.js';
import type { ResolvedModelSpec } from './models.js';
import type {
  FaceDetectionResult,
  FaceFitResult,
  FaceMeshResult,
  FaceStabilityResult,
  FrameSize,
  LightTestResult,
  LightTestState,
  LivenessChallengeMetrics,
  LivenessChallengeResult,
  LivenessChallengeState,
  SpoofFrameResult,
  SpoofSummaryResult,
  VerificationResult,
} from './result.js';

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

export interface CameraStreamInfo {
  zoomApplied: number | null;
  zoomSupported: boolean | null;
}

export interface VerificationAnalysisPayload {
  detection?: FaceDetectionResult | null;
  diagnostics?: DiagnosticsFrame | null;
  faceFit?: FaceFitResult | null;
  light?: LightTestState | null;
  lightResult?: LightTestResult | null;
  mesh?: FaceMeshResult | null;
  spoof?: SpoofFrameResult | null;
  spoofSummary?: SpoofSummaryResult | null;
  stability?: FaceStabilityResult | null;
}

export type VerificationSessionEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'RESET' }
  | { streamInfo: CameraStreamInfo; type: 'CAMERA_GRANTED' }
  | { error: string; errorDetail?: VerificationErrorDetail | null; type: 'CAMERA_DENIED' }
  | { error: string; errorDetail?: VerificationErrorDetail | null; type: 'CAMERA_LOST' }
  | { models: ResolvedModelSpec[]; type: 'MODELS_READY' }
  | { error: string; errorDetail?: VerificationErrorDetail | null; type: 'MODELS_FAILED' }
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
  | { error: string; errorDetail?: VerificationErrorDetail | null; type: 'ERROR' };

export type VerificationEvent = VerificationSessionEvent;

export interface VerificationContext<TVideo = unknown> {
  checks: readonly VerificationCheck[];
  completedAt: number | null;
  debug: ResolvedDebugOptions;
  detection: FaceDetectionResult | null;
  diagnostics: DiagnosticsFrame | null;
  error: string | null;
  errorDetail: VerificationErrorDetail | null;
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
  result: VerificationResult | null;
  spoof: SpoofFrameResult | null;
  spoofSummary: SpoofSummaryResult | null;
  stage: VerificationStage;
  stability: FaceStabilityResult | null;
  streamInfo: CameraStreamInfo | null;
  startedAt: number | null;
}

export type VerificationSnapshot<TVideo = unknown> = VerificationContext<TVideo>;
