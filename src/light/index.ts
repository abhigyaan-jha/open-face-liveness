import type { LightResult } from '../result.js';

export const runLightCheck = async (_input: ImageData | HTMLCanvasElement | HTMLVideoElement): Promise<LightResult> => ({
  matched: false,
  score: null,
});

