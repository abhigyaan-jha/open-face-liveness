// 8-bit RGB to HSV, ported from OpenCV's RGB2HSV_b so light-check values match OpenCV
// exactly: hue 0-180, saturation and value 0-255, with OpenCV's fixed-point rounding.
const HSV_SHIFT = 12;
const HSV_ROUND = 1 << (HSV_SHIFT - 1);
const HUE_RANGE = 180;

const SATURATION_DIVISORS = Int32Array.from({ length: 256 }, (_, value) =>
  value === 0 ? 0 : Math.round((255 << HSV_SHIFT) / value));
const HUE_DIVISORS = Int32Array.from({ length: 256 }, (_, delta) =>
  delta === 0 ? 0 : Math.round((HUE_RANGE << HSV_SHIFT) / (6 * delta)));

// Hue is an integer 0-180 (2 degrees per step), so its unit vector can be precomputed.
const HUE_SIN = Float64Array.from({ length: HUE_RANGE + 1 }, (_, hue) => Math.sin((hue * 2 * Math.PI) / HUE_RANGE));
const HUE_COS = Float64Array.from({ length: HUE_RANGE + 1 }, (_, hue) => Math.cos((hue * 2 * Math.PI) / HUE_RANGE));

export interface Hsv {
  hue: number;
  saturation: number;
  value: number;
}

export const rgbToHsv = (red: number, green: number, blue: number): Hsv => {
  const value = Math.max(red, green, blue);
  const delta = value - Math.min(red, green, blue);
  const valueIsRed = value === red ? -1 : 0;
  const valueIsGreen = value === green ? -1 : 0;

  const saturation = (delta * SATURATION_DIVISORS[value] + HSV_ROUND) >> HSV_SHIFT;
  let hue = (valueIsRed & (green - blue))
    + (~valueIsRed & ((valueIsGreen & (blue - red + 2 * delta)) + (~valueIsGreen & (red - green + 4 * delta))));
  hue = (hue * HUE_DIVISORS[delta] + HSV_ROUND) >> HSV_SHIFT;
  if (hue < 0) {
    hue += HUE_RANGE;
  }

  return { hue, saturation, value };
};

export interface LightSampleRegion {
  data: Uint8ClampedArray;
  height: number;
  width: number;
}

export interface LightSampleTotals {
  blueTotal: number;
  greenTotal: number;
  hueCosTotal: number;
  hueSinTotal: number;
  redTotal: number;
  sampledPixels: number;
  saturationTotal: number;
  valueTotal: number;
}

/** Sums RGB, hue unit vectors, saturation, and value over every pixel of RGBA regions. */
export const sampleLightRegions = (regions: readonly LightSampleRegion[]): LightSampleTotals => {
  const totals: LightSampleTotals = {
    blueTotal: 0,
    greenTotal: 0,
    hueCosTotal: 0,
    hueSinTotal: 0,
    redTotal: 0,
    sampledPixels: 0,
    saturationTotal: 0,
    valueTotal: 0,
  };

  for (const region of regions) {
    const pixelCount = region.width * region.height;
    if (!pixelCount || region.data.length < pixelCount * 4) {
      continue;
    }

    for (let index = 0; index < pixelCount * 4; index += 4) {
      const red = region.data[index];
      const green = region.data[index + 1];
      const blue = region.data[index + 2];
      const { hue, saturation, value } = rgbToHsv(red, green, blue);
      totals.redTotal += red;
      totals.greenTotal += green;
      totals.blueTotal += blue;
      totals.hueSinTotal += HUE_SIN[hue];
      totals.hueCosTotal += HUE_COS[hue];
      totals.saturationTotal += saturation;
      totals.valueTotal += value;
    }
    totals.sampledPixels += pixelCount;
  }

  return totals;
};
