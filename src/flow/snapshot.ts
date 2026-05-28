import {
  VERIFICATION_STAGES,
  type VerificationContext,
  type VerificationStage,
} from '../events.js';

interface VerificationMachineSnapshotLike {
  context?: unknown;
  value: unknown;
}

const verificationStages: ReadonlySet<string> = new Set(VERIFICATION_STAGES);

const isVerificationStage = (value: unknown): value is VerificationStage =>
  typeof value === 'string' && verificationStages.has(value);

export const getStageFromSnapshot = (snapshot: VerificationMachineSnapshotLike): VerificationStage => {
  const stage =
    snapshot.value && typeof snapshot.value === 'object' && 'running' in snapshot.value
      ? snapshot.value.running
      : snapshot.value;

  if (isVerificationStage(stage)) {
    return stage;
  }

  throw new Error(`Unknown verification stage from machine snapshot: ${String(stage)}`);
};

export const createVerificationSnapshot = <TVideo>(
  snapshot: VerificationMachineSnapshotLike,
  context: VerificationContext<TVideo>,
): VerificationContext<TVideo> => ({
  ...context,
  stage: getStageFromSnapshot(snapshot),
});
