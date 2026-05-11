import type { FaceResult } from '../result.js';

export interface FaceReadiness {
  ready: boolean;
  reason: string | null;
}

export const getFaceReadiness = (face: FaceResult | null): FaceReadiness => ({
  ready: Boolean(face?.box && face.score !== null),
  reason: face?.box ? null : 'face_missing',
});

