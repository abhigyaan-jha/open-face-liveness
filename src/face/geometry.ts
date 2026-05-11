import type { FaceDetectionResult, Rect } from '../result.js';

const FACE_GUIDE_WIDTH_RATIO = 0.35;
export const FACE_GUIDE_ASPECT_RATIO = 360 / 448;
const FACE_GUIDE_MAX_HEIGHT_RATIO = 0.82;

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

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

export const getFaceComparisonBox = (
  detection: FaceDetectionResult,
  frameWidth: number,
  frameHeight: number,
): Rect | null => clampRectToFrame(detection.box, frameWidth, frameHeight);
