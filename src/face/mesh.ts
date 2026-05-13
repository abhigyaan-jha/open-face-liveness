import type {
  FaceBlendshapeResult,
  FaceDetectionResult,
  FaceMeshResult,
  LandmarkBounds,
  Point3D,
  Rect,
  ZRange,
} from '../result.js';
import type { BlendshapeAdapter, MeshAdapter, MeshPipeline } from '../models.js';
import { VerificationError } from '../errors.js';
import { estimateFaceGeometry } from './geometry.js';
import { LandmarkSmoother } from './landmark-smoothing.js';

const MESH_INPUT_SIZE = 256;
const MESH_THRESHOLD = 0.5;
const BLENDSHAPE_LANDMARK_COUNT = 146;
const LANDMARK_SMOOTHING_OPTIONS = {
  beta: 80,
  derivativeCutoff: 1,
  minCutoff: 0.05,
} as const;
const BLENDSHAPE_LANDMARKS = [
  0, 1, 4, 5, 6, 7, 8, 10, 13, 14, 17, 21, 33, 37, 39,
  40, 46, 52, 53, 54, 55, 58, 61, 63, 65, 66, 67, 70, 78, 80,
  81, 82, 84, 87, 88, 91, 93, 95, 103, 105, 107, 109, 127, 132, 133,
  136, 144, 145, 146, 148, 149, 150, 152, 153, 154, 155, 157, 158, 159, 160,
  161, 162, 163, 168, 172, 173, 176, 178, 181, 185, 191, 195, 197, 234, 246,
  249, 251, 263, 267, 269, 270, 276, 282, 283, 284, 285, 288, 291, 293, 295,
  296, 297, 300, 308, 310, 311, 312, 314, 317, 318, 321, 323, 324, 332, 334,
  336, 338, 356, 361, 362, 365, 373, 374, 375, 377, 378, 379, 380, 381, 382,
  384, 385, 386, 387, 388, 389, 390, 397, 398, 400, 402, 405, 409, 415, 454,
  466, 468, 469, 470, 471, 472, 473, 474, 475, 476, 477,
] as const;

const BLENDSHAPE_INDEX = {
  eyeBlinkLeft: 9,
  eyeBlinkRight: 10,
  jawOpen: 25,
  mouthClose: 27,
} as const;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const toCropRect = (
  detection: FaceDetectionResult,
  frameWidth: number,
  frameHeight: number,
  roiExpandFactor: number,
): Rect | null => {
  const centerX = detection.box.x + detection.box.width / 2;
  const centerY = detection.box.y + detection.box.height / 2;
  const side = Math.min(
    Math.max(detection.box.width, detection.box.height) * roiExpandFactor,
    frameWidth,
    frameHeight,
  );

  const x = clamp(centerX - side / 2, 0, frameWidth - side);
  const y = clamp(centerY - side / 2, 0, frameHeight - side);

  if (side <= 1) {
    return null;
  }

  return {
    height: side,
    width: side,
    x,
    y,
  };
};

const projectLandmarksToFrame = (landmarks: Float32Array, crop: Rect): Float32Array => {
  const projected = new Float32Array(landmarks.length);
  const scaleX = crop.width / MESH_INPUT_SIZE;
  const scaleY = crop.height / MESH_INPUT_SIZE;
  const scaleZ = crop.width / MESH_INPUT_SIZE;

  for (let index = 0; index < landmarks.length; index += 3) {
    projected[index] = crop.x + landmarks[index] * scaleX;
    projected[index + 1] = crop.y + landmarks[index + 1] * scaleY;
    projected[index + 2] = landmarks[index + 2] * scaleZ;
  }

  return projected;
};

const normalizeLandmarks = (
  landmarks: Float32Array,
  frameWidth: number,
  frameHeight: number,
): Float32Array => {
  const normalized = new Float32Array(landmarks.length);
  const zScale = frameWidth || 1;

  for (let index = 0; index < landmarks.length; index += 3) {
    normalized[index] = landmarks[index] / frameWidth;
    normalized[index + 1] = landmarks[index + 1] / frameHeight;
    normalized[index + 2] = landmarks[index + 2] / zScale;
  }

  return normalized;
};

const denormalizeLandmarks = (
  landmarks: Float32Array,
  frameWidth: number,
  frameHeight: number,
): Float32Array => {
  const denormalized = new Float32Array(landmarks.length);
  const zScale = frameWidth || 1;

  for (let index = 0; index < landmarks.length; index += 3) {
    denormalized[index] = landmarks[index] * frameWidth;
    denormalized[index + 1] = landmarks[index + 1] * frameHeight;
    denormalized[index + 2] = landmarks[index + 2] * zScale;
  }

  return denormalized;
};

const createBlendshapeInput = (landmarks: Float32Array): Float32Array | null => {
  if (landmarks.length < 478 * 3) {
    return null;
  }

  const input = new Float32Array(BLENDSHAPE_LANDMARK_COUNT * 2);
  for (let index = 0; index < BLENDSHAPE_LANDMARKS.length; index += 1) {
    const landmarkIndex = BLENDSHAPE_LANDMARKS[index];
    const sourceOffset = landmarkIndex * 3;
    const targetOffset = index * 2;
    const x = landmarks[sourceOffset];
    const y = landmarks[sourceOffset + 1];

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    input[targetOffset] = x;
    input[targetOffset + 1] = y;
  }

  return input;
};

const createBlendshapeResult = (scores: Float32Array, runMs: number): FaceBlendshapeResult => ({
  eyeBlinkLeft: scores[BLENDSHAPE_INDEX.eyeBlinkLeft] ?? 0,
  eyeBlinkRight: scores[BLENDSHAPE_INDEX.eyeBlinkRight] ?? 0,
  jawOpen: scores[BLENDSHAPE_INDEX.jawOpen] ?? 0,
  mouthClose: scores[BLENDSHAPE_INDEX.mouthClose] ?? 0,
  runMs,
  scores,
});

const getLandmarkStats = (
  landmarks: Float32Array,
  frameWidth: number,
  frameHeight: number,
): {
  bounds: LandmarkBounds;
  centroid: Point3D;
  landmarkCount: number;
  visibleLandmarks: number;
  zRange: ZRange;
} => {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let visibleLandmarks = 0;

  const landmarkCount = Math.floor(landmarks.length / 3);

  for (let index = 0; index < landmarks.length; index += 3) {
    const x = landmarks[index];
    const y = landmarks[index + 1];
    const z = landmarks[index + 2];

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
    sumX += x;
    sumY += y;
    sumZ += z;

    if (x >= 0 && y >= 0 && x <= frameWidth && y <= frameHeight) {
      visibleLandmarks += 1;
    }
  }

  return {
    bounds: {
      maxX,
      maxY,
      minX,
      minY,
    },
    centroid: {
      x: sumX / landmarkCount,
      y: sumY / landmarkCount,
      z: sumZ / landmarkCount,
    },
    landmarkCount,
    visibleLandmarks,
    zRange: {
      max: maxZ,
      min: minZ,
      span: maxZ - minZ,
    },
  };
};

export const createMeshPipeline = (
  adapter: MeshAdapter,
  blendshapeAdapter: BlendshapeAdapter,
): MeshPipeline => {
  const canvas = document.createElement('canvas');
  canvas.width = MESH_INPUT_SIZE;
  canvas.height = MESH_INPUT_SIZE;
  const context = canvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!context) {
    throw new VerificationError('face.canvas_unavailable', 'Unable to create mesh canvas context.', {
      area: 'face',
    });
  }

  const inputData = new Float32Array(MESH_INPUT_SIZE * MESH_INPUT_SIZE * 3);
  const landmarkSmoother = new LandmarkSmoother(LANDMARK_SMOOTHING_OPTIONS);

  return {
    async destroy() {
      landmarkSmoother.reset();
      await Promise.all([adapter.dispose(), blendshapeAdapter.dispose()]);
    },
    async estimate(
      video: HTMLVideoElement,
      detection: FaceDetectionResult,
      options: { roiExpandFactor: number },
    ): Promise<FaceMeshResult | null> {
      if (!video.videoWidth || !video.videoHeight) {
        landmarkSmoother.reset();
        return null;
      }

      const crop = toCropRect(
        detection,
        video.videoWidth,
        video.videoHeight,
        options.roiExpandFactor,
      );

      if (!crop) {
        landmarkSmoother.reset();
        return null;
      }

      context.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        MESH_INPUT_SIZE,
        MESH_INPUT_SIZE,
      );

      const rgba = context.getImageData(0, 0, MESH_INPUT_SIZE, MESH_INPUT_SIZE).data;
      for (let pixel = 0; pixel < MESH_INPUT_SIZE * MESH_INPUT_SIZE; pixel += 1) {
        const sourceIndex = pixel * 4;
        const targetIndex = pixel * 3;
        inputData[targetIndex] = rgba[sourceIndex] / 255;
        inputData[targetIndex + 1] = rgba[sourceIndex + 1] / 255;
        inputData[targetIndex + 2] = rgba[sourceIndex + 2] / 255;
      }

      const result = await adapter.run({
        image: inputData,
      });

      if (!result || result.score < MESH_THRESHOLD) {
        landmarkSmoother.reset();
        return null;
      }

      const projectedLandmarks = projectLandmarksToFrame(result.landmarks, crop);
      const normalizedLandmarks = normalizeLandmarks(
        projectedLandmarks,
        video.videoWidth,
        video.videoHeight,
      );
      const smoothedLandmarks = landmarkSmoother.filter(
        normalizedLandmarks,
        performance.now() / 1000,
      );
      const landmarks = denormalizeLandmarks(
        smoothedLandmarks,
        video.videoWidth,
        video.videoHeight,
      );
      const blendshapeInput = createBlendshapeInput(landmarks);
      if (!blendshapeInput) {
        landmarkSmoother.reset();
        return null;
      }

      const blendshapeResult = await blendshapeAdapter.run(blendshapeInput);
      if (!blendshapeResult) {
        landmarkSmoother.reset();
        return null;
      }

      const stats = getLandmarkStats(landmarks, video.videoWidth, video.videoHeight);
      const geometry = estimateFaceGeometry(landmarks, video.videoWidth, video.videoHeight);

      return {
        blendshapes: createBlendshapeResult(blendshapeResult.scores, blendshapeResult.runMs),
        bounds: stats.bounds,
        centroid: stats.centroid,
        crop,
        frameHeight: video.videoHeight,
        frameWidth: video.videoWidth,
        geometry,
        landmarkCount: stats.landmarkCount,
        landmarks,
        runMs: result.runMs,
        score: result.score,
        visibleLandmarks: stats.visibleLandmarks,
        zRange: stats.zRange,
      };
    },
    metadata: adapter.metadata,
    reset() {
      landmarkSmoother.reset();
    },
  };
};
