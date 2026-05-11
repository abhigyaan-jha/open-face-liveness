import type { AnyEventObject, CallbackActorLogic, DoneActorEvent, PromiseActorLogic } from 'xstate';
import { assign, setup } from 'xstate';
import type { PhaseOneRuntimeBundle, ResolvedModelSpec, VerificationModelsOptions } from '../models.js';
import { getInstructionForStage } from '../liveness/instructions.js';
import type { CameraHandle } from '../capture/camera.js';
import { resolveVerificationOptions } from './options.js';
import { createVerificationSnapshot } from './snapshot.js';
import type {
  FaceFitOptions,
  ResolvedDebugOptions,
  ResolvedLightTestOptions,
  ResolvedLivenessChallengeOptions,
  VerificationCheck,
  VerificationOptions,
} from '../config.js';
import type {
  CameraStreamInfo,
  VerificationContext,
  VerificationEvent,
} from '../events.js';
import { VerificationError, isVerificationErrorDetail, type VerificationErrorDetail } from '../errors.js';
import type {
  LightTestResult,
  LightTestState,
  LivenessChallengeResult,
  LivenessChallengeState,
  SpoofSummaryResult,
  VerificationResult,
} from '../result.js';

export interface VerificationMachineResources {
  cameraHandle: CameraHandle | null;
  modelsHandle: PhaseOneRuntimeBundle | null;
}

export interface RequestCameraInput {
  face: FaceFitOptions;
  video: HTMLVideoElement;
}

export interface RequestCameraOutput {
  handle: CameraHandle;
  streamInfo: CameraStreamInfo;
}

export interface LoadModelsInput {
  checks: readonly VerificationCheck[];
  models: VerificationModelsOptions;
}

export interface LoadModelsOutput {
  handle: PhaseOneRuntimeBundle;
  models: ResolvedModelSpec[];
}

export interface AnalyzeFaceInput {
  checks: readonly VerificationCheck[];
  debug: ResolvedDebugOptions;
  face: FaceFitOptions;
  light: ResolvedLightTestOptions;
  liveness: ResolvedLivenessChallengeOptions;
  modelsHandle: PhaseOneRuntimeBundle;
  video: HTMLVideoElement;
}

export type RequestCameraActorLogic = PromiseActorLogic<RequestCameraOutput, RequestCameraInput>;

export type LoadModelsActorLogic = PromiseActorLogic<LoadModelsOutput, LoadModelsInput>;

export type AnalyzeFaceActorLogic = CallbackActorLogic<AnyEventObject, AnalyzeFaceInput>;

export interface VerificationMachineResourceContext extends VerificationContext<HTMLVideoElement> {
  resources: VerificationMachineResources;
}

export interface VerificationMachineDependencies {
  analyzeFace: AnalyzeFaceActorLogic;
  cleanup?: (context: VerificationMachineResourceContext) => void;
  loadModels: LoadModelsActorLogic;
  now?: () => number;
  requestCamera: RequestCameraActorLogic;
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.length > 0) {
    return error;
  }

  return 'Verification failed. Please try again.';
};

const getEventError = (event: unknown): string => {
  if (event && typeof event === 'object' && 'error' in event) {
    return toErrorMessage((event as { error: unknown }).error);
  }

  return 'Verification failed. Please try again.';
};

const getErrorDetail = (value: unknown): VerificationErrorDetail | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if ('errorDetail' in value && isVerificationErrorDetail((value as { errorDetail?: unknown }).errorDetail)) {
    return (value as { errorDetail: VerificationErrorDetail }).errorDetail;
  }

  if ('detail' in value && isVerificationErrorDetail((value as { detail?: unknown }).detail)) {
    return (value as { detail: VerificationErrorDetail }).detail;
  }

  if ('error' in value) {
    return getErrorDetail((value as { error?: unknown }).error);
  }

  return null;
};

type MachineProvidedActor =
  | { id: string | undefined; logic: AnalyzeFaceActorLogic; src: 'analyzeFace' }
  | { id: string | undefined; logic: LoadModelsActorLogic; src: 'loadModels' }
  | { id: string | undefined; logic: RequestCameraActorLogic; src: 'requestCamera' };

type MachineAssignment = Parameters<
  typeof assign<VerificationMachineResourceContext, AnyEventObject, undefined, VerificationEvent, MachineProvidedActor>
>[0];

interface MachineContextArgs {
  context: VerificationMachineResourceContext;
}

interface MachineEventArgs {
  event: AnyEventObject;
}

interface MachineContextEventArgs extends MachineContextArgs, MachineEventArgs {}

const machineAssign = (assignment: MachineAssignment) =>
  assign<VerificationMachineResourceContext, AnyEventObject, undefined, VerificationEvent, MachineProvidedActor>(
    assignment,
  );

type FailureEventType = Extract<VerificationEvent, { error: string }>['type'];

const createResult = (
  context: VerificationMachineResourceContext,
  completedAt: number,
  livenessResult: LivenessChallengeResult | null = context.livenessResult,
  spoofSummary: SpoofSummaryResult | null = context.spoofSummary,
  lightResult: LightTestResult | null = context.lightResult,
): VerificationResult | null => {
  if (!context.detection || !context.mesh || !context.faceFit || !context.stability) {
    return null;
  }

  if (context.checks.includes('liveness') && !livenessResult) {
    return null;
  }

  if (context.checks.includes('light') && !lightResult) {
    return null;
  }

  if (
    context.checks.includes('spoof') &&
    (!spoofSummary || spoofSummary.modelsUsed <= 0 || spoofSummary.sampleCount <= 0)
  ) {
    return null;
  }

  return {
    checks: context.checks,
    completedAt,
    face: {
      completedAt,
      detection: context.detection,
      faceFit: context.faceFit,
      mesh: context.mesh,
      stability: context.stability,
    },
    light: context.checks.includes('light') ? lightResult : null,
    liveness: livenessResult,
    spoof: context.checks.includes('spoof') ? spoofSummary : null,
  };
};

const stageAction = (stage: VerificationMachineResourceContext['stage']) =>
  machineAssign(({ context }: MachineContextArgs) => ({
    error: stage === 'failed' ? context.error : null,
    errorDetail: stage === 'failed' ? context.errorDetail : null,
    instruction: getInstructionForStage(stage, context.error),
    stage,
  }));

const isAnalysisEvent = (
  event: AnyEventObject,
): event is Extract<
  VerificationEvent,
  | { type: 'DEBUG_FRAME' }
  | { type: 'FACE_ALIGNED' }
  | { type: 'FACE_FOUND' }
  | { type: 'FACE_LOST' }
  | { type: 'FACE_MISALIGNED' }
  | { type: 'FACE_STABLE' }
  | { type: 'FACE_UNSTABLE' }
  | { type: 'LIGHT_COMPLETED' }
  | { type: 'LIGHT_PROGRESS' }
  | { type: 'LIVENESS_COMPLETED' }
  | { type: 'LIVENESS_PROGRESS' }
> =>
  event.type === 'DEBUG_FRAME' ||
  event.type === 'FACE_ALIGNED' ||
  event.type === 'FACE_FOUND' ||
  event.type === 'FACE_LOST' ||
  event.type === 'FACE_MISALIGNED' ||
  event.type === 'FACE_STABLE' ||
  event.type === 'FACE_UNSTABLE' ||
  event.type === 'LIGHT_COMPLETED' ||
  event.type === 'LIGHT_PROGRESS' ||
  event.type === 'LIVENESS_COMPLETED' ||
  event.type === 'LIVENESS_PROGRESS';

const assignAnalysisEvent = machineAssign(({ context, event }: MachineContextEventArgs) => {
  if (!isAnalysisEvent(event)) {
    return {};
  }

  return {
    detection:
      'detection' in event
        ? (event.detection ?? null)
        : context.detection,
    diagnostics:
      'diagnostics' in event
        ? (event.diagnostics ?? context.diagnostics)
        : context.diagnostics,
    faceFit:
      'faceFit' in event
        ? (event.faceFit ?? null)
        : context.faceFit,
    lastEvent: event,
    light:
      'light' in event
        ? (event.light ?? null)
        : context.light,
    lightResult:
      'lightResult' in event
        ? (event.lightResult ?? context.lightResult)
        : context.lightResult,
    mesh:
      'mesh' in event ? (event.mesh ?? null) : context.mesh,
    spoof:
      'spoof' in event ? (event.spoof ?? null) : context.spoof,
    spoofSummary:
      'spoofSummary' in event
        ? (event.spoofSummary ?? context.spoofSummary)
        : context.spoofSummary,
    stability:
      'stability' in event
        ? (event.stability ?? null)
        : context.stability,
  };
});

const assignFailure = (type: FailureEventType) =>
  machineAssign(({ event }: MachineEventArgs) => {
    const error = getEventError(event);
    const errorDetail = getErrorDetail(event);

    return {
      error,
      errorDetail,
      lastEvent: {
        error,
        errorDetail,
        type,
      },
    };
  });

const isLivenessEvent = (
  event: AnyEventObject,
): event is Extract<VerificationEvent, { liveness: LivenessChallengeState }> =>
  event.type === 'LIVENESS_PROGRESS' || event.type === 'LIVENESS_COMPLETED';

const assignLivenessProgress = machineAssign(({ event }: MachineEventArgs) => {
  if (!isLivenessEvent(event)) {
    return {};
  }

  return {
    instruction: event.liveness.instruction,
    lastEvent: event,
    liveness: event.liveness,
  };
});

const assignLivenessCompleted = (now: () => number) =>
  machineAssign(({ context, event }: MachineContextEventArgs) => {
    if (event.type !== 'LIVENESS_COMPLETED') {
      return {};
    }

    const livenessEvent = event as Extract<VerificationEvent, { type: 'LIVENESS_COMPLETED' }>;
    const completedAt = now();
    return {
      completedAt,
      instruction: livenessEvent.liveness.instruction,
      lastEvent: livenessEvent,
      liveness: livenessEvent.liveness,
      livenessResult: livenessEvent.result,
      spoofSummary: livenessEvent.spoofSummary ?? context.spoofSummary,
      result: createResult(
        context,
        completedAt,
        livenessEvent.result,
        livenessEvent.spoofSummary ?? context.spoofSummary,
        context.lightResult,
      ),
    };
  });

const isLightEvent = (
  event: AnyEventObject,
): event is Extract<VerificationEvent, { light: LightTestState }> =>
  event.type === 'LIGHT_PROGRESS' || event.type === 'LIGHT_COMPLETED';

const assignLightProgress = machineAssign(({ event }: MachineEventArgs) => {
  if (!isLightEvent(event)) {
    return {};
  }

  return {
    instruction: event.light.instruction,
    lastEvent: event,
    light: event.light,
  };
});

const assignLightCompleted = (now: () => number) =>
  machineAssign(({ context, event }: MachineContextEventArgs) => {
    if (event.type !== 'LIGHT_COMPLETED') {
      return {};
    }

    const lightEvent = event as Extract<VerificationEvent, { type: 'LIGHT_COMPLETED' }>;
    const completedAt = now();
    return {
      completedAt,
      instruction: lightEvent.light.instruction,
      lastEvent: lightEvent,
      light: lightEvent.light,
      lightResult: lightEvent.result,
      spoofSummary: lightEvent.spoofSummary ?? context.spoofSummary,
      result: createResult(
        context,
        completedAt,
        context.livenessResult,
        lightEvent.spoofSummary ?? context.spoofSummary,
        lightEvent.result,
      ),
    };
  });

const failWith = (type: FailureEventType) =>
  ({
    actions: assignFailure(type),
    target: 'failed',
  }) as const;

const requestCameraInput = ({ context }: MachineContextArgs): RequestCameraInput => ({
  face: context.options.face,
  video: context.options.video,
});

const loadModelsInput = ({ context }: MachineContextArgs): LoadModelsInput => ({
  checks: context.checks,
  models: context.options.models,
});

const requireModelsHandle = (context: VerificationMachineResourceContext): PhaseOneRuntimeBundle => {
  if (!context.resources.modelsHandle) {
    throw new VerificationError(
      'session.invalid_state',
      'Models must be loaded before face analysis starts.',
      { area: 'session' },
    );
  }

  return context.resources.modelsHandle;
};

const analyzeFaceInput = ({ context }: MachineContextArgs): AnalyzeFaceInput => ({
  checks: context.checks,
  debug: context.debug,
  face: context.options.face,
  light: context.options.light,
  liveness: context.options.liveness,
  modelsHandle: requireModelsHandle(context),
  video: context.options.video,
});

const assignCameraGranted = assign<
  VerificationMachineResourceContext,
  DoneActorEvent<RequestCameraOutput>,
  undefined,
  VerificationEvent,
  MachineProvidedActor
>(({ context, event }) => {
  return {
    lastEvent: {
      streamInfo: event.output.streamInfo,
      type: 'CAMERA_GRANTED',
    },
    resources: {
      ...context.resources,
      cameraHandle: event.output.handle,
    },
    streamInfo: event.output.streamInfo,
  };
});

const assignModelsReady = assign<
  VerificationMachineResourceContext,
  DoneActorEvent<LoadModelsOutput>,
  undefined,
  VerificationEvent,
  MachineProvidedActor
>(({ context, event }) => {
  return {
    lastEvent: {
      models: event.output.models,
      type: 'MODELS_READY',
    },
    models: event.output.models,
    resources: {
      ...context.resources,
      modelsHandle: event.output.handle,
    },
  };
});

const analyze = { actions: assignAnalysisEvent } as const;

const analyzeTo = <TTarget extends string>(target: TTarget) =>
  ({
    actions: assignAnalysisEvent,
    target,
  }) as const;

const clearRuntimeData = machineAssign(() => ({
  completedAt: null,
  detection: null,
  diagnostics: null,
  error: null,
  errorDetail: null,
  faceFit: null,
  lastEvent: null,
  light: null,
  lightResult: null,
  liveness: null,
  livenessResult: null,
  mesh: null,
  models: [],
  resources: {
    cameraHandle: null,
    modelsHandle: null,
  },
  result: null,
  spoof: null,
  spoofSummary: null,
  stability: null,
  startedAt: null,
  streamInfo: null,
}));

const beginSession = (now: () => number) => [
  clearRuntimeData,
  machineAssign({
    lastEvent: () => ({ type: 'START' }),
    startedAt: () => now(),
  }),
] as const;

export const createInitialVerificationContext = (
  options: VerificationOptions<HTMLVideoElement>,
): VerificationMachineResourceContext => {
  const resolved = resolveVerificationOptions(options);

  return {
    checks: resolved.checks,
    completedAt: null,
    debug: resolved.debug,
    detection: null,
    diagnostics: null,
    error: null,
    errorDetail: null,
    faceFit: null,
    instruction: getInstructionForStage('idle'),
    lastEvent: null,
    light: null,
    lightResult: null,
    liveness: null,
    livenessResult: null,
    mesh: null,
    models: [],
    options: resolved,
    resources: {
      cameraHandle: null,
      modelsHandle: null,
    },
    result: null,
    spoof: null,
    spoofSummary: null,
    stage: 'idle',
    stability: null,
    streamInfo: null,
    startedAt: null,
  };
};

export const createVerificationSessionMachine = (
  options: VerificationOptions<HTMLVideoElement>,
  dependencies: VerificationMachineDependencies,
) => {
  const now = dependencies.now ?? (() => Date.now());
  const cleanup = ({ context }: MachineContextArgs) => dependencies.cleanup?.(context);

  return setup({
    actors: {
      analyzeFace: dependencies.analyzeFace,
      loadModels: dependencies.loadModels,
      requestCamera: dependencies.requestCamera,
    },
    guards: {
      canStop: ({ context }: MachineContextArgs) => context.stage !== 'idle' && context.stage !== 'cancelled',
      hasLight: ({ context }: MachineContextArgs) => context.checks.includes('light'),
      hasLiveness: ({ context }: MachineContextArgs) => context.checks.includes('liveness'),
      hasNoPostFaceChallenge: ({ context }: MachineContextArgs) =>
        !context.checks.includes('liveness') && !context.checks.includes('light'),
    },
    types: {
      context: {} as VerificationMachineResourceContext,
      events: {} as VerificationEvent,
    },
  }).createMachine({
    id: 'verification',
    initial: 'idle',
    context: createInitialVerificationContext(options),
    on: {
      RESET: {
        actions: [
          cleanup,
          clearRuntimeData,
        ],
        target: '#verification.idle',
      },
      STOP: [
        {
          actions: [
            machineAssign({
              lastEvent: () => ({ type: 'STOP' }),
            }),
            cleanup,
          ],
          guard: 'canStop',
          target: '#verification.cancelled',
        },
      ],
    },
    states: {
      idle: {
        entry: [
          clearRuntimeData,
          stageAction('idle'),
        ],
        on: {
          START: {
            actions: beginSession(now),
            target: 'booting',
          },
        },
      },
      booting: {
        entry: stageAction('booting'),
        always: {
          target: 'requestingCamera',
        },
      },
      requestingCamera: {
        entry: stageAction('requestingCamera'),
        invoke: {
          id: 'requestCamera',
          input: requestCameraInput,
          onDone: {
            actions: assignCameraGranted,
            target: 'loadingModels',
          },
          onError: failWith('CAMERA_DENIED'),
          src: 'requestCamera',
        },
      },
      loadingModels: {
        entry: stageAction('loadingModels'),
        invoke: {
          id: 'loadModels',
          input: loadModelsInput,
          onDone: {
            actions: assignModelsReady,
            target: 'running',
          },
          onError: {
            actions: [
              assignFailure('MODELS_FAILED'),
              cleanup,
            ],
            target: 'failed',
          },
          src: 'loadModels',
        },
      },
      running: {
        initial: 'acquiringFace',
        invoke: {
          id: 'analyzeFace',
          input: analyzeFaceInput,
          src: 'analyzeFace',
        },
        on: {
          CAMERA_LOST: failWith('CAMERA_LOST'),
          DEBUG_FRAME: analyze,
          ERROR: failWith('ERROR'),
        },
        states: {
          acquiringFace: {
            entry: stageAction('acquiringFace'),
            on: {
              FACE_ALIGNED: analyzeTo('stabilizingFace'),
              FACE_FOUND: analyze,
              FACE_LOST: analyze,
              FACE_MISALIGNED: analyze,
              FACE_STABLE: analyzeTo('faceReady'),
              FACE_UNSTABLE: analyze,
            },
          },
          stabilizingFace: {
            entry: stageAction('stabilizingFace'),
            on: {
              FACE_ALIGNED: analyze,
              FACE_LOST: analyzeTo('acquiringFace'),
              FACE_MISALIGNED: analyzeTo('acquiringFace'),
              FACE_STABLE: analyzeTo('faceReady'),
              FACE_UNSTABLE: analyze,
            },
          },
          faceReady: {
            entry: [
              stageAction('faceReady'),
            ],
            always: [
              {
                actions: machineAssign(({ context }: MachineContextArgs) => {
                  const completedAt = now();
                  return {
                    completedAt,
                    result: createResult(context, completedAt),
                  };
                }),
                guard: 'hasNoPostFaceChallenge',
                target: '#verification.completed',
              },
              {
                guard: 'hasLiveness',
                target: 'livenessChallenge',
              },
              {
                guard: 'hasLight',
                target: 'lightChallenge',
              },
            ],
          },
          livenessChallenge: {
            entry: stageAction('livenessChallenge'),
            on: {
              FACE_ALIGNED: analyze,
              FACE_LOST: analyze,
              FACE_MISALIGNED: analyze,
              FACE_STABLE: analyze,
              FACE_UNSTABLE: analyze,
              LIVENESS_COMPLETED: [
                {
                  actions: [
                    assignAnalysisEvent,
                    assignLivenessCompleted(now),
                  ],
                  guard: 'hasLight',
                  target: 'lightChallenge',
                },
                {
                  actions: [
                    assignAnalysisEvent,
                    assignLivenessCompleted(now),
                  ],
                  target: '#verification.completed',
                },
              ],
              LIVENESS_PROGRESS: {
                actions: [
                  assignAnalysisEvent,
                  assignLivenessProgress,
                ],
              },
            },
          },
          lightChallenge: {
            entry: stageAction('lightChallenge'),
            on: {
              FACE_ALIGNED: analyze,
              FACE_LOST: analyze,
              FACE_MISALIGNED: analyze,
              FACE_STABLE: analyze,
              FACE_UNSTABLE: analyze,
              LIGHT_COMPLETED: {
                actions: [
                  assignAnalysisEvent,
                  assignLightCompleted(now),
                ],
                target: '#verification.completed',
              },
              LIGHT_PROGRESS: {
                actions: [
                  assignAnalysisEvent,
                  assignLightProgress,
                ],
              },
            },
          },
        },
      },
      completed: {
        entry: stageAction('completed'),
        on: {
          START: {
            actions: [
              cleanup,
              ...beginSession(now),
            ],
            target: 'booting',
          },
        },
      },
      failed: {
        entry: [
          stageAction('failed'),
          cleanup,
        ],
        on: {
          START: {
            actions: beginSession(now),
            target: 'booting',
          },
        },
      },
      cancelled: {
        entry: stageAction('cancelled'),
        on: {
          START: {
            actions: beginSession(now),
            target: 'booting',
          },
        },
      },
    },
  });
};

export const toVerificationSnapshot = <TVideo>(
  snapshot: Parameters<typeof createVerificationSnapshot<TVideo>>[0],
): VerificationContext<TVideo> =>
  createVerificationSnapshot(snapshot, snapshot.context as VerificationContext<TVideo>);
