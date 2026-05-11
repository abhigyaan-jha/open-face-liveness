import type { DetectorAdapter, DetectorPipeline } from '../models.js';
import type { FaceDetectionResult } from '../result.js';
import { VerificationError } from '../errors.js';

const DETECTOR_INPUT_SIZE = 128;
const DETECTION_THRESHOLD = 0.5;
const DETECTOR_NUM_COORDS = 16;
const DETECTOR_NUM_BOXES = 896;
const DETECTOR_X_SCALE = 128;
const DETECTOR_Y_SCALE = 128;
const DETECTOR_W_SCALE = 128;
const DETECTOR_H_SCALE = 128;

interface DetectorAnchor {
  h: number;
  w: number;
  xCenter: number;
  yCenter: number;
}

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

const calculateScale = (
  minScale: number,
  maxScale: number,
  strideIndex: number,
  strideCount: number,
): number => {
  if (strideCount === 1) {
    return (minScale + maxScale) * 0.5;
  }

  return minScale + ((maxScale - minScale) * strideIndex) / (strideCount - 1);
};

const createDetectorAnchors = (): DetectorAnchor[] => {
  const options = {
    anchorOffsetX: 0.5,
    anchorOffsetY: 0.5,
    aspectRatios: [1.0],
    fixedAnchorSize: true,
    inputSizeHeight: DETECTOR_INPUT_SIZE,
    inputSizeWidth: DETECTOR_INPUT_SIZE,
    interpolatedScaleAspectRatio: 1.0,
    maxScale: 0.75,
    minScale: 0.1484375,
    numLayers: 4,
    strides: [8, 16, 16, 16],
  };

  const anchors: DetectorAnchor[] = [];
  let layerId = 0;

  while (layerId < options.numLayers) {
    const anchorHeights: number[] = [];
    const anchorWidths: number[] = [];
    const scales: number[] = [];
    const aspectRatios: number[] = [];

    let lastSameStrideLayer = layerId;
    while (
      lastSameStrideLayer < options.strides.length &&
      options.strides[lastSameStrideLayer] === options.strides[layerId]
    ) {
      const scale = calculateScale(
        options.minScale,
        options.maxScale,
        lastSameStrideLayer,
        options.strides.length,
      );

      for (const aspectRatio of options.aspectRatios) {
        aspectRatios.push(aspectRatio);
        scales.push(scale);
      }

      if (options.interpolatedScaleAspectRatio > 0) {
        const scaleNext =
          lastSameStrideLayer === options.strides.length - 1
            ? 1
            : calculateScale(
                options.minScale,
                options.maxScale,
                lastSameStrideLayer + 1,
                options.strides.length,
              );
        scales.push(Math.sqrt(scale * scaleNext));
        aspectRatios.push(options.interpolatedScaleAspectRatio);
      }

      lastSameStrideLayer += 1;
    }

    for (let index = 0; index < aspectRatios.length; index += 1) {
      const ratioSqrt = Math.sqrt(aspectRatios[index]);
      anchorHeights.push(scales[index] / ratioSqrt);
      anchorWidths.push(scales[index] * ratioSqrt);
    }

    const stride = options.strides[layerId];
    const featureMapHeight = Math.ceil(options.inputSizeHeight / stride);
    const featureMapWidth = Math.ceil(options.inputSizeWidth / stride);

    for (let y = 0; y < featureMapHeight; y += 1) {
      for (let x = 0; x < featureMapWidth; x += 1) {
        for (let anchorId = 0; anchorId < anchorHeights.length; anchorId += 1) {
          anchors.push({
            h: options.fixedAnchorSize ? 1 : anchorHeights[anchorId],
            w: options.fixedAnchorSize ? 1 : anchorWidths[anchorId],
            xCenter: (x + options.anchorOffsetX) / featureMapWidth,
            yCenter: (y + options.anchorOffsetY) / featureMapHeight,
          });
        }
      }
    }

    layerId = lastSameStrideLayer;
  }

  return anchors;
};

const DETECTOR_ANCHORS = createDetectorAnchors();

const decodeBestDetection = (
  scores: Float32Array,
  boxes: Float32Array,
  frameWidth: number,
  frameHeight: number,
): FaceDetectionResult | null => {
  let bestDetection: FaceDetectionResult | null = null;

  for (let index = 0; index < DETECTOR_NUM_BOXES; index += 1) {
    const score = sigmoid(scores[index]);
    if (score < DETECTION_THRESHOLD) {
      continue;
    }

    const anchor = DETECTOR_ANCHORS[index];
    if (!anchor) {
      continue;
    }

    const offset = index * DETECTOR_NUM_COORDS;
    const xCenter = (boxes[offset + 0] / DETECTOR_X_SCALE) * anchor.w + anchor.xCenter;
    const yCenter = (boxes[offset + 1] / DETECTOR_Y_SCALE) * anchor.h + anchor.yCenter;
    const width = (boxes[offset + 2] / DETECTOR_W_SCALE) * anchor.w;
    const height = (boxes[offset + 3] / DETECTOR_H_SCALE) * anchor.h;

    const nextDetection: FaceDetectionResult = {
      box: {
        height: height * frameHeight,
        width: width * frameWidth,
        x: (xCenter - width / 2) * frameWidth,
        y: (yCenter - height / 2) * frameHeight,
      },
      runMs: 0,
      score,
    };

    if (nextDetection.box.width <= 1 || nextDetection.box.height <= 1) {
      continue;
    }

    if (!bestDetection || nextDetection.score > bestDetection.score) {
      bestDetection = nextDetection;
    }
  }

  return bestDetection;
};

export const createDetectorPipeline = (adapter: DetectorAdapter): DetectorPipeline => {
  const canvas = document.createElement('canvas');
  canvas.width = DETECTOR_INPUT_SIZE;
  canvas.height = DETECTOR_INPUT_SIZE;
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!context) {
    throw new VerificationError('face.canvas_unavailable', 'Unable to create detector canvas context.', {
      area: 'face',
    });
  }

  const inputData = new Float32Array(DETECTOR_INPUT_SIZE * DETECTOR_INPUT_SIZE * 3);

  return {
    async destroy() {
      await adapter.dispose();
    },
    async detect(video: HTMLVideoElement): Promise<FaceDetectionResult | null> {
      if (!video.videoWidth || !video.videoHeight) {
        return null;
      }

      context.drawImage(video, 0, 0, DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE);
      const rgba = context.getImageData(0, 0, DETECTOR_INPUT_SIZE, DETECTOR_INPUT_SIZE).data;

      for (let pixel = 0; pixel < DETECTOR_INPUT_SIZE * DETECTOR_INPUT_SIZE; pixel += 1) {
        const sourceIndex = pixel * 4;
        const targetIndex = pixel * 3;
        inputData[targetIndex + 0] = rgba[sourceIndex + 0] / 127.5 - 1;
        inputData[targetIndex + 1] = rgba[sourceIndex + 1] / 127.5 - 1;
        inputData[targetIndex + 2] = rgba[sourceIndex + 2] / 127.5 - 1;
      }

      const result = await adapter.run(inputData);
      const detection = decodeBestDetection(
        result.scores,
        result.boxes,
        video.videoWidth,
        video.videoHeight,
      );

      if (!detection) {
        return null;
      }

      return {
        ...detection,
        runMs: result.runMs,
      };
    },
    metadata: adapter.metadata,
  };
};
