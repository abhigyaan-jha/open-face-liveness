import type { OpenFaceLivenessSnapshot } from '../../../src/index.js';

export const SNAPSHOT_DEBUG_RENDER_INTERVAL_MS = 100;

const formatKeyNumber = (value: number | null | undefined, digits = 3): string =>
  Number.isFinite(value) ? Number(value).toFixed(digits) : '';

export const isSnapshotSuccess = (snapshot: OpenFaceLivenessSnapshot | null): boolean =>
  snapshot?.stage === 'completed' ||
  (snapshot?.stage === 'lightChallenge' && snapshot.light?.phase === 'complete') ||
  (snapshot?.stage === 'livenessChallenge' &&
    (snapshot.liveness?.phase === 'celebrating' || snapshot.liveness?.phase === 'complete'));

export const getGuideClasses = (snapshot: OpenFaceLivenessSnapshot | null): string => {
  if (isSnapshotSuccess(snapshot)) {
    return 'face-guide-base face-guide-success';
  }

  if (snapshot?.stage === 'lightChallenge') {
    return 'face-guide-base face-guide-stabilizing';
  }

  if (snapshot?.stage === 'livenessChallenge') {
    switch (snapshot.liveness?.phase) {
      case 'active':
        return 'face-guide-base face-guide-detecting';
      case 'recentering':
        return 'face-guide-base face-guide-recentering';
      case 'stabilizing':
        return 'face-guide-base face-guide-stabilizing';
      case 'celebrating':
      case 'complete':
      case 'idle':
      case undefined:
        return 'face-guide-base face-guide-idle';
    }
  }

  if (snapshot?.stage === 'requestingCamera' || snapshot?.stage === 'loadingModels') {
    return 'face-guide-base face-guide-stabilizing';
  }

  if (snapshot?.stage === 'stabilizingFace') {
    return 'face-guide-base face-guide-recentering';
  }

  if (snapshot?.stage === 'acquiringFace' || snapshot?.stage === 'faceReady') {
    return 'face-guide-base face-guide-detecting';
  }

  return 'face-guide-base face-guide-idle';
};

export const getSnapshotStatusKey = (snapshot: OpenFaceLivenessSnapshot | null): string => [
  snapshot?.stage ?? '',
  snapshot?.instruction ?? '',
  snapshot?.error ?? '',
  snapshot?.light?.phase ?? '',
  snapshot?.light?.instruction ?? '',
  snapshot?.light?.colorIndex ?? '',
  snapshot?.light?.totalSteps ?? '',
  snapshot?.liveness?.phase ?? '',
  snapshot?.liveness?.instruction ?? '',
  snapshot?.liveness?.direction ?? '',
  snapshot?.liveness?.currentStep ?? '',
  snapshot?.liveness?.totalSteps ?? '',
].join('|');

export const getSnapshotRenderKey = (
  snapshot: OpenFaceLivenessSnapshot | null,
  debugEnabled: boolean,
): string => {
  const statusKey = getSnapshotStatusKey(snapshot);

  if (!debugEnabled) {
    return statusKey;
  }

  return [
    statusKey,
    Math.round((snapshot?.liveness?.progress ?? 0) * 100),
    Math.round((snapshot?.light?.progress ?? 0) * 100),
    snapshot?.diagnostics?.frameIndex ?? '',
    formatKeyNumber(snapshot?.diagnostics?.timings.frameMs, 1),
    snapshot?.spoof?.label ?? '',
    formatKeyNumber(snapshot?.spoof?.realScore),
    snapshot?.spoofSummary?.sampleCount ?? '',
    formatKeyNumber(snapshot?.spoofSummary?.medianRealScore),
    formatKeyNumber(snapshot?.light?.sequenceAverageScore),
  ].join('|');
};
