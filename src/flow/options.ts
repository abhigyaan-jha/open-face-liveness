import type {
  DebugOptions,
  FaceFitOptions,
  LightTestColor,
  LightTestOptions,
  LivenessChallengeOptions,
  LivenessChallengePlan,
  ResolvedDebugOptions,
  ResolvedLightTestOptions,
  ResolvedLivenessChallengeOptions,
  ResolvedVerificationOptions,
  VerificationCheck,
  VerificationOptions,
} from '../types.js';
import { DEFAULT_LIVENESS_OPTIONS, resolveLivenessOptions } from '../pipelines/liveness.js';

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
  drawBoundingBox: true,
  drawGuide: true,
  drawLandmarks: true,
  enabled: false,
  events: true,
  overlay: false,
  throttleMs: DEFAULT_DEBUG_THROTTLE_MS,
  timings: true,
};

export { DEFAULT_LIVENESS_OPTIONS };

export const DEFAULT_LIGHT_TEST_COLORS: readonly LightTestColor[] = [
  { css: '#ff0000', id: 'red', label: 'Red', rgb: [255, 0, 0] },
  { css: '#ffea00', id: 'yellow', label: 'Yellow', rgb: [255, 234, 0] },
  { css: '#00ff00', id: 'green', label: 'Green', rgb: [0, 255, 0] },
  { css: '#00ffff', id: 'cyan', label: 'Cyan', rgb: [0, 255, 255] },
  { css: '#0000ff', id: 'blue', label: 'Blue', rgb: [0, 0, 255] },
  { css: '#ff00ff', id: 'magenta', label: 'Magenta', rgb: [255, 0, 255] },
];

export const DEFAULT_LIGHT_OPTIONS: ResolvedLightTestOptions = {
  ambientValueWashoutThreshold: 235,
  colorSequenceLength: 6,
  colorSettleMs: 900,
  colors: DEFAULT_LIGHT_TEST_COLORS,
  maxProcessingWidth: 320,
  minColorDirectionSimilarity: 0.58,
  minColorResponseMagnitude: 0.008,
  minColorSequenceScore: 0.6,
  minSamplePixels: 80,
  opencvAssetBaseUrl: '/vendor/opencv/',
  opencvReadyTimeoutMs: 15000,
  opencvWorkerUrl: null,
  stableDurationMs: 700,
  stabilityThreshold: 0.045,
};

const cloneLightTestColor = (color: LightTestColor): LightTestColor => ({
  ...color,
  rgb: [color.rgb[0], color.rgb[1], color.rgb[2]],
});

const cloneLivenessChallengePlan = (
  challengePlan: LivenessChallengePlan,
): LivenessChallengePlan => ({
  challengeId: challengePlan.challengeId,
  checksum: challengePlan.checksum,
  nonce: challengePlan.nonce,
  policyVersion: challengePlan.policyVersion,
  sequence: [...challengePlan.sequence],
});

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
  const colors = options?.colors?.length
    ? options.colors.map(cloneLightTestColor)
    : DEFAULT_LIGHT_TEST_COLORS.map(cloneLightTestColor);
  const requestedSequenceLength = Math.round(
    options?.colorSequenceLength ?? DEFAULT_LIGHT_OPTIONS.colorSequenceLength,
  );
  const colorSequenceLength = Math.min(
    colors.length,
    Math.max(1, Number.isFinite(requestedSequenceLength) ? requestedSequenceLength : 1),
  );

  return {
    ...DEFAULT_LIGHT_OPTIONS,
    ...options,
    colorSequenceLength,
    colors,
  };
};

export const resolveVerificationOptions = <TVideo>(
  options: VerificationOptions<TVideo>,
): ResolvedVerificationOptions<TVideo> => ({
  challengePlan: options.challengePlan
    ? cloneLivenessChallengePlan(options.challengePlan)
    : null,
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
