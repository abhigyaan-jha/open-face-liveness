import type { FaceResult } from '../result.js';

export const detectFace = async (_input: ImageData | HTMLCanvasElement | HTMLVideoElement): Promise<FaceResult> => ({
  box: null,
  landmarks: [],
  score: null,
});

