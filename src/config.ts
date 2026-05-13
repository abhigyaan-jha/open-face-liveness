import type { InspectionEvent, Observer } from 'xstate';
import type { VerificationModelsOptions } from './models.js';
import type { LightTestColor, LivenessChallengeType } from './result.js';

export const DEFAULT_ASSET_BASE_URL = '/web-verify/';
export const DEFAULT_MODEL_BASE_URL = `${DEFAULT_ASSET_BASE_URL}models/`;
export const DEFAULT_MODEL_MANIFEST_URL = `${DEFAULT_MODEL_BASE_URL}manifest.json`;
export const DEFAULT_OPENCV_ASSET_BASE_URL = `${DEFAULT_ASSET_BASE_URL}vendor/opencv/`;

export type VerificationCheck = 'face' | 'light' | 'liveness' | 'spoof';
export type RuntimeVerificationCheck = 'face' | 'light' | 'liveness' | 'spoof';
export type VerificationActorInspect = Observer<InspectionEvent> | ((inspectionEvent: InspectionEvent) => void);

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

export interface LivenessChallengeOptions {
  activeDistanceIncreaseThreshold?: number;
  activeMovementThreshold?: number;
  activeVerticalMovementThreshold?: number;
  celebrationDurationMs?: number;
  challenges?: readonly LivenessChallengeType[];
  challengeMouthOpenRatio?: number;
  challengePitchLimit?: number;
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
  challenges: readonly LivenessChallengeType[];
  challengeMouthOpenRatio: number;
  challengePitchLimit: number;
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

export interface LightTestOptions {
  ambientValueWashoutThreshold?: number;
  colorSettleMs?: number;
  maxProcessingWidth?: number;
  minColorDirectionSimilarity?: number;
  minColorResponseMagnitude?: number;
  minColorSequenceScore?: number;
  minSamplePixels?: number;
  opencvAssetBaseUrl?: string;
  opencvReadyTimeoutMs?: number;
  opencvWorkerUrl?: string;
  sequence?: readonly LightTestColor[];
  stableDurationMs?: number;
  stabilityThreshold?: number;
}

export interface ResolvedLightTestOptions {
  ambientValueWashoutThreshold: number;
  colorSettleMs: number;
  maxProcessingWidth: number;
  minColorDirectionSimilarity: number;
  minColorResponseMagnitude: number;
  minColorSequenceScore: number;
  minSamplePixels: number;
  opencvAssetBaseUrl: string;
  opencvReadyTimeoutMs: number;
  opencvWorkerUrl: string | null;
  sequence: readonly LightTestColor[];
  stableDurationMs: number;
  stabilityThreshold: number;
}

export interface DebugOptions {
  events?: boolean;
  overlay?: boolean;
  throttleMs?: number;
  timings?: boolean;
}

export interface ResolvedDebugOptions {
  enabled: boolean;
  events: boolean;
  overlay: boolean;
  throttleMs: number;
  timings: boolean;
}

export interface ResolvedVerificationOptions<TVideo = unknown> {
  checks: readonly VerificationCheck[];
  debug: ResolvedDebugOptions;
  face: FaceFitOptions;
  light: ResolvedLightTestOptions;
  liveness: ResolvedLivenessChallengeOptions;
  models: VerificationModelsOptions;
  video: TVideo;
}

export interface VerificationOptions<TVideo = unknown> {
  checks?: readonly VerificationCheck[];
  debug?: boolean | DebugOptions;
  face?: Partial<FaceFitOptions>;
  light?: LightTestOptions;
  liveness?: LivenessChallengeOptions;
  models: VerificationModelsOptions;
  video: TVideo;
  xstateInspect?: VerificationActorInspect;
}

export interface CheckConfig {
  face: boolean;
  light: boolean;
  liveness: boolean;
  spoof: boolean;
}

export type ModelConfig = VerificationModelsOptions;

export interface DebugConfig {
  overlay: boolean;
  timings: boolean;
}

export interface WebVerifyConfig {
  checks: CheckConfig;
  debug: DebugConfig;
  models: ModelConfig;
}

export type WebVerifyUserConfig = Partial<{
  checks: Partial<CheckConfig>;
  debug: Partial<DebugConfig> | boolean;
  models: Partial<ModelConfig>;
}>;

export const defaultConfig: WebVerifyConfig = {
  checks: {
    face: true,
    light: false,
    liveness: true,
    spoof: false,
  },
  debug: {
    overlay: false,
    timings: false,
  },
  models: {
    baseUrl: DEFAULT_MODEL_BASE_URL,
    manifestUrl: DEFAULT_MODEL_MANIFEST_URL,
  },
};

export const resolveConfig = (userConfig: WebVerifyUserConfig = {}): WebVerifyConfig => ({
  checks: {
    ...defaultConfig.checks,
    ...userConfig.checks,
  },
  debug: typeof userConfig.debug === 'boolean'
    ? { overlay: userConfig.debug, timings: userConfig.debug }
    : {
        ...defaultConfig.debug,
        ...userConfig.debug,
      },
  models: {
    ...defaultConfig.models,
    ...userConfig.models,
  },
});
