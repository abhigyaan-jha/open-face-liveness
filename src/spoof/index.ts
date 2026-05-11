import type { SpoofResult } from '../result.js';

export const runSpoofCheck = async (_input: ImageData | HTMLCanvasElement | HTMLVideoElement): Promise<SpoofResult> => ({
  realScore: null,
  spoofScore: null,
});

