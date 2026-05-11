import type { VerificationCheck } from './config.js';

export interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface FaceResult {
  box: Rect | null;
  landmarks: readonly Point3D[];
  score: number | null;
}

export interface LivenessResult {
  completed: boolean;
  score: number | null;
}

export interface SpoofResult {
  realScore: number | null;
  spoofScore: number | null;
}

export interface LightResult {
  matched: boolean;
  score: number | null;
}

export interface VerificationResult {
  checks: readonly VerificationCheck[];
  completedAt: number;
  face: FaceResult | null;
  light: LightResult | null;
  liveness: LivenessResult | null;
  spoof: SpoofResult | null;
}

export const emptyResult = (checks: readonly VerificationCheck[] = []): VerificationResult => ({
  checks,
  completedAt: 0,
  face: null,
  light: null,
  liveness: null,
  spoof: null,
});

