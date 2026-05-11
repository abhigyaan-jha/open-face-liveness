import type {
  FaceDetectionResult,
  FaceMeshResult,
  LandmarkBounds,
  Point3D,
  Rect,
  ZRange,
} from '../result.js';
import type { MeshAdapter, MeshPipeline } from '../models.js';
import { VerificationError } from '../errors.js';

const MESH_INPUT_SIZE = 192;
const MESH_THRESHOLD = 0.5;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const toCropRect = (
  detection: FaceDetectionResult,
  frameWidth: number,
  frameHeight: number,
  roiExpandFactor: number,
): Rect | null => {
  const centerX = detection.box.x + detection.box.width / 2;
  const centerY = detection.box.y + detection.box.height / 2;
  const expandedWidth = detection.box.width * roiExpandFactor;
  const expandedHeight = detection.box.height * roiExpandFactor;

  let x = centerX - expandedWidth / 2;
  let y = centerY - expandedHeight / 2;
  let width = expandedWidth;
  let height = expandedHeight;

  x = clamp(x, 0, frameWidth);
  y = clamp(y, 0, frameHeight);

  if (x + width > frameWidth) {
    width = frameWidth - x;
  }

  if (y + height > frameHeight) {
    height = frameHeight - y;
  }

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

export const createMeshPipeline = (adapter: MeshAdapter): MeshPipeline => {
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

  return {
    async destroy() {
      await adapter.dispose();
    },
    async estimate(
      video: HTMLVideoElement,
      detection: FaceDetectionResult,
      options: { roiExpandFactor: number },
    ): Promise<FaceMeshResult | null> {
      if (!video.videoWidth || !video.videoHeight) {
        return null;
      }

      const crop = toCropRect(
        detection,
        video.videoWidth,
        video.videoHeight,
        options.roiExpandFactor,
      );

      if (!crop) {
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
      const planeSize = MESH_INPUT_SIZE * MESH_INPUT_SIZE;
      for (let y = 0; y < MESH_INPUT_SIZE; y += 1) {
        for (let x = 0; x < MESH_INPUT_SIZE; x += 1) {
          const pixel = y * MESH_INPUT_SIZE + x;
          const sourceIndex = pixel * 4;
          inputData[pixel] = rgba[sourceIndex + 0] / 255;
          inputData[planeSize + pixel] = rgba[sourceIndex + 1] / 255;
          inputData[planeSize * 2 + pixel] = rgba[sourceIndex + 2] / 255;
        }
      }

      const result = await adapter.run({
        crop,
        image: inputData,
      });

      if (!result || result.score < MESH_THRESHOLD) {
        return null;
      }

      const stats = getLandmarkStats(result.landmarks, video.videoWidth, video.videoHeight);

      return {
        bounds: stats.bounds,
        centroid: stats.centroid,
        crop,
        frameHeight: video.videoHeight,
        frameWidth: video.videoWidth,
        landmarkCount: stats.landmarkCount,
        landmarks: result.landmarks,
        runMs: result.runMs,
        score: result.score,
        visibleLandmarks: stats.visibleLandmarks,
        zRange: stats.zRange,
      };
    },
    metadata: adapter.metadata,
  };
};
