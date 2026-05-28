import type {
  FaceGeometryResult,
  FacePoseResult,
  LandmarkList,
  Point3D,
  Rect,
} from '../result.js';
import { FACE_GEOMETRY_PROCRUSTES_BASIS } from './geometry-metadata.js';

const FACE_GUIDE_WIDTH_RATIO = 0.35;
export const FACE_GUIDE_ASPECT_RATIO = 360 / 448;
const FACE_GUIDE_MAX_HEIGHT_RATIO = 0.82;
const FACE_LANDMARK_COUNT = 468;
const FIT_WIDTH_PADDING_RATIO = 0.16;
const FIT_TOP_PADDING_RATIO = 0.08;
const ANCHOR_PADDING_RATIO = 0.16;
const FIT_LANDMARKS = [
  6, 8, 9, 10, 21, 54, 67, 93, 103, 109, 117, 127, 132, 151, 168, 193, 197,
  234, 251, 284, 297, 323, 332, 338, 346, 356, 361, 454,
] as const;
const ANCHOR_LANDMARKS = [
  6, 8, 9, 10, 21, 54, 67, 93, 103, 109, 117, 127, 132, 151, 168, 193, 197,
  234, 251, 284, 297, 323, 332, 338, 346, 356, 361, 454,
] as const;

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
const clampUnit = (value: number): number => clamp(value, -1, 1);

export const getFaceGuideRect = (frameWidth: number, frameHeight: number): Rect | null => {
  if (!isPositiveFinite(frameWidth) || !isPositiveFinite(frameHeight)) {
    return null;
  }

  const widthFromFrame = frameWidth * FACE_GUIDE_WIDTH_RATIO;
  const widthFromHeight = frameHeight * FACE_GUIDE_MAX_HEIGHT_RATIO * FACE_GUIDE_ASPECT_RATIO;
  const width = Math.max(1, Math.min(widthFromFrame, widthFromHeight));
  const height = width / FACE_GUIDE_ASPECT_RATIO;

  return {
    height,
    width,
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
  };
};

export const clampRectToFrame = (rect: Rect, frameWidth: number, frameHeight: number): Rect | null => {
  if (!isPositiveFinite(frameWidth) || !isPositiveFinite(frameHeight)) {
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
    height,
    width,
    x,
    y,
  };
};

const getLandmarkPoint = (landmarks: LandmarkList, index: number): Point3D | null => {
  const offset = index * 3;
  if (index < 0 || index >= FACE_LANDMARK_COUNT || offset + 2 >= landmarks.length) {
    return null;
  }

  const x = landmarks[offset];
  const y = landmarks[offset + 1];
  const z = landmarks[offset + 2];

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return { x, y, z };
};

const getLandmarkBounds = (
  landmarks: LandmarkList,
  indices: readonly number[],
): { maxX: number; maxY: number; minX: number; minY: number } | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const index of indices) {
    const point = getLandmarkPoint(landmarks, index);
    if (!point) {
      continue;
    }

    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    count += 1;
  }

  if (count < 4 || maxX - minX <= 1 || maxY - minY <= 1) {
    return null;
  }

  return { maxX, maxY, minX, minY };
};

export const getLandmarkFaceFitBox = (
  landmarks: LandmarkList,
  frameWidth: number,
  frameHeight: number,
): Rect | null => {
  const bounds = getLandmarkBounds(landmarks, FIT_LANDMARKS);
  if (!bounds) {
    return null;
  }

  const stableWidth = bounds.maxX - bounds.minX;
  const width = stableWidth * (1 + FIT_WIDTH_PADDING_RATIO);
  const height = width / FACE_GUIDE_ASPECT_RATIO;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const x = centerX - width / 2;
  const y = bounds.minY - height * FIT_TOP_PADDING_RATIO;

  return clampRectToFrame({ height, width, x, y }, frameWidth, frameHeight);
};

export const getLandmarkAnchorBox = (
  landmarks: LandmarkList,
  frameWidth: number,
  frameHeight: number,
): Rect | null => {
  const bounds = getLandmarkBounds(landmarks, ANCHOR_LANDMARKS);
  if (!bounds) {
    return null;
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const padding = Math.max(width, height) * ANCHOR_PADDING_RATIO;

  return clampRectToFrame(
    {
      height: height + padding * 2,
      width: width + padding * 2,
      x: bounds.minX - padding,
      y: bounds.minY - padding,
    },
    frameWidth,
    frameHeight,
  );
};

interface WeightedPointSet {
  sourceCentroid: Point3D;
  targetCentroid: Point3D;
  totalWeight: number;
}

const getWeightedPointSet = (landmarks: LandmarkList): WeightedPointSet | null => {
  let totalWeight = 0;
  let sourceX = 0;
  let sourceY = 0;
  let sourceZ = 0;
  let targetX = 0;
  let targetY = 0;
  let targetZ = 0;

  for (const point of FACE_GEOMETRY_PROCRUSTES_BASIS) {
    const target = getLandmarkPoint(landmarks, point.index);
    if (!target) {
      return null;
    }

    const weight = point.weight;
    totalWeight += weight;
    sourceX += point.x * weight;
    sourceY += -point.y * weight;
    sourceZ += -point.z * weight;
    targetX += target.x * weight;
    targetY += target.y * weight;
    targetZ += target.z * weight;
  }

  if (totalWeight <= 0) {
    return null;
  }

  return {
    sourceCentroid: {
      x: sourceX / totalWeight,
      y: sourceY / totalWeight,
      z: sourceZ / totalWeight,
    },
    targetCentroid: {
      x: targetX / totalWeight,
      y: targetY / totalWeight,
      z: targetZ / totalWeight,
    },
    totalWeight,
  };
};

const multiplySymmetric4 = (
  matrix: readonly number[],
  vector: readonly number[],
): [number, number, number, number] => [
  matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2] + matrix[3] * vector[3],
  matrix[4] * vector[0] + matrix[5] * vector[1] + matrix[6] * vector[2] + matrix[7] * vector[3],
  matrix[8] * vector[0] + matrix[9] * vector[1] + matrix[10] * vector[2] + matrix[11] * vector[3],
  matrix[12] * vector[0] + matrix[13] * vector[1] + matrix[14] * vector[2] + matrix[15] * vector[3],
];

const getDominantQuaternion = (matrix: readonly number[]): [number, number, number, number] | null => {
  let quaternion: [number, number, number, number] = [1, 0, 0, 0];

  for (let iteration = 0; iteration < 24; iteration += 1) {
    const next = multiplySymmetric4(matrix, quaternion);
    const norm = Math.hypot(next[0], next[1], next[2], next[3]);
    if (!Number.isFinite(norm) || norm <= 0) {
      return null;
    }
    quaternion = [
      next[0] / norm,
      next[1] / norm,
      next[2] / norm,
      next[3] / norm,
    ];
  }

  return quaternion;
};

const quaternionToRotation = (
  quaternion: readonly [number, number, number, number],
): [number, number, number, number, number, number, number, number, number] => {
  const [w, x, y, z] = quaternion;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  return [
    1 - 2 * (yy + zz),
    2 * (xy - wz),
    2 * (xz + wy),
    2 * (xy + wz),
    1 - 2 * (xx + zz),
    2 * (yz - wx),
    2 * (xz - wy),
    2 * (yz + wx),
    1 - 2 * (xx + yy),
  ];
};

const rotationToPose = (
  rotation: readonly [number, number, number, number, number, number, number, number, number],
): Omit<FacePoseResult, 'matrix'> => ({
  pitch: Math.atan2(rotation[7], rotation[8]),
  roll: Math.atan2(rotation[3], rotation[0]),
  yaw: Math.asin(clampUnit(-rotation[6])),
});

const estimateFaceTransform = (landmarks: LandmarkList): FacePoseResult | null => {
  const pointSet = getWeightedPointSet(landmarks);
  if (!pointSet) {
    return null;
  }

  const { sourceCentroid, targetCentroid } = pointSet;
  let h00 = 0;
  let h01 = 0;
  let h02 = 0;
  let h10 = 0;
  let h11 = 0;
  let h12 = 0;
  let h20 = 0;
  let h21 = 0;
  let h22 = 0;
  let sourceNorm = 0;

  for (const point of FACE_GEOMETRY_PROCRUSTES_BASIS) {
    const target = getLandmarkPoint(landmarks, point.index);
    if (!target) {
      return null;
    }

    const sourceX = point.x - sourceCentroid.x;
    const sourceY = -point.y - sourceCentroid.y;
    const sourceZ = -point.z - sourceCentroid.z;
    const targetX = target.x - targetCentroid.x;
    const targetY = target.y - targetCentroid.y;
    const targetZ = target.z - targetCentroid.z;
    const weight = point.weight;

    h00 += weight * sourceX * targetX;
    h01 += weight * sourceX * targetY;
    h02 += weight * sourceX * targetZ;
    h10 += weight * sourceY * targetX;
    h11 += weight * sourceY * targetY;
    h12 += weight * sourceY * targetZ;
    h20 += weight * sourceZ * targetX;
    h21 += weight * sourceZ * targetY;
    h22 += weight * sourceZ * targetZ;
    sourceNorm += weight * (sourceX * sourceX + sourceY * sourceY + sourceZ * sourceZ);
  }

  if (sourceNorm <= 0) {
    return null;
  }

  const trace = h00 + h11 + h22;
  const hornMatrix = [
    trace,
    h12 - h21,
    h20 - h02,
    h01 - h10,
    h12 - h21,
    h00 - h11 - h22,
    h01 + h10,
    h20 + h02,
    h20 - h02,
    h01 + h10,
    -h00 + h11 - h22,
    h12 + h21,
    h01 - h10,
    h20 + h02,
    h12 + h21,
    -h00 - h11 + h22,
  ];
  const quaternion = getDominantQuaternion(hornMatrix);
  if (!quaternion) {
    return null;
  }

  const rotation = quaternionToRotation(quaternion);
  let scaleNumerator = 0;
  for (const point of FACE_GEOMETRY_PROCRUSTES_BASIS) {
    const target = getLandmarkPoint(landmarks, point.index);
    if (!target) {
      return null;
    }

    const sourceX = point.x - sourceCentroid.x;
    const sourceY = -point.y - sourceCentroid.y;
    const sourceZ = -point.z - sourceCentroid.z;
    const targetX = target.x - targetCentroid.x;
    const targetY = target.y - targetCentroid.y;
    const targetZ = target.z - targetCentroid.z;
    const rotatedX = rotation[0] * sourceX + rotation[1] * sourceY + rotation[2] * sourceZ;
    const rotatedY = rotation[3] * sourceX + rotation[4] * sourceY + rotation[5] * sourceZ;
    const rotatedZ = rotation[6] * sourceX + rotation[7] * sourceY + rotation[8] * sourceZ;

    scaleNumerator += point.weight * (
      targetX * rotatedX +
      targetY * rotatedY +
      targetZ * rotatedZ
    );
  }

  const scale = scaleNumerator / sourceNorm;
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const translationX = targetCentroid.x - scale * (
    rotation[0] * sourceCentroid.x +
    rotation[1] * sourceCentroid.y +
    rotation[2] * sourceCentroid.z
  );
  const translationY = targetCentroid.y - scale * (
    rotation[3] * sourceCentroid.x +
    rotation[4] * sourceCentroid.y +
    rotation[5] * sourceCentroid.z
  );
  const translationZ = targetCentroid.z - scale * (
    rotation[6] * sourceCentroid.x +
    rotation[7] * sourceCentroid.y +
    rotation[8] * sourceCentroid.z
  );
  const pose = rotationToPose(rotation);

  return {
    matrix: [
      scale * rotation[0],
      scale * rotation[1],
      scale * rotation[2],
      translationX,
      scale * rotation[3],
      scale * rotation[4],
      scale * rotation[5],
      translationY,
      scale * rotation[6],
      scale * rotation[7],
      scale * rotation[8],
      translationZ,
      0,
      0,
      0,
      1,
    ],
    pitch: pose.pitch,
    roll: pose.roll,
    yaw: pose.yaw,
  };
};

export const estimateFaceGeometry = (
  landmarks: LandmarkList,
  frameWidth: number,
  frameHeight: number,
): FaceGeometryResult => ({
  anchorBox: getLandmarkAnchorBox(landmarks, frameWidth, frameHeight),
  fitBox: getLandmarkFaceFitBox(landmarks, frameWidth, frameHeight),
  pose: estimateFaceTransform(landmarks),
});
