import type {
  DebugOptions,
  FaceFitOptions,
  LightTestOptions,
  LivenessChallengeOptions,
  ResolvedDebugOptions,
  ResolvedLightTestOptions,
  ResolvedLivenessChallengeOptions,
  ResolvedVerificationOptions,
  VerificationCheck,
  VerificationOptions,
} from '../config.js';
import { DEFAULT_LIVENESS_OPTIONS, resolveLivenessOptions } from '../liveness/challenge.js';
import { DEFAULT_LIGHT_SEQUENCE, resolveLightSequence } from '../light/sequence.js';

const DEFAULT_CHECKS: readonly VerificationCheck[] = ['face'];
const DEFAULT_DEBUG_THROTTLE_MS = 120;

export const DEFAULT_FACE_OPTIONS: FaceFitOptions = {
  cameraZoom: 1.55,
  guideContainmentTolerancePx: 16,
  guideMaxHorizontalOverflowRatio: 0.26,
  guideMaxVerticalOverflowRatio: 0.3,
  guideMinHeightFillRatio: 0.5,
  guideMinInsideAreaRatio: 0.45,
  guideMinWidthFillRatio: 0.58,
  guideRelaxedCenterMarginRatio: 0.34,
  roiExpandFactor: 1.5,
  stabilizationDurationMs: 700,
  stabilityDistanceIncreaseThreshold: 0.18,
  stabilityMovementThreshold: 0.15,
  stabilityVerticalMovementThreshold: 0.12,
};

export const DEFAULT_DEBUG_OPTIONS: ResolvedDebugOptions = {
  enabled: false,
  events: true,
  overlay: false,
  throttleMs: DEFAULT_DEBUG_THROTTLE_MS,
  timings: true,
};

export { DEFAULT_LIVENESS_OPTIONS };
export { DEFAULT_LIGHT_SEQUENCE, DEFAULT_LIGHT_TEST_COLORS } from '../light/sequence.js';

export const DEFAULT_LIGHT_OPTIONS: ResolvedLightTestOptions = {
  ambientValueWashoutThreshold: 235,
  colorSettleMs: 900,
  maxProcessingWidth: 320,
  minColorDirectionSimilarity: 0.58,
  minColorResponseMagnitude: 0.008,
  minColorSequenceScore: 0.6,
  minSamplePixels: 80,
  opencvAssetBaseUrl: '/vendor/opencv/',
  opencvReadyTimeoutMs: 15000,
  opencvWorkerUrl: null,
  sequence: DEFAULT_LIGHT_SEQUENCE,
  stableDurationMs: 700,
  stabilityThreshold: 0.045,
};

export const resolveDebugOptions = (debug?: boolean | DebugOptions): ResolvedDebugOptions => {
  if (debug === true) {
    return {
      ...DEFAULT_DEBUG_OPTIONS,
      enabled: true,
    };
  }

  if (!debug) {
    return { ...DEFAULT_DEBUG_OPTIONS };
  }

  return {
    ...DEFAULT_DEBUG_OPTIONS,
    ...debug,
    enabled: true,
    throttleMs: debug.throttleMs ?? DEFAULT_DEBUG_THROTTLE_MS,
  };
};

export const resolveLightOptions = (
  options?: LightTestOptions,
): ResolvedLightTestOptions => {
  const sequence = resolveLightSequence(options?.sequence);

  return {
    ...DEFAULT_LIGHT_OPTIONS,
    ...options,
    opencvWorkerUrl: options?.opencvWorkerUrl ?? DEFAULT_LIGHT_OPTIONS.opencvWorkerUrl,
    sequence,
  };
};

export const resolveVerificationOptions = <TVideo>(
  options: VerificationOptions<TVideo>,
): ResolvedVerificationOptions<TVideo> => ({
  checks: options.checks?.length ? [...options.checks] : [...DEFAULT_CHECKS],
  debug: resolveDebugOptions(options.debug),
  face: {
    ...DEFAULT_FACE_OPTIONS,
    ...options.face,
  },
  light: resolveLightOptions(options.light),
  liveness: resolveLivenessOptions(options.liveness),
  models: {
    manifestUrl: options.models.manifestUrl,
    overrides: options.models.overrides ? { ...options.models.overrides } : undefined,
  },
  video: options.video,
});

export type {
  LightTestOptions,
  ResolvedLightTestOptions,
  LivenessChallengeOptions,
  ResolvedLivenessChallengeOptions,
};
