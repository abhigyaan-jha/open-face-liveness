import type { VerificationContext, VerificationStage } from '../types.js';

interface VerificationMachineSnapshotLike {
  context?: unknown;
  value: unknown;
}

export const getStageFromSnapshot = (snapshot: VerificationMachineSnapshotLike): VerificationStage => {
  if (snapshot.value && typeof snapshot.value === 'object' && 'running' in snapshot.value) {
    return String(snapshot.value.running) as VerificationStage;
  }

  return String(snapshot.value) as VerificationStage;
};

export const createVerificationSnapshot = <TVideo>(
  snapshot: VerificationMachineSnapshotLike,
  context: VerificationContext<TVideo>,
): VerificationContext<TVideo> => ({
  ...context,
  stage: getStageFromSnapshot(snapshot),
});
