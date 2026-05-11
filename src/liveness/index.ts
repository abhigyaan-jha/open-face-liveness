import type { LivenessResult } from '../result.js';

export type LivenessChallengeType =
  | 'head_pan_left'
  | 'head_pan_right'
  | 'head_pitch_up'
  | 'head_pitch_down'
  | 'mouth_open';

export interface LivenessCheckOptions {
  challengeTypes?: readonly LivenessChallengeType[];
}

export const defaultLivenessChallengeTypes: readonly LivenessChallengeType[] = [
  'head_pan_left',
  'head_pan_right',
  'head_pitch_up',
  'head_pitch_down',
  'mouth_open',
];

export const runLivenessCheck = async (
  _input: ImageData | HTMLCanvasElement | HTMLVideoElement,
  _options: LivenessCheckOptions = {},
): Promise<LivenessResult> => ({
  completed: false,
  score: null,
});

