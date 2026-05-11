import type { Rect } from '../types.js';

export type FrameDisplayFit = 'contain' | 'cover' | 'fill';

export interface FrameSize {
  height: number;
  width: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface FrameMapper {
  mapPoint(x: number, y: number): Point2D;
  mapRect(rect: Rect): Rect;
}

export interface FrameMapperOptions {
  fit?: FrameDisplayFit;
  mirrored?: boolean;
}

const isPositiveFinite = (value: number): boolean => Number.isFinite(value) && value > 0;

export const createFrameToDisplayMapper = (
  frame: FrameSize,
  display: FrameSize,
  options: FrameMapperOptions = {},
): FrameMapper => {
  const fit = options.fit ?? 'fill';
  const mirrored = options.mirrored ?? false;

  if (
    !isPositiveFinite(frame.width) ||
    !isPositiveFinite(frame.height) ||
    !isPositiveFinite(display.width) ||
    !isPositiveFinite(display.height)
  ) {
    return {
      mapPoint: () => ({ x: 0, y: 0 }),
      mapRect: () => ({ height: 0, width: 0, x: 0, y: 0 }),
    };
  }

  if (fit === 'fill') {
    const scaleX = display.width / frame.width;
    const scaleY = display.height / frame.height;
    const mapX = (x: number) => {
      const mappedX = x * scaleX;
      return mirrored ? display.width - mappedX : mappedX;
    };
    const mapY = (y: number) => y * scaleY;

    return createMapper(mapX, mapY);
  }

  const scale =
    fit === 'cover'
      ? Math.max(display.width / frame.width, display.height / frame.height)
      : Math.min(display.width / frame.width, display.height / frame.height);
  const renderedWidth = frame.width * scale;
  const renderedHeight = frame.height * scale;
  const offsetX = (display.width - renderedWidth) / 2;
  const offsetY = (display.height - renderedHeight) / 2;
  const mapX = (x: number) => {
    const mappedX = offsetX + x * scale;
    return mirrored ? display.width - mappedX : mappedX;
  };
  const mapY = (y: number) => offsetY + y * scale;

  return createMapper(mapX, mapY);
};

const createMapper = (
  mapX: (x: number) => number,
  mapY: (y: number) => number,
): FrameMapper => ({
  mapPoint: (x: number, y: number) => ({
    x: mapX(x),
    y: mapY(y),
  }),
  mapRect: (rect: Rect) => {
    const left = mapX(rect.x);
    const right = mapX(rect.x + rect.width);
    const top = mapY(rect.y);
    const bottom = mapY(rect.y + rect.height);

    return {
      height: Math.abs(bottom - top),
      width: Math.abs(right - left),
      x: Math.min(left, right),
      y: Math.min(top, bottom),
    };
  },
});
