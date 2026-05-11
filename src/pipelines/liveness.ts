import { getAnchorDrift } from '../face/stability.js';
import type {
  FaceAnchorPosition,
  FaceFitResult,
  FaceMeshResult,
  LandmarkList,
  LivenessChallengeDirection,
  LivenessChallengeFrame,
  LivenessChallengeMetrics,
  LivenessChallengeOptions,
  LivenessChallengePlan,
  LivenessChallengeRecord,
  LivenessChallengeResult,
  LivenessChallengeState,
  LivenessChallengeTelemetry,
  LivenessChallengeType,
  ResolvedLivenessChallengeOptions,
} from '../types.js';

const CHALLENGE_LANDMARKS = {
  chin: 152,
  faceEdgeLeft: 234,
  faceEdgeRight: 454,
  forehead: 10,
  mouthLeft: 61,
  mouthLowerInner: 14,
  mouthRight: 291,
  mouthUpperInner: 13,
  noseTip: 4,
} as const;

interface LandmarkPoint {
  x: number;
  y: number;
  z: number;
}

const getLandmarkPoint = (
  landmarks: LandmarkList,
  index: number,
): LandmarkPoint | null => {
  const offset = index * 3;
  if (offset < 0 || offset + 2 >= landmarks.length) {
    return null;
  }

  const x = landmarks[offset];
  const y = landmarks[offset + 1];
  const z = landmarks[offset + 2];

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return {
    x,
    y,
    z,
  };
};

const getPointDistance = (left: LandmarkPoint, right: LandmarkPoint): number =>
  Math.hypot(left.x - right.x, left.y - right.y);

export const extractLivenessChallengeMetrics = (
  mesh: FaceMeshResult,
): LivenessChallengeMetrics | null => {
  const { landmarks } = mesh;
  const noseTip = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.noseTip);
  const faceEdgeLeft = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.faceEdgeLeft);
  const faceEdgeRight = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.faceEdgeRight);
  const forehead = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.forehead);
  const chin = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.chin);
  const mouthUpperInner = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.mouthUpperInner);
  const mouthLowerInner = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.mouthLowerInner);
  const mouthLeft = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.mouthLeft);
  const mouthRight = getLandmarkPoint(landmarks, CHALLENGE_LANDMARKS.mouthRight);

  if (
    !noseTip ||
    !faceEdgeLeft ||
    !faceEdgeRight ||
    !forehead ||
    !chin ||
    !mouthUpperInner ||
    !mouthLowerInner ||
    !mouthLeft ||
    !mouthRight
  ) {
    return null;
  }

  const faceWidth = faceEdgeRight.x - faceEdgeLeft.x;
  const faceHeight = chin.y - forehead.y;
  const mouthWidth = getPointDistance(mouthLeft, mouthRight);
  const mouthGap = getPointDistance(mouthUpperInner, mouthLowerInner);

  if (faceWidth <= 1 || faceHeight <= 1 || mouthWidth <= 0) {
    return null;
  }

  return {
    mouthRatio: mouthGap / mouthWidth,
    pitch: (noseTip.y - forehead.y) / faceHeight,
    roll: Math.atan2(faceEdgeRight.y - faceEdgeLeft.y, faceEdgeRight.x - faceEdgeLeft.x),
    yaw: ((faceEdgeRight.x - noseTip.x) - (noseTip.x - faceEdgeLeft.x)) / faceWidth,
  };
};

export const LIVENESS_CHALLENGE_TYPES = [
  'head_pan_left',
  'head_pan_right',
  'head_pitch_up',
  'head_pitch_down',
  'mouth_open',
] as const satisfies readonly LivenessChallengeType[];

const DEFAULT_CHALLENGE_COUNT = 3;

// Pose thresholds are applied to normalized landmark metrics.
//
// Admit/eject gate the "neutral" state (facing camera) relative to the stable
// pose captured before each challenge. Challenge limits gate movement away
// from that captured neutral pose.
//
// Constraint: eject limit < challenge limit. The gap is the jitter tolerance.
// Orthogonal axes during a challenge must stay inside the eject envelope,
// so a tilt (roll) cannot satisfy a pan (yaw) and vice versa.
export const DEFAULT_LIVENESS_OPTIONS: ResolvedLivenessChallengeOptions = {
  activeDistanceIncreaseThreshold: 0.15,
  activeMovementThreshold: 0.08,
  activeVerticalMovementThreshold: 0.18,
  celebrationDurationMs: 800,
  challengeCount: DEFAULT_CHALLENGE_COUNT,
  challengeMouthOpenRatio: 0.35,
  challengePitchLimit: 0.4,
  challengeTypes: [...LIVENESS_CHALLENGE_TYPES],
  challengeYawLimit: 0.35,
  ejectionDebounceMs: 120,
  mouthDwellMs: 200,
  neutralAbsolutePitchLimit: 0.24,
  neutralAbsoluteRollLimit: 0.16,
  neutralAbsoluteYawLimit: 0.24,
  neutralEjectionPitchLimit: 0.32,
  neutralEjectionRollLimit: 0.24,
  neutralEjectionYawLimit: 0.3,
  neutralMouthOpenRatio: 0.18,
  panDwellMs: 180,
  pitchDwellMs: 180,
  recenterGracePeriodMs: 400,
  recenterTimeoutMs: 5000,
  smoothingAlpha: 0.35,
  stabilityPoseThreshold: 0.06,
  stabilityThreshold: 0.05,
  stabilizationDurationMs: 700,
};

const CHALLENGE_LABELS: Record<LivenessChallengeType, string> = {
  head_pan_left: 'left',
  head_pan_right: 'right',
  head_pitch_down: 'down',
  head_pitch_up: 'up',
  mouth_open: 'mouth',
};

const CHALLENGE_INSTRUCTIONS: Record<LivenessChallengeType, string> = {
  head_pan_left: 'Turn toward your left shoulder',
  head_pan_right: 'Turn toward your right shoulder',
  head_pitch_down: 'Tilt your head down',
  head_pitch_up: 'Tilt your head up',
  mouth_open: 'Open your mouth',
};

const CHALLENGE_DIRECTIONS: Record<LivenessChallengeType, LivenessChallengeDirection> = {
  head_pan_left: 'left',
  head_pan_right: 'right',
  head_pitch_down: 'down',
  head_pitch_up: 'up',
  mouth_open: 'none',
};

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const getCryptoRandomFraction = (): number => {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return (values[0] ?? 0) / (0xffffffff + 1);
  }

  return Math.random();
};

export type LivenessRandomSource = () => number;

export const resolveLivenessOptions = (
  options?: LivenessChallengeOptions,
): ResolvedLivenessChallengeOptions => ({
  ...DEFAULT_LIVENESS_OPTIONS,
  ...options,
  challengeCount: Math.max(1, Math.round(options?.challengeCount ?? DEFAULT_CHALLENGE_COUNT)),
  challengeTypes:
    options?.challengeTypes?.length
      ? [...options.challengeTypes]
      : [...DEFAULT_LIVENESS_OPTIONS.challengeTypes],
});

export const generateLivenessChallengeSequence = (
  options: Pick<ResolvedLivenessChallengeOptions, 'challengeCount' | 'challengeTypes'>,
  random: LivenessRandomSource = getCryptoRandomFraction,
): LivenessChallengeType[] => {
  const challengeTypes = options.challengeTypes.length
    ? options.challengeTypes
    : DEFAULT_LIVENESS_OPTIONS.challengeTypes;
  const sequence: LivenessChallengeType[] = [];

  for (let index = 0; index < options.challengeCount; index += 1) {
    const randomIndex = Math.floor(clamp(random(), 0, 0.999999999) * challengeTypes.length);
    sequence.push(challengeTypes[randomIndex] ?? challengeTypes[0]);
  }

  return sequence;
};

export const createLivenessChecksum = (
  sequence: readonly LivenessChallengeType[],
  random: LivenessRandomSource = getCryptoRandomFraction,
): string => {
  const prefix = sequence.map((type) => CHALLENGE_LABELS[type]).join('-');
  const suffix = Math.floor(clamp(random(), 0, 0.999999999) * 0x1000000)
    .toString(16)
    .padStart(6, '0');

  return `${prefix}-${suffix}`;
};

const getChallengeDwellMs = (
  type: LivenessChallengeType,
  options: ResolvedLivenessChallengeOptions,
): number => {
  switch (type) {
    case 'head_pan_left':
    case 'head_pan_right':
      return options.panDwellMs;
    case 'head_pitch_down':
    case 'head_pitch_up':
      return options.pitchDwellMs;
    case 'mouth_open':
      return options.mouthDwellMs;
  }
};

const getInitialState = (): LivenessChallengeState => ({
  challengeId: '',
  checksum: '',
  completedChallenges: [],
  currentChallenge: null,
  currentStep: 0,
  direction: 'none',
  instruction: '',
  nonce: '',
  phase: 'idle',
  policyVersion: '',
  progress: 0,
  sequence: [],
  totalSteps: 0,
});

const smoothValue = (previous: number | null, next: number, alpha: number): number => {
  if (!isFiniteNumber(previous)) {
    return next;
  }

  return previous + (next - previous) * alpha;
};

const getAverageAnchorPosition = (
  anchorPositions: readonly FaceAnchorPosition[],
): FaceAnchorPosition | null => {
  if (!anchorPositions.length) {
    return null;
  }

  const totals = anchorPositions.reduce(
    (result, anchor) => ({
      width: result.width + anchor.width,
      x: result.x + anchor.x,
      y: result.y + anchor.y,
    }),
    { width: 0, x: 0, y: 0 },
  );

  return {
    width: totals.width / anchorPositions.length,
    x: totals.x / anchorPositions.length,
    y: totals.y / anchorPositions.length,
  };
};

interface PoseSnapshot {
  mouthRatio: number;
  pitch: number;
  roll: number;
  yaw: number;
}

const getFacePositioningMessage = (
  faceFit: FaceFitResult | null | undefined,
  isContinuation: boolean,
): string => {
  if (!faceFit?.isFaceLargeEnough) {
    return 'Move closer';
  }

  return isContinuation ? 'Return to center for the next step' : 'Place your face inside the guide';
};

const isFaceReady = (faceFit: FaceFitResult | null | undefined): boolean =>
  Boolean(faceFit?.isAligned && faceFit.isFaceLargeEnough);

const isPanChallenge = (challenge: LivenessChallengeType | null): boolean =>
  challenge === 'head_pan_left' || challenge === 'head_pan_right';

const isPitchChallenge = (challenge: LivenessChallengeType | null): boolean =>
  challenge === 'head_pitch_up' || challenge === 'head_pitch_down';

export interface LivenessChallengeController {
  getResult(completedAt: number): LivenessChallengeResult | null;
  getState(): LivenessChallengeState;
  start(now?: number): LivenessChallengeState;
  update(frame: LivenessChallengeFrame): { result: LivenessChallengeResult | null; state: LivenessChallengeState };
}

export type { LivenessChallengePlan } from '../types.js';

export interface CreateLivenessChallengeControllerOptions {
  challengePlan?: LivenessChallengePlan;
  options?: LivenessChallengeOptions;
  random?: LivenessRandomSource;
}

const validateChallengePlan = (challengePlan: LivenessChallengePlan): LivenessChallengePlan => {
  const sequence = [...challengePlan.sequence];

  if (!challengePlan.challengeId.trim()) {
    throw new Error('Liveness challenge plan challengeId is required.');
  }

  if (!challengePlan.policyVersion.trim()) {
    throw new Error('Liveness challenge plan policyVersion is required.');
  }

  if (!challengePlan.nonce.trim()) {
    throw new Error('Liveness challenge plan nonce is required.');
  }

  if (sequence.length !== DEFAULT_CHALLENGE_COUNT) {
    throw new Error(`Liveness challenge plan must include ${DEFAULT_CHALLENGE_COUNT} challenges.`);
  }

  if (!challengePlan.checksum.trim()) {
    throw new Error('Liveness challenge plan checksum is required.');
  }

  return {
    challengeId: challengePlan.challengeId,
    checksum: challengePlan.checksum,
    nonce: challengePlan.nonce,
    policyVersion: challengePlan.policyVersion,
    sequence,
  };
};

const createGeneratedChallengePlan = (
  options: Pick<ResolvedLivenessChallengeOptions, 'challengeCount' | 'challengeTypes'>,
  random: LivenessRandomSource,
): LivenessChallengePlan => {
  const sequence = generateLivenessChallengeSequence(options, random);
  const checksum = createLivenessChecksum(sequence, random);

  return {
    challengeId: `generated:${checksum}`,
    checksum,
    nonce: checksum,
    policyVersion: 'generated',
    sequence,
  };
};

const resolveChallengePlan = ({
  challengePlan,
  options,
  random,
}: {
  challengePlan: LivenessChallengePlan | undefined;
  options: Pick<ResolvedLivenessChallengeOptions, 'challengeCount' | 'challengeTypes'>;
  random: LivenessRandomSource;
}): LivenessChallengePlan =>
  challengePlan
    ? validateChallengePlan(challengePlan)
    : createGeneratedChallengePlan(options, random);

export const createLivenessChallengeController = ({
  challengePlan,
  options,
  random = getCryptoRandomFraction,
}: CreateLivenessChallengeControllerOptions = {}): LivenessChallengeController => {
  const resolvedOptions = resolveLivenessOptions(options);
  let state = getInitialState();
  let currentStepIndex = 0;
  let smoothedYaw: number | null = null;
  let smoothedPitch: number | null = null;
  let smoothedRoll: number | null = null;
  let smoothedMouthRatio: number | null = null;
  let challengeRecords: LivenessChallengeRecord[] = [];
  let pendingChallengeStart: {
    start: PoseSnapshot;
    startedAt: number;
  } | null = null;
  let neutralPoseReference: PoseSnapshot | null = null;
  let wasPoseNeutral = false;
  let poseEjectionStartedAt: number | null = null;
  let wasFaceReady = false;
  let faceReadyEjectionStartedAt: number | null = null;
  let celebrationEndedAt: number | null = null;
  let stabilizationStartedAt = 0;
  let stabilizationBuffer: FaceAnchorPosition[] = [];
  let stabilizationPoseBuffer: { mouthRatio: number; pitch: number; roll: number; yaw: number }[] = [];
  let holdStartedAt = 0;
  let celebratingUntil = 0;
  let recenterStartedAt = 0;
  let anchorReference: FaceAnchorPosition | null = null;
  let anchorWarningGiven = false;
  let startedAt = 0;
  let completedAt: number | null = null;
  let maxAbsYaw = 0;
  let maxAbsPitch = 0;
  let maxAbsRoll = 0;
  let maxMouthRatio = 0;

  const getCurrentChallenge = (): LivenessChallengeType | null =>
    state.sequence[currentStepIndex] ?? null;

  const setState = (patch: Partial<LivenessChallengeState>): LivenessChallengeState => {
    state = {
      ...state,
      ...patch,
    };

    return state;
  };

  const resetStabilization = () => {
    stabilizationStartedAt = 0;
    stabilizationBuffer = [];
    stabilizationPoseBuffer = [];
    holdStartedAt = 0;
  };

  // Debounced face fit. Admission is instant (the faceFit gate is itself
  // a geometric sanity check, no need to delay letting the user in), ejection
  // requires the violation to persist ejectionDebounceMs before flipping the
  // state. Absorbs detector-box jitter and momentary occlusions without
  // affecting real positioning issues.
  const isFaceReadyStable = (
    faceFit: FaceFitResult | null | undefined,
    now: number,
  ): boolean => {
    const rawReady = isFaceReady(faceFit);

    if (wasFaceReady) {
      if (rawReady) {
        faceReadyEjectionStartedAt = null;
        return true;
      }
      if (faceReadyEjectionStartedAt === null) {
        faceReadyEjectionStartedAt = now;
        return true;
      }
      if (now - faceReadyEjectionStartedAt >= resolvedOptions.ejectionDebounceMs) {
        wasFaceReady = false;
        faceReadyEjectionStartedAt = null;
        return false;
      }
      return true;
    }

    if (rawReady) {
      wasFaceReady = true;
      faceReadyEjectionStartedAt = null;
      return true;
    }

    return false;
  };

  const updateTelemetry = () => {
    if (isFiniteNumber(smoothedYaw)) {
      maxAbsYaw = Math.max(maxAbsYaw, Math.abs(smoothedYaw));
    }
    if (isFiniteNumber(smoothedPitch)) {
      maxAbsPitch = Math.max(maxAbsPitch, Math.abs(smoothedPitch));
    }
    if (isFiniteNumber(smoothedRoll)) {
      maxAbsRoll = Math.max(maxAbsRoll, Math.abs(smoothedRoll));
    }
    if (isFiniteNumber(smoothedMouthRatio)) {
      maxMouthRatio = Math.max(maxMouthRatio, smoothedMouthRatio);
    }
  };

  const getTelemetry = (resultCompletedAt: number): LivenessChallengeTelemetry => ({
    maxAbsPitch,
    maxAbsRoll,
    maxAbsYaw,
    maxMouthRatio,
    sessionDurationMs: Math.max(0, resultCompletedAt - startedAt),
  });

  const getCurrentPoseSnapshot = (): PoseSnapshot | null => {
    if (
      !isFiniteNumber(smoothedYaw) ||
      !isFiniteNumber(smoothedPitch) ||
      !isFiniteNumber(smoothedRoll) ||
      !isFiniteNumber(smoothedMouthRatio)
    ) {
      return null;
    }

    return {
      mouthRatio: smoothedMouthRatio,
      pitch: smoothedPitch,
      roll: smoothedRoll,
      yaw: smoothedYaw,
    };
  };

  const getResult = (resultCompletedAt: number): LivenessChallengeResult | null => {
    if (
      state.phase !== 'complete' ||
      state.completedChallenges.length < state.totalSteps
    ) {
      return null;
    }

    return {
      challengeRecords: challengeRecords.map((record) => ({
        ...record,
        final: { ...record.final },
        start: { ...record.start },
      })),
      challengeId: state.challengeId,
      checksum: state.checksum,
      completedAt: resultCompletedAt,
      completedChallenges: [...state.completedChallenges],
      nonce: state.nonce,
      policyVersion: state.policyVersion,
      sequence: [...state.sequence],
      telemetry: getTelemetry(resultCompletedAt),
    };
  };

  const getNeutralPoseMessage = (isContinuation: boolean): string => {
    // Pose correction takes precedence over mouth state — there is no point
    // asking the user to close their mouth while they are still off-axis,
    // because the pose gate will reject them regardless. Only surface the
    // mouth instruction once the user is actually facing the camera.
    const pose = getCurrentPoseSnapshot();
    const poseOffAxis = !pose || (
      !!neutralPoseReference &&
      (
        Math.abs(pose.yaw - neutralPoseReference.yaw) > resolvedOptions.neutralAbsoluteYawLimit ||
        Math.abs(pose.pitch - neutralPoseReference.pitch) > resolvedOptions.neutralAbsolutePitchLimit ||
        Math.abs(pose.roll - neutralPoseReference.roll) > resolvedOptions.neutralAbsoluteRollLimit
      )
    );

    if (poseOffAxis) {
      return isContinuation ? 'Return to neutral position' : 'Face the camera to begin';
    }

    if (isFiniteNumber(smoothedMouthRatio) && smoothedMouthRatio >= resolvedOptions.neutralMouthOpenRatio) {
      return isContinuation ? 'Close your mouth to continue' : 'Close your mouth to begin';
    }

    return isContinuation ? 'Return to neutral position' : 'Face the camera to begin';
  };

  // Neutrality is mouth closed plus yaw/pitch/roll close to the stable pose
  // captured before the active challenge. Before that reference exists, the
  // stable hold itself becomes the user's neutral pose.
  //
  // Two layers of noise tolerance on top of the raw check:
  //   - Hysteresis: admission uses the tight neutralAbsolute* limits; once
  //     admitted, ejection uses the wider neutralEjection* limits. Prevents
  //     sensor noise at the boundary from flapping the state.
  //   - Ejection debounce: a violation of the eject limits must persist for
  //     ejectionDebounceMs before the user is actually kicked out. Absorbs
  //     single-frame pose-estimation spikes. Admission is NOT debounced - the
  //     700ms stabilization hold is already an admission debounce.
  const isNeutralPose = (now: number): boolean => {
    const pose = getCurrentPoseSnapshot();
    if (!pose) {
      wasPoseNeutral = false;
      poseEjectionStartedAt = null;
      return false;
    }

    const mouthNeutral = pose.mouthRatio < resolvedOptions.neutralMouthOpenRatio;
    if (!mouthNeutral) {
      wasPoseNeutral = false;
      poseEjectionStartedAt = null;
      return false;
    }

    if (!neutralPoseReference) {
      return true;
    }

    const withinAdmit =
      Math.abs(pose.yaw - neutralPoseReference.yaw) <= resolvedOptions.neutralAbsoluteYawLimit &&
      Math.abs(pose.pitch - neutralPoseReference.pitch) <= resolvedOptions.neutralAbsolutePitchLimit &&
      Math.abs(pose.roll - neutralPoseReference.roll) <= resolvedOptions.neutralAbsoluteRollLimit;

    const withinEject =
      Math.abs(pose.yaw - neutralPoseReference.yaw) <= resolvedOptions.neutralEjectionYawLimit &&
      Math.abs(pose.pitch - neutralPoseReference.pitch) <= resolvedOptions.neutralEjectionPitchLimit &&
      Math.abs(pose.roll - neutralPoseReference.roll) <= resolvedOptions.neutralEjectionRollLimit;

    if (wasPoseNeutral) {
      if (withinEject) {
        poseEjectionStartedAt = null;
        return true;
      }
      if (poseEjectionStartedAt === null) {
        poseEjectionStartedAt = now;
        return true;
      }
      if (now - poseEjectionStartedAt >= resolvedOptions.ejectionDebounceMs) {
        wasPoseNeutral = false;
        poseEjectionStartedAt = null;
        return false;
      }
      return true;
    }

    if (withinAdmit) {
      wasPoseNeutral = true;
      poseEjectionStartedAt = null;
      return true;
    }

    return false;
  };

  // Pose variance over the stabilization sample window. Used alongside anchor
  // variance to gate admission — a head that is geometrically still but whose
  // pose is drifting inside the neutral band must not be admitted, because
  // that drift carries into the challenge phase.
  const getPoseVariance = (): { mouthRatio: number; pitch: number; roll: number; yaw: number } => {
    if (stabilizationPoseBuffer.length === 0) {
      return { mouthRatio: 0, pitch: 0, roll: 0, yaw: 0 };
    }
    const yaws = stabilizationPoseBuffer.map((sample) => sample.yaw);
    const pitches = stabilizationPoseBuffer.map((sample) => sample.pitch);
    const rolls = stabilizationPoseBuffer.map((sample) => sample.roll);
    const mouths = stabilizationPoseBuffer.map((sample) => sample.mouthRatio);
    return {
      mouthRatio: Math.max(...mouths) - Math.min(...mouths),
      pitch: Math.max(...pitches) - Math.min(...pitches),
      roll: Math.max(...rolls) - Math.min(...rolls),
      yaw: Math.max(...yaws) - Math.min(...yaws),
    };
  };

  const anchorAdmit = (anchorPosition: FaceAnchorPosition): void => {
    anchorReference = { ...anchorPosition };
    anchorWarningGiven = false;
  };

  const enterStabilizing = (instruction: string, now: number): LivenessChallengeState => {
    recenterStartedAt = 0;
    setState({
      currentChallenge: null,
      direction: 'none',
      instruction,
      phase: 'stabilizing',
      progress: 0,
    });

    if (!stabilizationStartedAt) {
      stabilizationStartedAt = now;
      holdStartedAt = now;
    }

    return state;
  };

  const enterRecentering = (
    now: number,
    instruction = 'Return to center for the next step',
  ): LivenessChallengeState => {
    resetStabilization();
    anchorReference = null;
    anchorWarningGiven = false;
    // Force re-admission through the narrow bounds when entering recenter —
    // drifting back into the wider eject zone should not count as neutral.
    wasPoseNeutral = false;
    poseEjectionStartedAt = null;

    if (!recenterStartedAt) {
      recenterStartedAt = now;
    }

    return setState({
      currentChallenge: null,
      direction: 'none',
      instruction,
      phase: 'recentering',
      progress: 0,
    });
  };

  const processUnavailable = (frame: LivenessChallengeFrame): LivenessChallengeState => {
    const continuation = state.completedChallenges.length > 0 || currentStepIndex > 0;
    resetStabilization();
    anchorReference = null;
    const instruction = getFacePositioningMessage(frame.faceFit, continuation);

    if (continuation) {
      return enterRecentering(frame.timestamp, instruction);
    }

    return setState({
      currentChallenge: null,
      direction: 'none',
      instruction,
      phase: 'stabilizing',
      progress: 0,
    });
  };

  const processStabilizing = (
    frame: LivenessChallengeFrame,
    now: number,
  ): LivenessChallengeState => {
    const continuation = currentStepIndex > 0;
    const neutralPose = isNeutralPose(now);
    const faceReady = isFaceReadyStable(frame.faceFit, now);

    if (!faceReady || !neutralPose || !frame.anchorPosition) {
      resetStabilization();
      anchorReference = null;
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: !faceReady
          ? getFacePositioningMessage(frame.faceFit, continuation)
          : getNeutralPoseMessage(continuation),
        phase: continuation ? 'recentering' : 'stabilizing',
        progress: 0,
      });
    }

    const recordPoseSample = () => {
      if (
        isFiniteNumber(smoothedYaw) &&
        isFiniteNumber(smoothedPitch) &&
        isFiniteNumber(smoothedRoll) &&
        isFiniteNumber(smoothedMouthRatio)
      ) {
        stabilizationPoseBuffer.push({
          mouthRatio: smoothedMouthRatio,
          pitch: smoothedPitch,
          roll: smoothedRoll,
          yaw: smoothedYaw,
        });
      }
    };

    if (!stabilizationStartedAt) {
      stabilizationStartedAt = now;
      holdStartedAt = now;
      stabilizationBuffer = [frame.anchorPosition];
      stabilizationPoseBuffer = [];
      recordPoseSample();
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: continuation ? 'Hold steady to continue' : 'Hold steady to begin',
        phase: 'stabilizing',
        progress: 0,
      });
    }

    stabilizationBuffer.push(frame.anchorPosition);
    recordPoseSample();
    const elapsed = Math.max(0, now - stabilizationStartedAt);

    if (elapsed < resolvedOptions.stabilizationDurationMs) {
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: continuation ? 'Hold steady to continue' : 'Hold steady to begin',
        phase: 'stabilizing',
        progress: clamp(elapsed / resolvedOptions.stabilizationDurationMs, 0, 1),
      });
    }

    const xs = stabilizationBuffer.map((anchor) => anchor.x);
    const ys = stabilizationBuffer.map((anchor) => anchor.y);
    const widths = stabilizationBuffer.map((anchor) => anchor.width);
    const xVariance = Math.max(...xs) - Math.min(...xs);
    const yVariance = Math.max(...ys) - Math.min(...ys);
    const widthVariance = Math.max(...widths) - Math.min(...widths);
    const poseVariance = getPoseVariance();

    const anchorUnstable =
      xVariance >= resolvedOptions.stabilityThreshold ||
      yVariance >= resolvedOptions.stabilityThreshold ||
      widthVariance >= resolvedOptions.stabilityThreshold;
    // Pose drift inside the neutral band still poisons the admission: if
    // smoothedPitch is creeping from +0.15 to +0.05 during the hold, the user
    // enters the challenge with residual motion energy. Reject and restart.
    const poseUnstable =
      poseVariance.yaw >= resolvedOptions.stabilityPoseThreshold ||
      poseVariance.pitch >= resolvedOptions.stabilityPoseThreshold ||
      poseVariance.roll >= resolvedOptions.stabilityPoseThreshold;

    if (anchorUnstable || poseUnstable) {
      stabilizationStartedAt = now;
      holdStartedAt = now;
      stabilizationBuffer = [frame.anchorPosition];
      stabilizationPoseBuffer = [];
      recordPoseSample();
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: continuation ? 'Hold steady to continue' : 'Hold steady to begin',
        phase: 'stabilizing',
        progress: 0,
      });
    }

    const averagedAnchor = getAverageAnchorPosition(stabilizationBuffer) ?? frame.anchorPosition;
    resetStabilization();
    anchorAdmit(averagedAnchor);

    const challenge = getCurrentChallenge();
    if (!challenge) {
      completedAt = now;
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: 'Verification complete',
        phase: 'complete',
        progress: 1,
      });
    }

    const poseSnapshot = getCurrentPoseSnapshot();
    if (!poseSnapshot) {
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: continuation ? 'Hold steady to continue' : 'Hold steady to begin',
        phase: 'stabilizing',
        progress: 0,
      });
    }

    neutralPoseReference = poseSnapshot;
    pendingChallengeStart = {
      start: poseSnapshot,
      startedAt: now,
    };

    return setState({
      currentChallenge: challenge,
      currentStep: currentStepIndex + 1,
      direction: CHALLENGE_DIRECTIONS[challenge],
      instruction: CHALLENGE_INSTRUCTIONS[challenge],
      phase: 'active',
      progress: 0,
    });
  };

  const processRecentering = (
    frame: LivenessChallengeFrame,
    now: number,
  ): LivenessChallengeState => {
    if (!recenterStartedAt) {
      recenterStartedAt = now;
    }

    if (now - recenterStartedAt > resolvedOptions.recenterTimeoutMs) {
      // If the user cannot return to the prior neutral pose, let them acquire
      // a fresh neutral reference through the normal stabilization hold.
      neutralPoseReference = null;
      recenterStartedAt = 0;
      resetStabilization();
      return processStabilizing(frame, now);
    }

    // Post-celebration grace: immediately after a challenge success, the user
    // is still physically in the challenge position and needs travel time to
    // return. During this window we show a neutral "Return to center" prompt
    // instead of the fault-flavored positioning/pose messages, and don't let
    // progression block on readiness — if they're already back, proceed.
    const inGrace =
      isFiniteNumber(celebrationEndedAt) &&
      now - celebrationEndedAt < resolvedOptions.recenterGracePeriodMs;

    const faceReady = isFaceReadyStable(frame.faceFit, now) && !!frame.anchorPosition;

    if (!faceReady) {
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: inGrace
          ? 'Return to center for the next step'
          : getFacePositioningMessage(frame.faceFit, true),
        phase: 'recentering',
        progress: 0,
      });
    }

    if (!isNeutralPose(now)) {
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: inGrace ? 'Return to center for the next step' : getNeutralPoseMessage(true),
        phase: 'recentering',
        progress: 0,
      });
    }

    celebrationEndedAt = null;
    resetStabilization();
    return enterStabilizing('Hold steady to continue', now);
  };

  const keepActiveChallengePositioned = (
    frame: LivenessChallengeFrame,
    now: number,
  ): boolean => {
    // Active checks are challenge-aware; centering is re-established before
    // each step instead of enforced throughout the requested motion.
    const activeChallenge = getCurrentChallenge();

    if (!activeChallenge || !frame.anchorPosition) {
      enterRecentering(now, getFacePositioningMessage(frame.faceFit, true));
      return false;
    }

    // The centering checkpoint has already admitted the face. While a challenge
    // is active, tolerate detector-box motion caused by the requested action.
    const pitchChallenge = isPitchChallenge(activeChallenge);
    const panChallenge = isPanChallenge(activeChallenge);
    const faceReady = pitchChallenge
      ? true
      : panChallenge
        ? Boolean(frame.faceFit?.isCenterWithinRelaxedBounds)
        : isFaceReadyStable(frame.faceFit, now);

    if (!faceReady) {
      enterRecentering(now, getFacePositioningMessage(frame.faceFit, true));
      return false;
    }

    if (!anchorReference) {
      anchorReference = { ...frame.anchorPosition };
      return true;
    }

    const anchorDrift = getAnchorDrift(frame.anchorPosition, anchorReference);
    const distanceExceeded =
      !pitchChallenge &&
      !panChallenge &&
      !!anchorDrift &&
      Math.abs(anchorDrift.distanceIncreaseRatio) > resolvedOptions.activeDistanceIncreaseThreshold;
    const verticalExceeded =
      !pitchChallenge &&
      !!anchorDrift &&
      anchorDrift.deltaY > resolvedOptions.activeVerticalMovementThreshold;
    const hasDrifted =
      !!anchorDrift &&
      (
        anchorDrift.deltaX > resolvedOptions.activeMovementThreshold ||
        verticalExceeded ||
        distanceExceeded
      );

    if (!hasDrifted) {
      anchorWarningGiven = false;
      return true;
    }

    holdStartedAt = 0;

    if (!anchorWarningGiven) {
      anchorWarningGiven = true;
      setState({
        instruction: distanceExceeded
          ? 'Keep the same distance'
          : 'Keep the camera still',
        progress: 0,
      });
      return false;
    }

    enterRecentering(now);
    return false;
  };

  // Challenge satisfaction is measured from the neutral pose captured at the
  // start of the step. The target axis must move far enough, and every
  // orthogonal axis must stay near that same reference.
  const isChallengeSatisfied = (challenge: LivenessChallengeType): boolean => {
    const pose = getCurrentPoseSnapshot();
    const startPose = pendingChallengeStart?.start;

    if (!pose || !startPose) {
      return false;
    }

    const yawNearStart =
      Math.abs(pose.yaw - startPose.yaw) <= resolvedOptions.neutralEjectionYawLimit;
    const pitchNearStart =
      Math.abs(pose.pitch - startPose.pitch) <= resolvedOptions.neutralEjectionPitchLimit;
    const rollNearStart =
      Math.abs(pose.roll - startPose.roll) <= resolvedOptions.neutralEjectionRollLimit;
    const mouthClosed = pose.mouthRatio < resolvedOptions.neutralMouthOpenRatio;
    const yawDeltaLimit = Math.max(
      0,
      resolvedOptions.challengeYawLimit - resolvedOptions.neutralAbsoluteYawLimit,
    );
    const pitchDeltaLimit = Math.max(
      0,
      resolvedOptions.challengePitchLimit - resolvedOptions.neutralAbsolutePitchLimit,
    );

    switch (challenge) {
      case 'head_pan_left':
        return (
          startPose.yaw - pose.yaw >= yawDeltaLimit &&
          pitchNearStart &&
          rollNearStart &&
          mouthClosed
        );
      case 'head_pan_right':
        return (
          pose.yaw - startPose.yaw >= yawDeltaLimit &&
          pitchNearStart &&
          rollNearStart &&
          mouthClosed
        );
      case 'head_pitch_up':
        return (
          startPose.pitch - pose.pitch >= pitchDeltaLimit &&
          yawNearStart &&
          rollNearStart &&
          mouthClosed
        );
      case 'head_pitch_down':
        return (
          pose.pitch - startPose.pitch >= pitchDeltaLimit &&
          yawNearStart &&
          rollNearStart &&
          mouthClosed
        );
      case 'mouth_open':
        return (
          pose.mouthRatio >= resolvedOptions.challengeMouthOpenRatio &&
          yawNearStart &&
          pitchNearStart &&
          rollNearStart
        );
    }
  };

  const completeStep = (now: number): LivenessChallengeState => {
    const challenge = getCurrentChallenge();
    if (!challenge) {
      return state;
    }

    if (pendingChallengeStart) {
      challengeRecords.push({
        challenge,
        completedAt: now,
        final: {
          mouthRatio: smoothedMouthRatio,
          pitch: smoothedPitch,
          roll: smoothedRoll,
          yaw: smoothedYaw,
        },
        start: pendingChallengeStart.start,
        startedAt: pendingChallengeStart.startedAt,
      });
      pendingChallengeStart = null;
    }

    const completedChallenges = [...state.completedChallenges, challenge];
    currentStepIndex += 1;
    holdStartedAt = 0;
    anchorReference = null;
    anchorWarningGiven = false;

    if (currentStepIndex >= state.sequence.length) {
      completedAt = now;
      return setState({
        completedChallenges,
        currentChallenge: null,
        currentStep: state.totalSteps,
        direction: 'none',
        instruction: 'Verification complete',
        phase: 'complete',
        progress: 1,
      });
    }

    celebratingUntil = now + resolvedOptions.celebrationDurationMs;
    return setState({
      completedChallenges,
      currentChallenge: null,
      direction: 'none',
      instruction: '',
      phase: 'celebrating',
      progress: 1,
    });
  };

  const processActive = (
    frame: LivenessChallengeFrame,
    now: number,
  ): LivenessChallengeState => {
    if (!keepActiveChallengePositioned(frame, now)) {
      return state;
    }

    const challenge = getCurrentChallenge();
    if (!challenge) {
      completedAt = now;
      return setState({
        currentChallenge: null,
        direction: 'none',
        instruction: 'Verification complete',
        phase: 'complete',
        progress: 1,
      });
    }

    if (!isChallengeSatisfied(challenge)) {
      holdStartedAt = 0;
      return setState({
        currentChallenge: challenge,
        currentStep: currentStepIndex + 1,
        direction: CHALLENGE_DIRECTIONS[challenge],
        instruction: CHALLENGE_INSTRUCTIONS[challenge],
        phase: 'active',
        progress: 0,
      });
    }

    if (!holdStartedAt) {
      holdStartedAt = now;
    }

    const dwellMs = getChallengeDwellMs(challenge, resolvedOptions);
    const progress = clamp((now - holdStartedAt) / dwellMs, 0, 1);

    if (now - holdStartedAt < dwellMs) {
      return setState({
        currentChallenge: challenge,
        currentStep: currentStepIndex + 1,
        direction: CHALLENGE_DIRECTIONS[challenge],
        instruction: CHALLENGE_INSTRUCTIONS[challenge],
        phase: 'active',
        progress,
      });
    }

    return completeStep(now);
  };

  const processCelebrating = (now: number): LivenessChallengeState => {
    if (now < celebratingUntil) {
      return state;
    }

    celebratingUntil = 0;
    // Stamp the grace-period start. enterRecentering handles the pose-neutral
    // reset, which forces the user to re-admit through the tight bounds
    // rather than drift back into the wider eject zone.
    celebrationEndedAt = now;
    return enterRecentering(now);
  };

  const update = (
    frame: LivenessChallengeFrame,
  ): { result: LivenessChallengeResult | null; state: LivenessChallengeState } => {
    const now = frame.timestamp;

    if (state.phase === 'idle') {
      return { result: null, state: start(now) };
    }

    if (state.phase === 'complete') {
      return { result: completedAt !== null ? getResult(completedAt) : null, state };
    }

    if (state.phase === 'celebrating') {
      processCelebrating(now);
      return {
        result: completedAt !== null ? getResult(completedAt) : null,
        state,
      };
    }

    if (!frame.metrics || !frame.anchorPosition) {
      return {
        result: null,
        state: processUnavailable(frame),
      };
    }

    smoothedYaw = smoothValue(smoothedYaw, frame.metrics.yaw, resolvedOptions.smoothingAlpha);
    smoothedPitch = smoothValue(smoothedPitch, frame.metrics.pitch, resolvedOptions.smoothingAlpha);
    smoothedRoll = smoothValue(smoothedRoll, frame.metrics.roll, resolvedOptions.smoothingAlpha);
    smoothedMouthRatio = smoothValue(
      smoothedMouthRatio,
      frame.metrics.mouthRatio,
      resolvedOptions.smoothingAlpha,
    );
    updateTelemetry();

    switch (state.phase) {
      case 'stabilizing':
        processStabilizing(frame, now);
        break;
      case 'active':
        processActive(frame, now);
        break;
      case 'recentering':
        processRecentering(frame, now);
        break;
    }

    return {
      result: completedAt !== null ? getResult(completedAt) : null,
      state,
    };
  };

  const start = (now = 0): LivenessChallengeState => {
    const plan = resolveChallengePlan({
      challengePlan,
      options: resolvedOptions,
      random,
    });
    state = {
      ...getInitialState(),
      challengeId: plan.challengeId,
      checksum: plan.checksum,
      instruction: 'Place your face inside the guide',
      nonce: plan.nonce,
      phase: 'stabilizing',
      policyVersion: plan.policyVersion,
      sequence: plan.sequence,
      totalSteps: plan.sequence.length,
    };

    currentStepIndex = 0;
    smoothedYaw = null;
    smoothedPitch = null;
    smoothedRoll = null;
    smoothedMouthRatio = null;
    challengeRecords = [];
    pendingChallengeStart = null;
    neutralPoseReference = null;
    wasPoseNeutral = false;
    poseEjectionStartedAt = null;
    wasFaceReady = false;
    faceReadyEjectionStartedAt = null;
    celebrationEndedAt = null;
    stabilizationStartedAt = 0;
    stabilizationBuffer = [];
    stabilizationPoseBuffer = [];
    holdStartedAt = 0;
    celebratingUntil = 0;
    recenterStartedAt = 0;
    anchorReference = null;
    anchorWarningGiven = false;
    startedAt = now;
    completedAt = null;
    maxAbsYaw = 0;
    maxAbsPitch = 0;
    maxAbsRoll = 0;
    maxMouthRatio = 0;

    return state;
  };

  return {
    getResult,
    getState: () => state,
    start,
    update,
  };
};
