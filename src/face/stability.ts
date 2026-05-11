import type {
  FaceAnchorDrift,
  FaceAnchorPosition,
  FaceFitOptions,
  Rect,
} from '../types.js';

export const getAnchorPosition = (
  comparisonBox: Rect | null,
  frameWidth: number,
  frameHeight: number,
): FaceAnchorPosition | null => {
  if (!comparisonBox || !frameWidth || !frameHeight) {
    return null;
  }

  return {
    width: comparisonBox.width / frameWidth,
    x: (comparisonBox.x + comparisonBox.width / 2) / frameWidth,
    y: (comparisonBox.y + comparisonBox.height / 2) / frameHeight,
  };
};

export const getAnchorDrift = (
  anchorPosition: FaceAnchorPosition | null,
  reference: FaceAnchorPosition | null,
): FaceAnchorDrift | null => {
  if (!anchorPosition || !reference) {
    return null;
  }

  const widthDelta = anchorPosition.width - reference.width;
  const referenceWidth = Number.isFinite(reference.width) && reference.width > 0 ? reference.width : null;

  return {
    deltaX: Math.abs(anchorPosition.x - reference.x),
    deltaY: Math.abs(anchorPosition.y - reference.y),
    distanceIncreaseRatio: referenceWidth ? widthDelta / referenceWidth : 0,
    widthDelta,
  };
};

export const isAnchorStable = (drift: FaceAnchorDrift | null, face: FaceFitOptions): boolean => {
  if (!drift) {
    return true;
  }

  return (
    drift.deltaX <= face.stabilityMovementThreshold &&
    drift.deltaY <= face.stabilityVerticalMovementThreshold &&
    Math.abs(drift.distanceIncreaseRatio) <= face.stabilityDistanceIncreaseThreshold
  );
};

