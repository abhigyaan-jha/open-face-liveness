import type { LivenessChallengeType } from '../result.js';
import { VerificationError } from '../errors.js';

export type LivenessRandomSource = () => number;

export interface CreateLivenessSequenceOptions {
  challenges?: readonly LivenessChallengeType[];
  length?: number;
  random?: LivenessRandomSource;
}

export const LIVENESS_CHALLENGE_TYPES = [
  'head_pan_left',
  'head_pan_right',
  'head_pitch_up',
  'head_pitch_down',
  'mouth_open',
] as const satisfies readonly LivenessChallengeType[];

export const DEFAULT_LIVENESS_CHALLENGES = [
  'head_pan_left',
  'head_pan_right',
  'mouth_open',
] as const satisfies readonly LivenessChallengeType[];

const getCryptoRandomFraction = (): number => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return (values[0] ?? 0) / (0xffffffff + 1);
  }

  return Math.random();
};

export const isLivenessChallengeType = (value: unknown): value is LivenessChallengeType =>
  typeof value === 'string' &&
  LIVENESS_CHALLENGE_TYPES.includes(value as LivenessChallengeType);

export const resolveLivenessSequence = (
  challenges?: readonly LivenessChallengeType[],
): readonly LivenessChallengeType[] => {
  if (!challenges?.length) {
    return [...DEFAULT_LIVENESS_CHALLENGES];
  }

  for (const challenge of challenges) {
    if (!isLivenessChallengeType(challenge)) {
      throw new VerificationError(
        'liveness.invalid_challenge',
        `Unsupported liveness challenge: ${String(challenge)}`,
        { area: 'liveness' },
      );
    }
  }

  return [...challenges];
};

const normalizeSequenceLength = (requestedLength: number | undefined): number => {
  const rounded = Math.round(requestedLength ?? DEFAULT_LIVENESS_CHALLENGES.length);
  return Math.max(1, Number.isFinite(rounded) ? rounded : DEFAULT_LIVENESS_CHALLENGES.length);
};

export const createLivenessSequence = ({
  challenges,
  length,
  random = getCryptoRandomFraction,
}: CreateLivenessSequenceOptions = {}): readonly LivenessChallengeType[] => {
  const pool = [...resolveLivenessSequence(challenges?.length ? challenges : LIVENESS_CHALLENGE_TYPES)];
  const sequenceLength = normalizeSequenceLength(length);
  const sequence: LivenessChallengeType[] = [];
  let available = [...pool];
  const fallback = pool[0] ?? DEFAULT_LIVENESS_CHALLENGES[0];

  for (let index = 0; index < sequenceLength; index += 1) {
    if (!available.length) {
      available = [...pool];
    }

    const selectedIndex = Math.floor(Math.min(Math.max(random(), 0), 0.999999999) * available.length);
    const [selected] = available.splice(selectedIndex, 1);
    sequence.push(selected ?? fallback);
  }

  return sequence;
};
