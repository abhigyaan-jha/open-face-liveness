import type {
  FaceDetectionResult,
  Rect,
  SpoofFrameResult,
  SpoofLabel,
  SpoofSummaryResult,
} from '../result.js';
import type { ResolvedModelSpec, SpoofAdapter, SpoofPipeline } from '../models.js';
import { VerificationError } from '../errors.js';

const SPOOF_INPUT_SIZE = 80;
const SPOOF_LABELS = ['paper', 'real', 'screen'] as const satisfies readonly SpoofLabel[];
const DEFAULT_SPOOF_SCALE = 2.7;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

// TensorFlow.js graph models live in <stem>/model.json, so the stem is the directory name.
const getModelStem = (source: string): string => {
  const segments = source.split(/[?#]/, 1)[0].split(/[\\/]/).filter(Boolean);
  const filename = segments[segments.length - 1] ?? source;
  if (filename === 'model.json' && segments.length > 1) {
    return segments[segments.length - 2];
  }

  return filename.replace(/\.(pth|pt|ckpt)$/i, '');
};

export const parseSpoofModelScale = (source: string | ResolvedModelSpec): number | null => {
  const candidates =
    typeof source === 'string'
      ? [source]
      : [source.url, source.id].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const base = getModelStem(candidate);
    const parts = base.split('_');

    if (parts[0] === 'org') {
      return null;
    }

    const filenameScale = Number.parseFloat(parts[0]);
    if (Number.isFinite(filenameScale) && filenameScale > 0) {
      return filenameScale;
    }

    const idScale = base.match(/(?:^|[-_])(\d+(?:\.\d+)?)$/)?.[1];
    if (idScale) {
      const parsed = Number.parseFloat(idScale);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return DEFAULT_SPOOF_SCALE;
};

export const softmax = (values: ArrayLike<number>): Float32Array => {
  let maxValue = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    maxValue = Math.max(maxValue, values[index]);
  }

  const scores = new Float32Array(values.length);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Math.exp(values[index] - maxValue);
    scores[index] = value;
    sum += value;
  }

  if (sum <= 0) {
    return scores;
  }

  for (let index = 0; index < scores.length; index += 1) {
    scores[index] /= sum;
  }

  return scores;
};

export const fuseSpoofScores = (scoreSets: readonly ArrayLike<number>[]): Float32Array | null => {
  if (!scoreSets.length) {
    return null;
  }

  const scoreCount = scoreSets[0].length;
  if (scoreCount === 0 || scoreSets.some((scores) => scores.length !== scoreCount)) {
    return null;
  }

  const fused = new Float32Array(scoreCount);
  for (const scores of scoreSets) {
    for (let index = 0; index < scoreCount; index += 1) {
      fused[index] += scores[index];
    }
  }

  for (let index = 0; index < fused.length; index += 1) {
    fused[index] /= scoreSets.length;
  }

  return fused;
};

const getLabelIndex = (scores: ArrayLike<number>): number => {
  let labelIndex = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[labelIndex]) {
      labelIndex = index;
    }
  }

  return labelIndex;
};

const getFiniteValues = (
  samples: readonly SpoofFrameResult[],
  key: keyof Pick<SpoofFrameResult, 'confidence' | 'paperScore' | 'realScore' | 'screenScore'>,
): number[] =>
  samples
    .map((sample) => sample[key])
    .filter((value) => Number.isFinite(value));

const getAverage = (values: readonly number[]): number | null =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const getMedian = (values: readonly number[]): number | null => {
  if (!values.length) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[midpoint]
    : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

export const createEmptySpoofSummary = (skippedSampleCount = 0): SpoofSummaryResult => ({
  averageConfidence: null,
  averagePaperScore: null,
  averageRealScore: null,
  averageScreenScore: null,
  medianConfidence: null,
  medianPaperScore: null,
  medianRealScore: null,
  medianScreenScore: null,
  modelsUsed: 0,
  realFrameRatio: null,
  sampleCount: 0,
  skippedSampleCount,
});

export const summarizeSpoofSamples = (
  samples: readonly SpoofFrameResult[],
  skippedSampleCount = 0,
): SpoofSummaryResult => {
  if (!samples.length) {
    return createEmptySpoofSummary(skippedSampleCount);
  }

  const paperScores = getFiniteValues(samples, 'paperScore');
  const realScores = getFiniteValues(samples, 'realScore');
  const screenScores = getFiniteValues(samples, 'screenScore');
  const confidenceScores = getFiniteValues(samples, 'confidence');
  const realFrames = samples.filter((sample) => sample.label === 'real').length;

  return {
    averageConfidence: getAverage(confidenceScores),
    averagePaperScore: getAverage(paperScores),
    averageRealScore: getAverage(realScores),
    averageScreenScore: getAverage(screenScores),
    medianConfidence: getMedian(confidenceScores),
    medianPaperScore: getMedian(paperScores),
    medianRealScore: getMedian(realScores),
    medianScreenScore: getMedian(screenScores),
    modelsUsed: samples.reduce((maxModels, sample) => Math.max(maxModels, sample.modelsUsed), 0),
    realFrameRatio: realFrames / samples.length,
    sampleCount: samples.length,
    skippedSampleCount,
  };
};

const getSpoofCropRect = (
  frameWidth: number,
  frameHeight: number,
  detection: FaceDetectionResult,
  scale: number | null,
): Rect | null => {
  if (scale == null) {
    return {
      height: frameHeight,
      width: frameWidth,
      x: 0,
      y: 0,
    };
  }

  const box = detection.box;
  if (box.width <= 1 || box.height <= 1) {
    return null;
  }

  let safeScale = Math.min(
    (frameHeight - 1) / box.height,
    Math.min((frameWidth - 1) / box.width, scale),
  );
  if (!Number.isFinite(safeScale) || safeScale <= 0) {
    safeScale = 1;
  }

  const newWidth = box.width * safeScale;
  const newHeight = box.height * safeScale;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  let left = centerX - newWidth / 2;
  let top = centerY - newHeight / 2;
  let right = centerX + newWidth / 2;
  let bottom = centerY + newHeight / 2;

  if (left < 0) {
    right -= left;
    left = 0;
  }
  if (top < 0) {
    bottom -= top;
    top = 0;
  }
  if (right > frameWidth - 1) {
    left -= right - frameWidth + 1;
    right = frameWidth - 1;
  }
  if (bottom > frameHeight - 1) {
    top -= bottom - frameHeight + 1;
    bottom = frameHeight - 1;
  }

  const x = clamp(Math.round(left), 0, frameWidth - 1);
  const y = clamp(Math.round(top), 0, frameHeight - 1);
  const cropRight = clamp(Math.round(right), x, frameWidth - 1);
  const cropBottom = clamp(Math.round(bottom), y, frameHeight - 1);
  const width = cropRight - x + 1;
  const height = cropBottom - y + 1;

  if (width <= 1 || height <= 1) {
    return null;
  }

  return {
    height,
    width,
    x,
    y,
  };
};

export const createSpoofPipeline = (adapters: readonly SpoofAdapter[]): SpoofPipeline => {
  const canvas = document.createElement('canvas');
  canvas.width = SPOOF_INPUT_SIZE;
  canvas.height = SPOOF_INPUT_SIZE;
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!context) {
    throw new VerificationError('spoof.unavailable', 'Unable to create spoof canvas context.', {
      area: 'spoof',
    });
  }

  const modelContexts = adapters.map((adapter) => ({
    adapter,
    scale: parseSpoofModelScale(adapter.model),
  }));
  const inputData = new Float32Array(SPOOF_INPUT_SIZE * SPOOF_INPUT_SIZE * 3);
  const planeSize = SPOOF_INPUT_SIZE * SPOOF_INPUT_SIZE;

  return {
    async analyze(video: HTMLVideoElement, detection: FaceDetectionResult): Promise<SpoofFrameResult | null> {
      if (!video.videoWidth || !video.videoHeight || modelContexts.length === 0) {
        return null;
      }

      const startedAt = performance.now();
      const scoreSets: Float32Array[] = [];

      for (const model of modelContexts) {
        const crop = getSpoofCropRect(
          video.videoWidth,
          video.videoHeight,
          detection,
          model.scale,
        );
        if (!crop) {
          continue;
        }

        context.drawImage(
          video,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          SPOOF_INPUT_SIZE,
          SPOOF_INPUT_SIZE,
        );

        const rgba = context.getImageData(0, 0, SPOOF_INPUT_SIZE, SPOOF_INPUT_SIZE).data;
        for (let pixel = 0; pixel < planeSize; pixel += 1) {
          const sourceIndex = pixel * 4;
          inputData[pixel] = rgba[sourceIndex + 2];
          inputData[planeSize + pixel] = rgba[sourceIndex + 1];
          inputData[planeSize * 2 + pixel] = rgba[sourceIndex + 0];
        }

        try {
          const result = await model.adapter.run(inputData);
          if (result) {
            scoreSets.push(softmax(result.logits));
          }
        } catch {
          continue;
        }
      }

      const fusedScores = fuseSpoofScores(scoreSets);
      if (!fusedScores) {
        return null;
      }

      const labelIndex = getLabelIndex(fusedScores);
      const label = SPOOF_LABELS[labelIndex] ?? 'paper';

      return {
        confidence: fusedScores[labelIndex] || 0,
        label,
        labelIndex,
        modelsUsed: scoreSets.length,
        paperScore: fusedScores[0] || 0,
        realScore: fusedScores[1] || 0,
        runMs: performance.now() - startedAt,
        screenScore: fusedScores[2] || 0,
      };
    },
    async destroy() {
      await Promise.all(modelContexts.map((model) => model.adapter.dispose()));
    },
    metadata: {
      models: modelContexts.map((model) => ({
        id: model.adapter.model.id,
        inputs: [...model.adapter.metadata.inputs],
        outputs: [...model.adapter.metadata.outputs],
      })),
    },
  };
};
