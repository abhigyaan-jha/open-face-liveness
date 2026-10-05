import type {
  FaceDetectionResult,
  FaceFitResult,
  FaceMeshResult,
  LandmarkList,
  LightTestChroma,
  LightTestColor,
  LightTestResult,
  LightTestSample,
  LightTestState,
  LightTestStatus,
  LightTestStepComparison,
  Rect,
} from '../result.js';
import type { ResolvedLightTestOptions } from '../config.js';
import { VerificationError, type VerificationErrorCode } from '../errors.js';
import { sampleLightRegions } from './hsv.js';
import { cloneLightTestColor } from './sequence.js';

export interface LightPipelineFrame {
  detection: FaceDetectionResult;
  faceFit: FaceFitResult;
  frameIndex: number;
  mesh: FaceMeshResult;
  timestamp: number;
  video: HTMLVideoElement;
}

export interface LightPipelineUpdate {
  result: LightTestResult | null;
  state: LightTestState;
}

export interface CreateLightPipelineOptions {
  onIlluminationChange?: (color: LightTestColor | null) => void;
  options: ResolvedLightTestOptions;
}

export interface LightPipeline {
  destroy(): void;
  getState(instruction?: string, progress?: number): LightTestState;
  update(frame: LightPipelineFrame): LightPipelineUpdate;
}

interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

interface LightTestSampleRegion {
  readonly heightRatio: number;
  readonly label: string;
  readonly landmarks: readonly number[];
  readonly widthRatio: number;
  readonly yOffsetRatio: number;
}

interface LightTestDetectionAnchor {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface LightTestComparisonThresholds {
  minColorDirectionSimilarity: number;
  minColorResponseMagnitude: number;
  minSamplePixels: number;
  minStepScore: number;
}

const LIGHT_TEST_MIN_STEP_SCORE = 0.5;
const LIGHT_TEST_SKIN_SAMPLE_REGIONS: readonly LightTestSampleRegion[] = [
  {
    heightRatio: 0.08,
    label: 'forehead',
    landmarks: [10, 151, 9],
    widthRatio: 0.18,
    yOffsetRatio: -0.015,
  },
  {
    heightRatio: 0.12,
    label: 'left cheek',
    landmarks: [116, 117, 118, 123],
    widthRatio: 0.16,
    yOffsetRatio: 0.01,
  },
  {
    heightRatio: 0.12,
    label: 'right cheek',
    landmarks: [345, 346, 347, 352],
    widthRatio: 0.16,
    yOffsetRatio: 0.01,
  },
];

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const createEmptySample = (
  sampleRects: readonly Rect[] = [],
  statusMessage = '',
): LightTestSample => ({
  averageBlue: null,
  averageGreen: null,
  averageHue: null,
  averageHueDegrees: null,
  averageHueOpenCv: null,
  averageRed: null,
  averageSaturation: null,
  averageValue: null,
  chroma: null,
  sampleRects: sampleRects.map((rect) => ({ ...rect })),
  sampledPixels: 0,
  skippedPixels: 0,
  statusMessage,
  totalPixels: 0,
  usableRegionCount: 0,
});

const cloneLightTestSample = (sample: LightTestSample | null): LightTestSample | null =>
  sample
    ? {
        averageBlue: sample.averageBlue,
        averageGreen: sample.averageGreen,
        averageHue: sample.averageHue ?? null,
        averageHueDegrees: sample.averageHueDegrees ?? null,
        averageHueOpenCv: sample.averageHueOpenCv ?? sample.averageHue ?? null,
        averageRed: sample.averageRed,
        averageSaturation: sample.averageSaturation,
        averageValue: sample.averageValue,
        chroma: sample.chroma
          ? {
              blue: sample.chroma.blue,
              green: sample.chroma.green,
              red: sample.chroma.red,
              vector: [
                sample.chroma.vector[0],
                sample.chroma.vector[1],
                sample.chroma.vector[2],
              ],
            }
          : null,
        sampleRects: sample.sampleRects.map((rect) => ({ ...rect })),
        sampledPixels: sample.sampledPixels,
        skippedPixels: sample.skippedPixels,
        statusMessage: sample.statusMessage,
        totalPixels: sample.totalPixels,
        usableRegionCount: sample.usableRegionCount,
      }
    : null;

const createState = ({
  activeColor,
  baselineSample,
  colorIndex,
  completed,
  instruction,
  matchedSteps,
  passed,
  progress,
  resultMessage,
  sampleRects,
  sequence,
  sequenceAverageScore,
  sequenceCorrelation,
  sequenceResponseMagnitude,
}: {
  activeColor: LightTestColor | null;
  baselineSample: LightTestSample | null;
  colorIndex: number;
  completed: boolean;
  instruction: string;
  matchedSteps: number;
  passed: boolean;
  progress: number;
  resultMessage: string;
  sampleRects: readonly Rect[];
  sequence: readonly LightTestColor[];
  sequenceAverageScore: number | null;
  sequenceCorrelation: number | null;
  sequenceResponseMagnitude: number | null;
}): LightTestState => ({
  activeColor,
  baselineSample,
  colorIndex,
  completed,
  instruction,
  matchedSteps,
  passed,
  phase: completed ? 'complete' : baselineSample ? 'color-wait' : 'baseline',
  progress,
  resultMessage,
  sampleRects,
  sequence,
  sequenceAverageScore,
  sequenceCorrelation,
  sequenceResponseMagnitude,
  totalSteps: sequence.length,
});

const createIdleState = (
  sequence: readonly LightTestColor[],
): LightTestState => ({
  activeColor: null,
  baselineSample: null,
  colorIndex: 0,
  completed: false,
  instruction: 'Hold still for the light reflection check.',
  matchedSteps: 0,
  passed: false,
  phase: 'idle',
  progress: 0,
  resultMessage: 'Hold still for the light reflection check.',
  sampleRects: [],
  sequence,
  sequenceAverageScore: null,
  sequenceCorrelation: null,
  sequenceResponseMagnitude: null,
  totalSteps: sequence.length,
});

const getLandmarkPoint = (
  landmarks: LandmarkList,
  index: number,
): LandmarkPoint | null => {
  const offset = index * 3;
  if (offset < 0 || offset + 2 >= landmarks.length) {
    return null;
  }

  const x = landmarks[offset];
  const y = landmarks[offset + 1];
  const z = landmarks[offset + 2];

  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null;
  }

  return { x, y, z };
};

const getAverageLandmarkPoint = (
  landmarks: LandmarkList,
  indexes: readonly number[],
): LandmarkPoint | null => {
  const points = indexes
    .map((index) => getLandmarkPoint(landmarks, index))
    .filter((point): point is LandmarkPoint => Boolean(point));

  if (!points.length) {
    return null;
  }

  const total = points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
      z: sum.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: total.z / points.length,
  };
};

export const clampLightTestRect = (
  rect: Rect,
  frameWidth: number,
  frameHeight: number,
): Rect | null => {
  if (!frameWidth || !frameHeight) {
    return null;
  }

  const x = clamp(rect.x, 0, frameWidth);
  const y = clamp(rect.y, 0, frameHeight);
  const right = clamp(rect.x + rect.width, x, frameWidth);
  const bottom = clamp(rect.y + rect.height, y, frameHeight);
  const width = right - x;
  const height = bottom - y;

  if (width <= 1 || height <= 1) {
    return null;
  }

  return {
    ...rect,
    height,
    width,
    x,
    y,
  };
};

const getLightTestLandmarkSampleRects = (
  landmarks: LandmarkList,
  detection: FaceDetectionResult,
  frameWidth: number,
  frameHeight: number,
): readonly Rect[] => {
  const faceWidth = Math.max(1, detection.box.width);
  const faceHeight = Math.max(1, detection.box.height);

  return LIGHT_TEST_SKIN_SAMPLE_REGIONS.map((region) => {
    const center = getAverageLandmarkPoint(landmarks, region.landmarks);
    if (!center) {
      return null;
    }

    const width = Math.max(8, faceWidth * region.widthRatio);
    const height = Math.max(8, faceHeight * region.heightRatio);
    return clampLightTestRect(
      {
        height,
        label: region.label,
        width,
        x: center.x - width / 2,
        y: center.y - height / 2 + faceHeight * region.yOffsetRatio,
      },
      frameWidth,
      frameHeight,
    );
  }).filter((rect): rect is Rect => Boolean(rect));
};

export const getLightTestSampleRects = (
  detection: FaceDetectionResult,
  frameWidth: number,
  frameHeight: number,
  mesh: FaceMeshResult | null = null,
): readonly Rect[] => {
  if (mesh?.landmarks) {
    const landmarkRects = getLightTestLandmarkSampleRects(
      mesh.landmarks,
      detection,
      frameWidth,
      frameHeight,
    );
    if (landmarkRects.length) {
      return landmarkRects;
    }
  }

  const faceRect = clampLightTestRect(detection.box, frameWidth, frameHeight);
  if (!faceRect) {
    return [];
  }

  const relativeRects = [
    { height: 0.12, label: 'forehead', width: 0.3, x: 0.35, y: 0.18 },
    { height: 0.18, label: 'left cheek', width: 0.2, x: 0.2, y: 0.5 },
    { height: 0.18, label: 'right cheek', width: 0.2, x: 0.6, y: 0.5 },
  ] as const;

  return relativeRects
    .map((rect) =>
      clampLightTestRect(
        {
          height: Math.round(faceRect.height * rect.height),
          label: rect.label,
          width: Math.round(faceRect.width * rect.width),
          x: Math.round(faceRect.x + faceRect.width * rect.x),
          y: Math.round(faceRect.y + faceRect.height * rect.y),
        },
        frameWidth,
        frameHeight,
      ),
    )
    .filter((rect): rect is Rect => Boolean(rect));
};

export const getRgbChromaticity = (red: number, green: number, blue: number): LightTestChroma | null => {
  const total = red + green + blue;
  if (total <= 0) {
    return null;
  }

  return {
    blue: blue / total,
    green: green / total,
    red: red / total,
    vector: [red / total, green / total, blue / total],
  };
};

const getLightTestSampleDelta = (
  beforeSample: LightTestSample,
  afterSample: LightTestSample,
  key: keyof Pick<LightTestSample, 'averageBlue' | 'averageGreen' | 'averageRed' | 'averageSaturation' | 'averageValue'>,
): number | null => {
  const beforeValue = beforeSample[key];
  const afterValue = afterSample[key];
  return isFiniteNumber(beforeValue) && isFiniteNumber(afterValue)
    ? afterValue - beforeValue
    : null;
};

const getLightTestRgbVector = (sample: LightTestSample): readonly [number, number, number] | null => {
  const { averageBlue, averageGreen, averageRed } = sample;

  return isFiniteNumber(averageRed) && isFiniteNumber(averageGreen) && isFiniteNumber(averageBlue)
    ? [averageRed, averageGreen, averageBlue]
    : null;
};

const getLightTestChromaticity = (sample: LightTestSample): LightTestChroma | null => {
  const vector = getLightTestRgbVector(sample);
  return vector ? getRgbChromaticity(vector[0], vector[1], vector[2]) : null;
};

const getLightTestColorDirection = (
  color: LightTestColor,
): { chromaVector: readonly [number, number, number]; direction: readonly [number, number, number] } | null => {
  const chroma = getRgbChromaticity(color.rgb[0], color.rgb[1], color.rgb[2]);
  if (!chroma) {
    return null;
  }

  const direction = [
    chroma.vector[0] - 1 / 3,
    chroma.vector[1] - 1 / 3,
    chroma.vector[2] - 1 / 3,
  ] as const;
  const magnitude = Math.hypot(direction[0], direction[1], direction[2]);

  return magnitude > 0
    ? {
        chromaVector: chroma.vector,
        direction,
      }
    : null;
};

const getLightTestVectorDot = (left: readonly number[], right: readonly number[]): number | null => {
  if (left.length !== right.length) {
    return null;
  }

  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
  }

  return dot;
};

const rgbToScaledHsv = (
  red: number,
  green: number,
  blue: number,
): { hue: number; saturation: number; value: number } => {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maxValue = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minValue = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maxValue - minValue;
  let hueDegrees = 0;

  if (delta > 0) {
    if (maxValue === normalizedRed) {
      hueDegrees = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maxValue === normalizedGreen) {
      hueDegrees = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hueDegrees = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  if (hueDegrees < 0) {
    hueDegrees += 360;
  }

  return {
    hue: hueDegrees / 2,
    saturation: maxValue === 0 ? 0 : (delta / maxValue) * 255,
    value: maxValue * 255,
  };
};

const getHueUnitVector = (degrees: number | null | undefined, magnitude = 1): readonly [number, number] | null => {
  if (!isFiniteNumber(degrees) || !isFiniteNumber(magnitude)) {
    return null;
  }

  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians) * magnitude, Math.sin(radians) * magnitude];
};

const getLightTestHsvCastVector = (sample: LightTestSample): readonly [number, number] | null => {
  if (
    !isFiniteNumber(sample.averageHueDegrees) ||
    !isFiniteNumber(sample.averageSaturation) ||
    !isFiniteNumber(sample.averageValue)
  ) {
    return null;
  }

  const saturation = clamp(sample.averageSaturation / 255, 0, 1);
  const value = clamp(sample.averageValue / 255, 0, 1);
  return getHueUnitVector(sample.averageHueDegrees, saturation * value);
};

const getLightTestExpectedHueDegrees = (color: LightTestColor): number | null =>
  color.rgb.length === 3
    ? rgbToScaledHsv(color.rgb[0], color.rgb[1], color.rgb[2]).hue * 2
    : null;

const getDefaultComparisonThresholds = (): LightTestComparisonThresholds => ({
  minColorDirectionSimilarity: 0.58,
  minColorResponseMagnitude: 0.008,
  minSamplePixels: 80,
  minStepScore: LIGHT_TEST_MIN_STEP_SCORE,
});

export const createLightTestTargetColorComparison = (
  beforeSample: LightTestSample | null,
  afterSample: LightTestSample | null,
  color: LightTestColor,
  index = 0,
  thresholds: Partial<LightTestComparisonThresholds> = {},
): LightTestStepComparison | null => {
  if (!beforeSample || !afterSample) {
    return null;
  }

  const resolvedThresholds = {
    ...getDefaultComparisonThresholds(),
    ...thresholds,
  };
  const baselineChroma = getLightTestChromaticity(beforeSample);
  const afterChroma = getLightTestChromaticity(afterSample);
  const expectedRgbDirection = getLightTestColorDirection(color);

  if (!baselineChroma || !afterChroma || !expectedRgbDirection) {
    return null;
  }

  const expectedHueDegrees = getLightTestExpectedHueDegrees(color);
  const beforeHsvVector = getLightTestHsvCastVector(beforeSample);
  const afterHsvVector = getLightTestHsvCastVector(afterSample);
  const expectedHsvVector = getHueUnitVector(expectedHueDegrees, 1);
  const observedHsvVector =
    beforeHsvVector && afterHsvVector
      ? [
          afterHsvVector[0] - beforeHsvVector[0],
          afterHsvVector[1] - beforeHsvVector[1],
        ] as const
      : null;
  const responseMagnitude = observedHsvVector
    ? Math.hypot(observedHsvVector[0], observedHsvVector[1])
    : 0;
  const hsvDirectionScore =
    observedHsvVector &&
    expectedHsvVector &&
    responseMagnitude > 0
      ? (getLightTestVectorDot(observedHsvVector, expectedHsvVector) ?? -responseMagnitude) /
        responseMagnitude
      : -1;
  const colorDirectionSimilarity = clamp((hsvDirectionScore + 1) / 2, 0, 1);
  const valueDelta = getLightTestSampleDelta(beforeSample, afterSample, 'averageValue');
  const valueResponseScore = clamp(((valueDelta ?? 0) + 2) / 14, 0, 1);
  const colorResponseScore = clamp(responseMagnitude / resolvedThresholds.minColorResponseMagnitude, 0, 1);
  const matchScore = clamp(
    colorDirectionSimilarity * 0.72 +
      colorResponseScore * 0.18 +
      valueResponseScore * 0.1,
    0,
    1,
  );
  const observedDelta = [
    getLightTestSampleDelta(beforeSample, afterSample, 'averageRed') ?? 0,
    getLightTestSampleDelta(beforeSample, afterSample, 'averageGreen') ?? 0,
    getLightTestSampleDelta(beforeSample, afterSample, 'averageBlue') ?? 0,
  ] as const;
  const passChecks = {
    colorDirection: colorDirectionSimilarity >= resolvedThresholds.minColorDirectionSimilarity,
    colorResponse: responseMagnitude >= resolvedThresholds.minColorResponseMagnitude,
    sampledPixels:
      beforeSample.sampledPixels >= resolvedThresholds.minSamplePixels &&
      afterSample.sampledPixels >= resolvedThresholds.minSamplePixels,
  };
  const passed =
    passChecks.sampledPixels &&
    passChecks.colorResponse &&
    passChecks.colorDirection &&
    matchScore >= resolvedThresholds.minStepScore;

  return {
    afterChroma,
    baselineChroma,
    color: cloneLightTestColor(color),
    colorDirectionSimilarity,
    expectedHueDegrees,
    expectedHueOpenCv: isFiniteNumber(expectedHueDegrees) ? expectedHueDegrees / 2 : null,
    hsvExpectedVector: expectedHsvVector,
    hsvObservedVector: observedHsvVector,
    hsvResponseMagnitude: responseMagnitude,
    hsvStepScore: matchScore,
    index,
    matchScore,
    observedDelta,
    passChecks,
    passed,
    responseMagnitude,
    sampledPixelsAfter: afterSample.sampledPixels,
    sampledPixelsBefore: beforeSample.sampledPixels,
    status: passed ? 'passed' : 'failed',
  };
};

export const getPearsonCorrelation = (left: readonly number[], right: readonly number[]): number | null => {
  if (left.length !== right.length || left.length === 0) {
    return null;
  }

  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }

  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? numerator / denominator : null;
};

const getCircularMeanHue = (
  hueSinTotal: number,
  hueCosTotal: number,
  sampledPixels: number,
): number | null => {
  if (!sampledPixels || (hueSinTotal === 0 && hueCosTotal === 0)) {
    return null;
  }

  let angle = Math.atan2(hueSinTotal / sampledPixels, hueCosTotal / sampledPixels);
  if (angle < 0) {
    angle += Math.PI * 2;
  }

  return (angle * 90) / Math.PI;
};

const getLightTestProcessingFrameSize = (
  frameWidth: number,
  frameHeight: number,
  maxProcessingWidth: number,
) => {
  const scale = Math.min(1, maxProcessingWidth / frameWidth);
  return {
    height: Math.max(1, Math.round(frameHeight * scale)),
    scaleX: scale,
    scaleY: scale,
    width: Math.max(1, Math.round(frameWidth * scale)),
  };
};

const scaleLightTestRect = (rect: Rect, scaleX: number, scaleY: number): Rect => ({
  ...rect,
  height: rect.height * scaleY,
  width: rect.width * scaleX,
  x: rect.x * scaleX,
  y: rect.y * scaleY,
});

const getLightTestDetectionAnchor = (
  detection: Rect | null,
  frameWidth: number,
  frameHeight: number,
): LightTestDetectionAnchor | null => {
  if (!detection || !frameWidth || !frameHeight) {
    return null;
  }

  return {
    height: detection.height / frameHeight,
    width: detection.width / frameWidth,
    x: (detection.x + detection.width / 2) / frameWidth,
    y: (detection.y + detection.height / 2) / frameHeight,
  };
};

const isLightTestDetectionStable = (
  previousAnchor: LightTestDetectionAnchor | null,
  currentAnchor: LightTestDetectionAnchor | null,
  threshold: number,
): boolean =>
  Boolean(
    previousAnchor &&
    currentAnchor &&
    Math.abs(previousAnchor.x - currentAnchor.x) <= threshold &&
    Math.abs(previousAnchor.y - currentAnchor.y) <= threshold &&
    Math.abs(previousAnchor.width - currentAnchor.width) <= threshold &&
    Math.abs(previousAnchor.height - currentAnchor.height) <= threshold,
  );

const getLightTestStability = ({
  anchor,
  previousAnchor,
  stableStartedAt,
  stableDurationMs,
  stabilityThreshold,
  timestamp,
}: {
  anchor: LightTestDetectionAnchor | null;
  previousAnchor: LightTestDetectionAnchor | null;
  stableDurationMs: number;
  stableStartedAt: number;
  stabilityThreshold: number;
  timestamp: number;
}) => {
  if (!anchor) {
    return {
      progress: 0,
      stable: false,
      stableStartedAt: 0,
      stableAnchor: null,
    };
  }

  if (!previousAnchor || !isLightTestDetectionStable(previousAnchor, anchor, stabilityThreshold)) {
    return {
      progress: 0,
      stable: false,
      stableStartedAt: timestamp,
      stableAnchor: anchor,
    };
  }

  const elapsedMs = timestamp - stableStartedAt;
  return {
    progress: clamp(elapsedMs / stableDurationMs, 0, 1),
    stable: elapsedMs >= stableDurationMs,
    stableAnchor: previousAnchor,
    stableStartedAt,
  };
};

const createLightError = (
  code: VerificationErrorCode,
  message: string,
  cause?: unknown,
): VerificationError =>
  new VerificationError(code, message, {
    area: 'light',
    cause,
  });

const sampleLightTestPixels = ({
  frame,
  options,
  sampleRects,
}: {
  frame: LightPipelineFrame;
  options: ResolvedLightTestOptions;
  sampleRects: readonly Rect[];
}): LightTestSample => {
  const frameWidth = frame.video.videoWidth || frame.mesh.frameWidth;
  const frameHeight = frame.video.videoHeight || frame.mesh.frameHeight;

  if (!frameWidth || !frameHeight) {
    return createEmptySample(sampleRects, 'Camera frame not ready.');
  }

  if (!sampleRects.length) {
    return createEmptySample(sampleRects, 'No sample region.');
  }

  const processingFrame = getLightTestProcessingFrameSize(
    frameWidth,
    frameHeight,
    options.maxProcessingWidth,
  );
  const canvas = document.createElement('canvas');
  canvas.width = processingFrame.width;
  canvas.height = processingFrame.height;
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!context) {
    throw createLightError(
      'light.canvas_unavailable',
      'Light response check could not access the sampling canvas.',
    );
  }

  try {
    context.drawImage(frame.video, 0, 0, processingFrame.width, processingFrame.height);
  } catch (cause) {
    throw createLightError(
      'light.sample_failed',
      'Light response sampling failed while reading the camera frame.',
      cause,
    );
  }

  const regions: ImageData[] = [];
  let skippedPixels = 0;
  let totalPixels = 0;

  for (const rect of sampleRects) {
    const sampledRect = clampLightTestRect(
      scaleLightTestRect(rect, processingFrame.scaleX, processingFrame.scaleY),
      processingFrame.width,
      processingFrame.height,
    );

    if (!sampledRect) {
      continue;
    }

    try {
      const imageData = context.getImageData(
        Math.round(sampledRect.x),
        Math.round(sampledRect.y),
        Math.round(sampledRect.width),
        Math.round(sampledRect.height),
      );
      totalPixels += imageData.width * imageData.height;
      regions.push(imageData);
    } catch (cause) {
      throw createLightError(
        'light.sample_failed',
        'Light response sampling failed while reading the sample region.',
        cause,
      );
    }
  }

  if (!regions.length) {
    return createEmptySample(sampleRects, 'No sample region.');
  }

  const totals = sampleLightRegions(regions);
  const sampledPixels = totals.sampledPixels;
  skippedPixels = Math.max(0, totalPixels - sampledPixels);
  const averageRed = sampledPixels ? totals.redTotal / sampledPixels : null;
  const averageGreen = sampledPixels ? totals.greenTotal / sampledPixels : null;
  const averageBlue = sampledPixels ? totals.blueTotal / sampledPixels : null;
  const averageHueOpenCv = getCircularMeanHue(
    totals.hueSinTotal,
    totals.hueCosTotal,
    sampledPixels,
  );
  const averageHueDegrees = isFiniteNumber(averageHueOpenCv) ? averageHueOpenCv * 2 : null;
  const averageSaturation = sampledPixels ? totals.saturationTotal / sampledPixels : null;
  const averageValue = sampledPixels ? totals.valueTotal / sampledPixels : null;
  const chroma = isFiniteNumber(averageRed) && isFiniteNumber(averageGreen) && isFiniteNumber(averageBlue)
    ? getRgbChromaticity(averageRed, averageGreen, averageBlue)
    : null;

  return {
    averageBlue,
    averageGreen,
    averageHue: averageHueOpenCv,
    averageHueDegrees,
    averageHueOpenCv,
    averageRed,
    averageSaturation,
    averageValue,
    chroma,
    sampleRects: sampleRects.map((rect) => ({ ...rect })),
    sampledPixels,
    skippedPixels,
    totalPixels,
    usableRegionCount: regions.length,
  };
};

const summarizeLightTestComparisons = (
  comparisons: readonly (LightTestStepComparison | null)[],
): {
  matchedSteps: number;
  sequenceAverageScore: number | null;
  sequenceCorrelation: number | null;
  sequenceResponseMagnitude: number | null;
} => {
  const validComparisons = comparisons.filter(
    (comparison): comparison is LightTestStepComparison => Boolean(comparison),
  );
  const matchedSteps = validComparisons.filter((comparison) => comparison.passed).length;
  const totalScore = validComparisons.reduce((sum, comparison) => sum + comparison.matchScore, 0);
  const expectedSequence: number[] = [];
  const observedSequence: number[] = [];
  let responseTotal = 0;
  let responseCount = 0;

  for (const comparison of validComparisons) {
    if (comparison.hsvExpectedVector && comparison.hsvObservedVector) {
      expectedSequence.push(
        comparison.hsvExpectedVector[0],
        comparison.hsvExpectedVector[1],
      );
      observedSequence.push(
        comparison.hsvObservedVector[0],
        comparison.hsvObservedVector[1],
      );
    }

    if (isFiniteNumber(comparison.responseMagnitude)) {
      responseTotal += comparison.responseMagnitude;
      responseCount += 1;
    }
  }

  const sequenceCorrelation = getPearsonCorrelation(expectedSequence, observedSequence);
  const sequenceScore = isFiniteNumber(sequenceCorrelation)
    ? clamp((sequenceCorrelation + 1) / 2, 0, 1)
    : null;
  const averageStepScore = validComparisons.length ? totalScore / validComparisons.length : null;

  return {
    matchedSteps,
    sequenceAverageScore:
      validComparisons.length >= 2 && isFiniteNumber(sequenceScore)
        ? sequenceScore
        : averageStepScore,
    sequenceCorrelation,
    sequenceResponseMagnitude: responseCount ? responseTotal / responseCount : null,
  };
};

const getLightTestStatus = (
  passed: boolean,
  comparisons: readonly LightTestStepComparison[],
): LightTestStatus =>
  comparisons.length ? (passed ? 'passed' : 'failed') : 'inconclusive';

export const summarizeLightTestSequence = (
  sequence: readonly LightTestColor[],
  comparisons: readonly LightTestStepComparison[] = [],
): LightTestResult => {
  const summary = summarizeLightTestComparisons(comparisons);
  const passed =
    comparisons.length === sequence.length &&
    comparisons.every((comparison) => comparison.passed) &&
    isFiniteNumber(summary.sequenceAverageScore) &&
    summary.sequenceAverageScore >= 0.6 &&
    isFiniteNumber(summary.sequenceResponseMagnitude) &&
    summary.sequenceResponseMagnitude >= 0.008;

  return {
    baseline: null,
    completedAt: Date.now(),
    matchedSteps: summary.matchedSteps,
    passed,
    resultMessage: passed ? 'Light response sequence complete.' : 'Light response sequence mismatch.',
    sequence: sequence.map(cloneLightTestColor),
    sequenceAverageScore: summary.sequenceAverageScore,
    sequenceCorrelation: summary.sequenceCorrelation,
    sequenceResponseMagnitude: summary.sequenceResponseMagnitude,
    status: getLightTestStatus(passed, comparisons),
    steps: comparisons,
  };
};

export const createLightPipeline = ({
  onIlluminationChange,
  options,
}: CreateLightPipelineOptions): LightPipeline => {
  const sequence = options.sequence.map(cloneLightTestColor);
  let activeColor: LightTestColor | null = null;
  let afterCaptureReadyAt = 0;
  let baselineSample: LightTestSample | null = null;
  let colorIndex = 0;
  let colorStartedAt: number | null = null;
  let completedResult: LightTestResult | null = null;
  let state = createIdleState(sequence);
  let stableAnchor: LightTestDetectionAnchor | null = null;
  let stableStartedAt = 0;
  const comparisons: LightTestStepComparison[] = [];

  const getSummary = () => summarizeLightTestComparisons(comparisons);

  const setIllumination = (color: LightTestColor | null, timestamp: number) => {
    const previousColorId = activeColor?.id ?? null;
    const nextColorId = color?.id ?? null;

    activeColor = color ? cloneLightTestColor(color) : null;
    if (previousColorId !== nextColorId) {
      colorStartedAt = nextColorId ? timestamp : null;
    }

    afterCaptureReadyAt = colorStartedAt === null ? 0 : colorStartedAt + Math.max(0, options.colorSettleMs);
    onIlluminationChange?.(activeColor);
  };

  const getProgress = (timestamp: number): number => {
    if (completedResult) {
      return 1;
    }

    if (!baselineSample) {
      return 0;
    }

    const colorProgress =
      colorStartedAt === null || options.colorSettleMs <= 0
        ? 1
        : clamp((timestamp - colorStartedAt) / options.colorSettleMs, 0, 1);

    return clamp((colorIndex + colorProgress) / Math.max(1, sequence.length), 0, 1);
  };

  const setState = (
    instruction: string,
    resultMessage = instruction,
    sampleRects: readonly Rect[] = state.sampleRects,
    progress = state.progress,
  ): LightTestState => {
    const summary = getSummary();
    const passed =
      Boolean(completedResult?.passed) ||
      (
        comparisons.length === sequence.length &&
        comparisons.every((comparison) => comparison.passed) &&
        isFiniteNumber(summary.sequenceAverageScore) &&
        summary.sequenceAverageScore >= options.minColorSequenceScore &&
        isFiniteNumber(summary.sequenceResponseMagnitude) &&
        summary.sequenceResponseMagnitude >= options.minColorResponseMagnitude
      );

    state = createState({
      activeColor,
      baselineSample: cloneLightTestSample(baselineSample),
      colorIndex,
      completed: Boolean(completedResult),
      instruction,
      matchedSteps: summary.matchedSteps,
      passed,
      progress,
      resultMessage,
      sampleRects: sampleRects.map((rect) => ({ ...rect })),
      sequence,
      sequenceAverageScore: summary.sequenceAverageScore,
      sequenceCorrelation: summary.sequenceCorrelation,
      sequenceResponseMagnitude: summary.sequenceResponseMagnitude,
    });

    return state;
  };

  const resetStability = () => {
    stableAnchor = null;
    stableStartedAt = 0;
  };

  const complete = (frame: LightPipelineFrame): LightPipelineUpdate => {
    setIllumination(null, frame.timestamp);
    const summary = getSummary();
    const passed =
      comparisons.length === sequence.length &&
      comparisons.every((comparison) => comparison.passed) &&
      isFiniteNumber(summary.sequenceAverageScore) &&
      summary.sequenceAverageScore >= options.minColorSequenceScore &&
      isFiniteNumber(summary.sequenceResponseMagnitude) &&
      summary.sequenceResponseMagnitude >= options.minColorResponseMagnitude;
    const resultMessage = passed
      ? 'HSV sequence matched.'
      : 'HSV sequence mismatch.';

    completedResult = {
      baseline: cloneLightTestSample(baselineSample),
      completedAt: frame.timestamp,
      matchedSteps: summary.matchedSteps,
      passed,
      resultMessage,
      sequence: sequence.map(cloneLightTestColor),
      sequenceAverageScore: summary.sequenceAverageScore,
      sequenceCorrelation: summary.sequenceCorrelation,
      sequenceResponseMagnitude: summary.sequenceResponseMagnitude,
      status: getLightTestStatus(passed, comparisons),
      steps: [...comparisons],
    };
    setState(resultMessage, resultMessage, state.sampleRects, 1);

    return {
      result: completedResult,
      state,
    };
  };

  const startColorStep = (timestamp: number) => {
    const color = sequence[colorIndex] ?? null;
    resetStability();
    setIllumination(color, timestamp);
  };

  return {
    destroy() {
      setIllumination(null, performance.now());
    },
    getState(instruction = state.instruction, progress = state.progress) {
      return {
        ...state,
        instruction,
        progress,
      };
    },
    update(frame) {
      if (completedResult) {
        return { result: null, state };
      }

      const frameWidth = frame.video.videoWidth || frame.mesh.frameWidth;
      const frameHeight = frame.video.videoHeight || frame.mesh.frameHeight;
      const sampleRects = getLightTestSampleRects(frame.detection, frameWidth, frameHeight, frame.mesh);

      if (!frame.faceFit.isAligned || !frame.faceFit.isFaceLargeEnough) {
        resetStability();
        setIllumination(null, frame.timestamp);
        const instruction = !frame.faceFit.isAligned
          ? 'Center your face inside the guide before the light reflection check.'
          : 'Move closer for the light reflection check.';
        return {
          result: null,
          state: setState(instruction, instruction, sampleRects, 0),
        };
      }

      if (!sampleRects.length) {
        resetStability();
        setIllumination(null, frame.timestamp);
        return {
          result: null,
          state: setState(
            'Face landmarks found, but skin sample regions are unavailable.',
            'Face landmarks found, but skin sample regions are unavailable.',
            sampleRects,
            0,
          ),
        };
      }

      const detectionAnchor = getLightTestDetectionAnchor(
        frame.faceFit.comparisonBox ?? frame.detection.box,
        frameWidth,
        frameHeight,
      );
      const stability = getLightTestStability({
        anchor: detectionAnchor,
        previousAnchor: stableAnchor,
        stableDurationMs: options.stableDurationMs,
        stableStartedAt,
        stabilityThreshold: options.stabilityThreshold,
        timestamp: frame.timestamp,
      });
      stableAnchor = stability.stableAnchor;
      stableStartedAt = stability.stableStartedAt;

      if (!stability.stable) {
        const percent = Math.round(stability.progress * 100);
        const currentColor = sequence[colorIndex] ?? null;
        const instruction = baselineSample && currentColor
          ? `Step ${colorIndex + 1}/${sequence.length}: ${currentColor.label} on. Hold still (${percent}%).`
          : `Illumination off. Hold still for baseline (${percent}%).`;

        if (baselineSample && currentColor && activeColor?.id !== currentColor.id) {
          setIllumination(currentColor, frame.timestamp);
        }

        return {
          result: null,
          state: setState(instruction, instruction, sampleRects, getProgress(frame.timestamp)),
        };
      }

      if (!baselineSample) {
        setIllumination(null, frame.timestamp);
        const sample = sampleLightTestPixels({
          frame,
          options,
          sampleRects,
        });

        if (sample.sampledPixels < options.minSamplePixels) {
          const message = sample.statusMessage || 'No camera samples yet.';
          return {
            result: null,
            state: setState(message, message, sample.sampleRects, 0),
          };
        }

        if (
          isFiniteNumber(sample.averageValue) &&
          sample.averageValue >= options.ambientValueWashoutThreshold
        ) {
          const message = 'Ambient light is too bright for the screen flash. Move to dimmer light.';
          return {
            result: null,
            state: setState(message, 'Ambient light too bright.', sample.sampleRects, 0),
          };
        }

        baselineSample = cloneLightTestSample(sample);
        colorIndex = 0;
        startColorStep(frame.timestamp);
        return {
          result: null,
          state: setState(
            sequence[0]
              ? `Baseline captured. Step 1/${sequence.length}: ${sequence[0].label} is on.`
              : 'Baseline captured. No color sequence available.',
            'Baseline captured.',
            sample.sampleRects,
            0,
          ),
        };
      }

      const currentColor = sequence[colorIndex] ?? null;
      if (!currentColor) {
        return complete(frame);
      }

      if (activeColor?.id !== currentColor.id) {
        setIllumination(currentColor, frame.timestamp);
      }

      const remainingMs = afterCaptureReadyAt - frame.timestamp;
      if (remainingMs > 0) {
        const instruction = `Step ${colorIndex + 1}/${sequence.length}: ${currentColor.label} on. Capturing in ${Math.ceil(remainingMs / 100) / 10}s.`;
        return {
          result: null,
          state: setState(instruction, instruction, sampleRects, getProgress(frame.timestamp)),
        };
      }

      const sample = sampleLightTestPixels({
        frame,
        options,
        sampleRects,
      });

      if (sample.sampledPixels < options.minSamplePixels) {
        const message = sample.statusMessage || 'After capture unavailable. Keep holding still.';
        return {
          result: null,
          state: setState(message, message, sample.sampleRects, getProgress(frame.timestamp)),
        };
      }

      const comparison = createLightTestTargetColorComparison(
        baselineSample,
        sample,
        currentColor,
        colorIndex,
        {
          minColorDirectionSimilarity: options.minColorDirectionSimilarity,
          minColorResponseMagnitude: options.minColorResponseMagnitude,
          minSamplePixels: options.minSamplePixels,
          minStepScore: LIGHT_TEST_MIN_STEP_SCORE,
        },
      );

      if (comparison) {
        comparisons.push(comparison);
      }

      if (colorIndex + 1 < sequence.length) {
        colorIndex += 1;
        startColorStep(frame.timestamp);
        const nextColor = sequence[colorIndex] ?? null;
        const resultMessage = `${currentColor.label} ${comparison?.passed ? 'matched' : 'not matched'}.`;
        return {
          result: null,
          state: setState(
            `Captured ${currentColor.label}. Step ${colorIndex + 1}/${sequence.length}: ${nextColor?.label || 'next color'} is on.`,
            resultMessage,
            sample.sampleRects,
            getProgress(frame.timestamp),
          ),
        };
      }

      return complete(frame);
    },
  };
};
