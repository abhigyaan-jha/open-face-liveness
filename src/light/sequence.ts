import type { LightTestColor } from '../result.js';
import { VerificationError } from '../errors.js';

export type LightRandomSource = () => number;

export interface CreateLightSequenceOptions {
  colors?: readonly LightTestColor[];
  length?: number;
  random?: LightRandomSource;
}

export const DEFAULT_LIGHT_TEST_COLORS: readonly LightTestColor[] = [
  { css: '#ff0000', id: 'red', label: 'Red', rgb: [255, 0, 0] },
  { css: '#ffea00', id: 'yellow', label: 'Yellow', rgb: [255, 234, 0] },
  { css: '#00ff00', id: 'green', label: 'Green', rgb: [0, 255, 0] },
  { css: '#00ffff', id: 'cyan', label: 'Cyan', rgb: [0, 255, 255] },
  { css: '#0000ff', id: 'blue', label: 'Blue', rgb: [0, 0, 255] },
  { css: '#ff00ff', id: 'magenta', label: 'Magenta', rgb: [255, 0, 255] },
];

export const DEFAULT_LIGHT_SEQUENCE: readonly LightTestColor[] =
  DEFAULT_LIGHT_TEST_COLORS.map((color) => ({
    ...color,
    rgb: [color.rgb[0], color.rgb[1], color.rgb[2]],
  }));

const getCryptoRandomFraction = (): number => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return (values[0] ?? 0) / (0xffffffff + 1);
  }

  return Math.random();
};

const isFiniteRgbValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 255;

export const cloneLightTestColor = (color: LightTestColor): LightTestColor => ({
  ...color,
  rgb: [color.rgb[0], color.rgb[1], color.rgb[2]],
});

const normalizeLightTestColor = (color: LightTestColor, index: number): LightTestColor => {
  if (!color || typeof color !== 'object') {
    throw new VerificationError(
      'light.invalid_sequence',
      `Light sequence color at index ${index} must be an object.`,
      { area: 'light' },
    );
  }

  if (typeof color.id !== 'string' || !color.id.trim()) {
    throw new VerificationError(
      'light.invalid_sequence',
      `Light sequence color at index ${index} is missing an id.`,
      { area: 'light' },
    );
  }

  if (typeof color.label !== 'string' || !color.label.trim()) {
    throw new VerificationError(
      'light.invalid_sequence',
      `Light sequence color '${color.id}' is missing a label.`,
      { area: 'light' },
    );
  }

  if (typeof color.css !== 'string' || !color.css.trim()) {
    throw new VerificationError(
      'light.invalid_sequence',
      `Light sequence color '${color.id}' is missing a CSS color.`,
      { area: 'light' },
    );
  }

  const [red, green, blue] = color.rgb;
  if (!isFiniteRgbValue(red) || !isFiniteRgbValue(green) || !isFiniteRgbValue(blue)) {
    throw new VerificationError(
      'light.invalid_sequence',
      `Light sequence color '${color.id}' must include RGB values from 0 to 255.`,
      { area: 'light' },
    );
  }

  return cloneLightTestColor(color);
};

const normalizeLightColors = (
  colors: readonly LightTestColor[] | undefined,
): readonly LightTestColor[] => {
  const source = colors?.length ? colors : DEFAULT_LIGHT_TEST_COLORS;
  return source.map(normalizeLightTestColor);
};

const normalizeSequenceLength = (requestedLength: number | undefined, colorCount: number): number => {
  const rounded = Math.round(requestedLength ?? colorCount);
  return Math.max(1, Math.min(colorCount, Number.isFinite(rounded) ? rounded : colorCount));
};

export const resolveLightSequence = (
  sequence?: readonly LightTestColor[],
): readonly LightTestColor[] =>
  normalizeLightColors(sequence?.length ? sequence : DEFAULT_LIGHT_SEQUENCE);

export const createLightSequence = ({
  colors,
  length,
  random = getCryptoRandomFraction,
}: CreateLightSequenceOptions = {}): readonly LightTestColor[] => {
  const sequence = [...normalizeLightColors(colors)];
  const sequenceLength = normalizeSequenceLength(length, sequence.length);

  for (let index = sequence.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * (index + 1));
    [sequence[index], sequence[swapIndex]] = [sequence[swapIndex], sequence[index]];
  }

  return sequence.slice(0, sequenceLength);
};
