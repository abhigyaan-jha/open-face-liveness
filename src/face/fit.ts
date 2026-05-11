import type {
  FaceFitOptions,
  FaceFitResult,
  Rect,
} from '../types.js';

export const validateFaceFit = (
  comparisonBox: Rect | null,
  guideBox: Rect | null,
  face: FaceFitOptions,
): FaceFitResult => {
  if (!guideBox || !comparisonBox) {
    return {
      comparisonBox,
      guideBox,
      heightFillRatio: null,
      horizontalOverflowRatio: null,
      insideAreaRatio: null,
      isAligned: false,
      isCenterWithinRelaxedBounds: false,
      isCentered: false,
      isContainedHorizontally: false,
      isContainedVertically: false,
      isFaceLargeEnough: false,
      isOverflowWithinBounds: false,
      verticalOverflowRatio: null,
      widthFillRatio: null,
    };
  }

  const tolerance = face.guideContainmentTolerancePx;
  const guideLeft = guideBox.x - tolerance;
  const guideTop = guideBox.y - tolerance;
  const guideRight = guideBox.x + guideBox.width + tolerance;
  const guideBottom = guideBox.y + guideBox.height + tolerance;
  const comparisonRight = comparisonBox.x + comparisonBox.width;
  const comparisonBottom = comparisonBox.y + comparisonBox.height;
  const comparisonArea = comparisonBox.width * comparisonBox.height;

  const isContainedHorizontally = comparisonBox.x >= guideLeft && comparisonRight <= guideRight;
  const isContainedVertically = comparisonBox.y >= guideTop && comparisonBottom <= guideBottom;
  const overlapLeft = Math.max(comparisonBox.x, guideLeft);
  const overlapTop = Math.max(comparisonBox.y, guideTop);
  const overlapRight = Math.min(comparisonRight, guideRight);
  const overlapBottom = Math.min(comparisonBottom, guideBottom);
  const overlapWidth = Math.max(0, overlapRight - overlapLeft);
  const overlapHeight = Math.max(0, overlapBottom - overlapTop);
  const insideAreaRatio = comparisonArea > 0 ? (overlapWidth * overlapHeight) / comparisonArea : 0;
  const overflowLeft = Math.max(0, guideLeft - comparisonBox.x);
  const overflowTop = Math.max(0, guideTop - comparisonBox.y);
  const overflowRight = Math.max(0, comparisonRight - guideRight);
  const overflowBottom = Math.max(0, comparisonBottom - guideBottom);
  const horizontalOverflowRatio = guideBox.width > 0 ? (overflowLeft + overflowRight) / guideBox.width : 1;
  const verticalOverflowRatio = guideBox.height > 0 ? (overflowTop + overflowBottom) / guideBox.height : 1;
  const centerX = comparisonBox.x + comparisonBox.width / 2;
  const centerY = comparisonBox.y + comparisonBox.height / 2;
  const centerMarginX = guideBox.width * face.guideRelaxedCenterMarginRatio;
  const centerMarginY = guideBox.height * face.guideRelaxedCenterMarginRatio;
  const isCenterWithinRelaxedBounds =
    centerX >= guideBox.x - centerMarginX &&
    centerX <= guideBox.x + guideBox.width + centerMarginX &&
    centerY >= guideBox.y - centerMarginY &&
    centerY <= guideBox.y + guideBox.height + centerMarginY;
  const widthFillRatio = comparisonBox.width / guideBox.width;
  const heightFillRatio = comparisonBox.height / guideBox.height;
  const isFaceLargeEnough =
    widthFillRatio >= face.guideMinWidthFillRatio && heightFillRatio >= face.guideMinHeightFillRatio;
  const isOverflowWithinBounds =
    horizontalOverflowRatio <= face.guideMaxHorizontalOverflowRatio &&
    verticalOverflowRatio <= face.guideMaxVerticalOverflowRatio;
  const isCentered =
    isCenterWithinRelaxedBounds &&
    (insideAreaRatio >= face.guideMinInsideAreaRatio || isOverflowWithinBounds);

  return {
    comparisonBox,
    guideBox,
    heightFillRatio,
    horizontalOverflowRatio,
    insideAreaRatio,
    isAligned: isCentered && isFaceLargeEnough,
    isCenterWithinRelaxedBounds,
    isCentered,
    isContainedHorizontally,
    isContainedVertically,
    isFaceLargeEnough,
    isOverflowWithinBounds,
    verticalOverflowRatio,
    widthFillRatio,
  };
};
