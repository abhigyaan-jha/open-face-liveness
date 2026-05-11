import {
  createVerificationSessionMachine,
  toVerificationSnapshot,
  type AnalyzeFaceInput,
  type LoadModelsInput,
  type LoadModelsOutput,
  type RequestCameraInput,
  type RequestCameraOutput,
  type VerificationMachineResourceContext,
} from './machine.js';
import {
  isVerificationError,
  VerificationError,
  type VerificationErrorCode,
} from '../errors.js';
import type {
  DiagnosticsFrame,
  EvidenceTranscript,
  FaceAnchorPosition,
  FaceDetectionResult,
  FaceFitResult,
  FaceMeshResult,
  FaceStabilityResult,
  LightTestColor,
  LightTestState,
  LivenessChallengeMetrics,
  LivenessChallengeResult,
  LivenessChallengeState,
  LivenessSelfieCheckpoint,
  PrimarySelfieCapture,
  SpoofFrameResult,
  SpoofSummaryResult,
  VerificationOptions as CoreVerificationOptions,
  VerificationEvent,
  VerificationFailureDetail,
  VerificationResult,
  VerificationSnapshot,
  VerificationStage,
} from '../types.js';
import {
  createLightPipeline,
  createLivenessChallengeController,
  extractLivenessChallengeMetrics,
  getAnchorDrift,
  getAnchorPosition,
  getFaceComparisonBox,
  getFaceGuideRect,
  isAnchorStable,
  isVerificationRuntimeError,
  loadPhaseOneRuntime,
  summarizeSpoofSamples,
  validateFaceFit,
  type LivenessChallengeController,
  type LightPipeline,
  type PhaseOneRuntimeBundle,
} from '../runtime.js';
import { createActor, fromCallback, fromPromise, type AnyEventObject } from 'xstate';
import { requestCamera, type CameraHandle } from '../capture/camera.js';
import { createFrameLoop } from '../capture/frame-loop.js';
import { getErrorMessage } from '../capture/media.js';
import { SubscriptionStore, type Unsubscribe } from './subscriptions.js';

export type VerificationOptions = CoreVerificationOptions<HTMLVideoElement>;
export type WebVerificationSnapshot = VerificationSnapshot<HTMLVideoElement>;

export interface VerificationSession {
  destroy(): void;
  getSnapshot(): WebVerificationSnapshot;
  reset(): void;
  start(): Promise<VerificationResult>;
  stop(): void;
  subscribe(listener: (snapshot: WebVerificationSnapshot) => void): Unsubscribe;
}

interface LivenessCompletionHold {
  diagnostics: DiagnosticsFrame;
  readyAt: number;
  result: LivenessChallengeResult;
  state: LivenessChallengeState;
}

const PRIMARY_SELFIE_MIME_TYPE = 'image/jpeg';
const PRIMARY_SELFIE_QUALITY = 0.92;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const isCameraPermissionError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === 'NotAllowedError' ||
    error.name === 'PermissionDeniedError' ||
    error.name === 'SecurityError');

const toCameraError = (error: unknown): VerificationError => {
  if (error instanceof VerificationError) {
    return error;
  }

  if (isCameraPermissionError(error)) {
    return new VerificationError(
      'camera.permission_denied',
      'Camera access is required to continue.',
      { cause: error },
    );
  }

  return new VerificationError(
    'camera.unavailable',
    'Camera access is unavailable. Check your camera and try again.',
    { cause: error },
  );
};

const getSnapshotErrorCode = (snapshot: WebVerificationSnapshot): VerificationErrorCode => {
  switch (snapshot.lastEvent?.type) {
    case 'CAMERA_DENIED':
      return 'camera.permission_denied';
    case 'CAMERA_LOST':
      return 'camera.lost';
    case 'MODELS_FAILED':
      return 'models.load_failed';
    case 'ERROR':
      return 'analysis.failed';
    default:
      return 'unknown';
  }
};

const createRequiredCheckFailureDetail = (
  check: VerificationFailureDetail['check'],
  code: VerificationFailureDetail['code'],
  message: string,
): VerificationFailureDetail => ({
  check,
  code,
  message,
});

const createLightIlluminationController = () => {
  let element: HTMLDivElement | null = null;

  const getFlashColor = (color: LightTestColor): string =>
    `rgb(${color.rgb[0]} ${color.rgb[1]} ${color.rgb[2]})`;

  const ensureElement = () => {
    if (element) {
      return element;
    }

    element = document.createElement('div');
    element.setAttribute('aria-hidden', 'true');
    element.style.backgroundColor = 'transparent';
    element.style.height = '100dvh';
    element.style.inset = '0';
    element.style.mixBlendMode = 'normal';
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';
    element.style.position = 'fixed';
    element.style.transition = 'background-color 45ms linear, opacity 45ms linear';
    element.style.width = '100vw';
    element.style.zIndex = '2147483647';
    document.body.appendChild(element);
    return element;
  };

  return {
    destroy() {
      element?.remove();
      element = null;
    },
    set(color: LightTestColor | null) {
      if (!color) {
        if (element) {
          element.style.opacity = '0';
          element.style.backgroundColor = 'transparent';
        }
        return;
      }

      const overlay = ensureElement();
      overlay.style.backgroundColor = getFlashColor(color);
      overlay.style.opacity = '0.96';
    },
  };
};

const createDiagnosticsFrame = ({
  detection,
  faceFit,
  frameIndex,
  frameMs,
  light,
  livenessMetrics,
  mesh,
  spoof,
  stability,
  stage,
  timestamp,
  video,
}: {
  detection: FaceDetectionResult | null;
  faceFit: FaceFitResult | null;
  frameIndex: number;
  frameMs: number | null;
  light?: LightTestState | null;
  livenessMetrics: LivenessChallengeMetrics | null;
  mesh: FaceMeshResult | null;
  spoof: SpoofFrameResult | null;
  stability: FaceStabilityResult | null;
  stage: VerificationStage;
  timestamp: number;
  video: HTMLVideoElement;
}): DiagnosticsFrame => ({
  detection,
  faceFit,
  frameIndex,
  frameSize: {
    height: video.videoHeight || 0,
    width: video.videoWidth || 0,
  },
  light: light ?? null,
  livenessMetrics,
  mesh,
  spoof,
  stability,
  stage,
  timestamp,
  timings: {
    detectorMs: detection?.runMs ?? null,
    frameMs,
    meshMs: mesh?.runMs ?? null,
    spoofMs: spoof?.runMs ?? null,
  },
});

const capturePrimarySelfieFrame = ({
  capturedAt,
  checkpoint,
  video,
}: {
  capturedAt: number;
  checkpoint: LivenessSelfieCheckpoint;
  video: HTMLVideoElement;
}): PrimarySelfieCapture | null => {
  const width = video.videoWidth || 0;
  const height = video.videoHeight || 0;

  if (!width || !height || typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, width, height);

  return {
    capturedAt,
    checkpoint,
    frameSize: {
      height,
      width,
    },
    imageDataUrl: canvas.toDataURL(PRIMARY_SELFIE_MIME_TYPE, PRIMARY_SELFIE_QUALITY),
  };
};

const isPrimarySelfieCaptureReady = (
  state: LivenessChallengeState,
  diagnostics: DiagnosticsFrame,
): state is LivenessChallengeState & { selfieCheckpoint: LivenessSelfieCheckpoint } =>
  state.phase === 'active' &&
  state.selfieCheckpoint !== null &&
  state.currentStep === state.selfieCheckpoint &&
  Boolean(
    diagnostics.detection &&
    diagnostics.mesh &&
    diagnostics.faceFit?.isAligned &&
    diagnostics.faceFit.isFaceLargeEnough &&
    diagnostics.stability?.isStable,
  );

const createEvidenceTranscript = ({
  diagnostics,
  primarySelfie,
  state,
}: {
  diagnostics: DiagnosticsFrame;
  primarySelfie: PrimarySelfieCapture;
  state: LivenessChallengeState & { selfieCheckpoint: LivenessSelfieCheckpoint };
}): EvidenceTranscript => ({
  capture: {
    capturedAt: primarySelfie.capturedAt,
    checkpoint: primarySelfie.checkpoint,
    frameIndex: diagnostics.frameIndex,
    frameSize: {
      height: diagnostics.frameSize.height,
      width: diagnostics.frameSize.width,
    },
    quality: {
      detectionScore: diagnostics.detection?.score ?? null,
      faceAligned: Boolean(diagnostics.faceFit?.isAligned),
      faceDetected: Boolean(diagnostics.detection),
      faceStable: Boolean(diagnostics.stability?.isStable),
      faceWithinBounds: Boolean(
        diagnostics.faceFit?.isContainedHorizontally &&
        diagnostics.faceFit.isContainedVertically,
      ),
      landmarksDetected: Boolean(diagnostics.mesh && diagnostics.mesh.visibleLandmarks > 0),
      visibleLandmarks: diagnostics.mesh?.visibleLandmarks ?? null,
    },
  },
  challenge: {
    challengeId: state.challengeId,
    checksum: state.checksum,
    nonce: state.nonce,
    policyVersion: state.policyVersion,
    selfieCheckpoint: state.selfieCheckpoint,
    sequence: [...state.sequence],
  },
  primarySelfie,
});

const createRequestCameraActor = () =>
  fromPromise<RequestCameraOutput, RequestCameraInput>(async ({ input }) => {
    const { face, video } = input;
    let handle: CameraHandle;

    try {
      handle = await requestCamera({ face, video });
    } catch (error) {
      throw toCameraError(error);
    }

    return {
      handle,
      streamInfo: handle.streamInfo,
    };
  });

const createLoadModelsActor = () =>
  fromPromise<LoadModelsOutput, LoadModelsInput>(async ({ input }) => {
    const { checks, models } = input;
    let bundle: PhaseOneRuntimeBundle;

    try {
      bundle = await loadPhaseOneRuntime({ checks, models });
    } catch (error) {
      const detail = isVerificationRuntimeError(error) ? error.detail : null;
      throw new VerificationError(
        'models.load_failed',
        detail?.message ?? 'Face verification could not start. Please try again.',
        { cause: error, detail },
      );
    }

    return {
      handle: bundle,
      models: bundle.models,
    };
  });

const createAnalyzeFaceActor = () =>
  fromCallback<AnyEventObject, AnalyzeFaceInput>(({ input, sendBack }) => {
    const {
      challengePlan,
      checks,
      debug,
      face,
      light,
      liveness,
      modelsHandle,
      primarySelfie: primarySelfieOptions,
      video,
    } = input;
    const runtime = modelsHandle;
    const sendEvent = (event: VerificationEvent) => sendBack(event);
    const hasLight = checks.includes('light');
    const hasLiveness = checks.includes('liveness');
    const hasSpoof = checks.includes('spoof');
    const shouldCapturePrimarySelfie = hasLiveness && primarySelfieOptions.required;
    const livenessController: LivenessChallengeController | null = hasLiveness
      ? createLivenessChallengeController({
          challengePlan: challengePlan ?? undefined,
          options: liveness,
        })
      : null;
    const illumination = createLightIlluminationController();
    const lightPipeline: LightPipeline | null = hasLight
      ? createLightPipeline({
          onIlluminationChange: (color) => illumination.set(color),
          options: light,
        })
      : null;
    let anchorReference: FaceAnchorPosition | null = null;
    let faceReadyEmitted = false;
    let frameIndex = 0;
    let lastDebugAt = 0;
    let lightCompleted = !hasLight;
    let livenessCompleted = !hasLiveness;
    let livenessCompletionHold: LivenessCompletionHold | null = null;
    const livenessToLightDelayMs = hasLight ? Math.max(0, liveness.celebrationDurationMs) : 0;
    let livenessStarted = false;
    let evidenceTranscript: EvidenceTranscript | null = null;
    let primarySelfie: PrimarySelfieCapture | null = null;
    let stableStartedAt = 0;
    let stopped = false;
    const spoofSamples: SpoofFrameResult[] = [];
    let skippedSpoofSamples = 0;
    let spoofSummary: SpoofSummaryResult | null = hasSpoof
      ? summarizeSpoofSamples(spoofSamples, skippedSpoofSamples)
      : null;

    const getRequiredSpoofFailure = (): VerificationFailureDetail | null => {
      if (!hasSpoof) {
        return null;
      }

      if (!spoofSummary || spoofSummary.modelsUsed <= 0 || spoofSummary.sampleCount <= 0) {
        return createRequiredCheckFailureDetail(
          'spoof',
          'insufficient_evidence',
          'Required spoof check did not produce evidence.',
        );
      }

      return null;
    };

    const sendRequiredCheckFailure = (failureDetail: VerificationFailureDetail): void => {
      sendEvent({
        error: failureDetail.message,
        failureDetail,
        type: 'ERROR',
      });
    };

    const resetStability = () => {
      anchorReference = null;
      stableStartedAt = 0;
    };

    const emitDebugFrame = (diagnostics: DiagnosticsFrame) => {
      if (!debug.enabled || diagnostics.timestamp - lastDebugAt < debug.throttleMs) {
        return;
      }

      lastDebugAt = diagnostics.timestamp;
      sendEvent({
        detection: diagnostics.detection,
        diagnostics,
        faceFit: diagnostics.faceFit,
        light: diagnostics.light,
        mesh: diagnostics.mesh,
        spoof: diagnostics.spoof,
        spoofSummary,
        ...(diagnostics.stability ? { stability: diagnostics.stability } : {}),
        type: 'DEBUG_FRAME',
      });
    };

    const getDiagnosticsPayload = (diagnostics: DiagnosticsFrame): DiagnosticsFrame | null =>
      debug.enabled ? diagnostics : null;

    const maybeCapturePrimarySelfie = (
      livenessState: LivenessChallengeState,
      diagnostics: DiagnosticsFrame,
    ): PrimarySelfieCapture | null => {
      if (!shouldCapturePrimarySelfie || primarySelfie || !isPrimarySelfieCaptureReady(livenessState, diagnostics)) {
        return primarySelfie;
      }

      primarySelfie = capturePrimarySelfieFrame({
        capturedAt: diagnostics.timestamp,
        checkpoint: livenessState.selfieCheckpoint,
        video,
      });
      if (primarySelfie) {
        evidenceTranscript = createEvidenceTranscript({
          diagnostics,
          primarySelfie,
          state: livenessState,
        });
      }

      return primarySelfie;
    };

    const emitLivenessUpdate = (
      diagnostics: DiagnosticsFrame,
      anchorPosition: FaceAnchorPosition | null,
    ): boolean => {
      if (!livenessController) {
        return false;
      }

      if (livenessCompletionHold) {
        const { diagnostics: heldDiagnostics, readyAt, result, state } = livenessCompletionHold;
        const payload = {
          detection: heldDiagnostics.detection,
          diagnostics: getDiagnosticsPayload(heldDiagnostics),
          evidenceTranscript,
          faceFit: heldDiagnostics.faceFit,
          liveness: state,
          mesh: heldDiagnostics.mesh,
          primarySelfie,
          spoof: heldDiagnostics.spoof,
          spoofSummary,
          stability: heldDiagnostics.stability,
        };

        if (diagnostics.timestamp >= readyAt) {
          const spoofFailure = getRequiredSpoofFailure();
          if (spoofFailure) {
            sendRequiredCheckFailure(spoofFailure);
            return false;
          }

          livenessCompleted = true;
          livenessCompletionHold = null;
          sendEvent({
            ...payload,
            result,
            type: 'LIVENESS_COMPLETED',
          });
          return true;
        }

        sendEvent({
          ...payload,
          type: 'LIVENESS_PROGRESS',
        });
        return false;
      }

      if (!livenessStarted) {
        livenessController.start(diagnostics.timestamp);
        livenessStarted = true;
      }

      const previousState = livenessController.getState();
      const { result, state } = livenessController.update({
        anchorPosition,
        faceFit: diagnostics.faceFit,
        metrics: diagnostics.livenessMetrics,
        timestamp: diagnostics.timestamp,
      });
      maybeCapturePrimarySelfie(
        state.phase === 'active' ? state : previousState,
        diagnostics,
      );
      const payload = {
        detection: diagnostics.detection,
        diagnostics: getDiagnosticsPayload(diagnostics),
        evidenceTranscript,
        faceFit: diagnostics.faceFit,
        liveness: state,
        mesh: diagnostics.mesh,
        primarySelfie,
        spoof: diagnostics.spoof,
        spoofSummary,
        stability: diagnostics.stability,
      };

      if (result) {
        const spoofFailure = getRequiredSpoofFailure();
        if (spoofFailure) {
          sendRequiredCheckFailure(spoofFailure);
          return false;
        }

        if (livenessToLightDelayMs > 0) {
          livenessCompletionHold = {
            diagnostics,
            readyAt: diagnostics.timestamp + livenessToLightDelayMs,
            result,
            state,
          };
          sendEvent({
            ...payload,
            type: 'LIVENESS_PROGRESS',
          });
          return false;
        }

        livenessCompleted = true;
        sendEvent({
          ...payload,
          result,
          type: 'LIVENESS_COMPLETED',
        });
        return true;
      }

      sendEvent({
        ...payload,
        type: 'LIVENESS_PROGRESS',
      });
      return false;
    };

    const emitLightUpdate = async (
      diagnostics: DiagnosticsFrame,
    ): Promise<boolean> => {
      if (!lightPipeline || !diagnostics.detection || !diagnostics.faceFit || !diagnostics.mesh) {
        return false;
      }

      const { result, state } = await lightPipeline.update({
        detection: diagnostics.detection,
        faceFit: diagnostics.faceFit,
        frameIndex: diagnostics.frameIndex,
        mesh: diagnostics.mesh,
        timestamp: diagnostics.timestamp,
        video,
      });
      const lightDiagnostics: DiagnosticsFrame = {
        ...diagnostics,
        light: state,
        stage: 'lightChallenge',
      };
      const payload = {
        detection: diagnostics.detection,
        diagnostics: getDiagnosticsPayload(lightDiagnostics),
        faceFit: diagnostics.faceFit,
        light: state,
        mesh: diagnostics.mesh,
        spoof: null,
        spoofSummary,
      };

      if (result) {
        const spoofFailure = getRequiredSpoofFailure();
        if (spoofFailure) {
          sendRequiredCheckFailure(spoofFailure);
          return false;
        }

        lightCompleted = true;
        sendEvent({
          ...payload,
          result,
          type: 'LIGHT_COMPLETED',
        });
        return true;
      }

      sendEvent({
        ...payload,
        type: 'LIGHT_PROGRESS',
      });
      return false;
    };

    const recordSpoofFrame = async (
      detection: FaceDetectionResult,
    ): Promise<SpoofFrameResult | null> => {
      if (!hasSpoof) {
        return null;
      }

      if (!runtime.spoof) {
        throw new VerificationError(
          'analysis.failed',
          'Required spoof check is unavailable.',
          {
            detail: createRequiredCheckFailureDetail(
              'spoof',
              'required_check_unavailable',
              'Required spoof check is unavailable.',
            ),
          },
        );
      }

      try {
        const result = await runtime.spoof.analyze(video, detection);
        if (result) {
          spoofSamples.push(result);
        } else {
          skippedSpoofSamples += 1;
        }
        spoofSummary = summarizeSpoofSamples(spoofSamples, skippedSpoofSamples);
        return result;
      } catch {
        skippedSpoofSamples += 1;
        spoofSummary = summarizeSpoofSamples(spoofSamples, skippedSpoofSamples);
        return null;
      }
    };

    const loop = createFrameLoop(async (timestamp) => {
      const frameStartedAt = performance.now();
      let detection: FaceDetectionResult | null = null;
      let faceFit: FaceFitResult | null = null;
      let livenessMetrics: LivenessChallengeMetrics | null = null;
      let mesh: FaceMeshResult | null = null;
      let spoof: SpoofFrameResult | null = null;
      let stability: FaceStabilityResult | null = null;
      let stage: VerificationStage = 'acquiringFace';

      try {
        detection = await runtime.detector.detect(video);

        if (!detection) {
          const isRunningLight = Boolean(lightPipeline && livenessCompleted && !lightCompleted);
          resetStability();
          stage = isRunningLight ? 'lightChallenge' : faceReadyEmitted ? 'livenessChallenge' : stage;
          const diagnostics = createDiagnosticsFrame({
            detection,
            faceFit,
            frameIndex,
            frameMs: performance.now() - frameStartedAt,
            light: isRunningLight
              ? lightPipeline?.getState('Keep your face in view for the light reflection check.', 0)
              : null,
            livenessMetrics,
            mesh,
            spoof,
            stability,
            stage,
            timestamp,
            video,
          });
          if (isRunningLight && lightPipeline) {
            const state = lightPipeline.getState('Hold still while face landmarks recover.', 0);
            const lightDiagnostics = { ...diagnostics, light: state };
            sendEvent({
              diagnostics: getDiagnosticsPayload(lightDiagnostics),
              light: state,
              spoofSummary,
              type: 'LIGHT_PROGRESS',
            });
            emitDebugFrame(lightDiagnostics);
            frameIndex += 1;
            return;
          }
          if (faceReadyEmitted && livenessController && !livenessCompleted) {
            emitLivenessUpdate(diagnostics, null);
            emitDebugFrame(diagnostics);
            frameIndex += 1;
            return;
          }
          sendEvent({
            detection: null,
            diagnostics: getDiagnosticsPayload(diagnostics),
            faceFit: null,
            mesh: null,
            spoof: null,
            spoofSummary,
            stability: null,
            type: 'FACE_LOST',
          });
          emitDebugFrame(diagnostics);
          frameIndex += 1;
          return;
        }

        mesh = await runtime.mesh.estimate(video, detection, {
          roiExpandFactor: face.roiExpandFactor,
        });

        if (!mesh) {
          const isRunningLight = Boolean(lightPipeline && livenessCompleted && !lightCompleted);
          resetStability();
          stage = isRunningLight ? 'lightChallenge' : faceReadyEmitted ? 'livenessChallenge' : stage;
          const diagnostics = createDiagnosticsFrame({
            detection,
            faceFit,
            frameIndex,
            frameMs: performance.now() - frameStartedAt,
            light: isRunningLight
              ? lightPipeline?.getState('Hold still while face landmarks recover.', 0)
              : null,
            livenessMetrics,
            mesh,
            spoof,
            stability,
            stage,
            timestamp,
            video,
          });
          if (isRunningLight && lightPipeline) {
            const state = lightPipeline.getState('Keep your face in view for the light reflection check.', 0);
            const lightDiagnostics = { ...diagnostics, light: state };
            sendEvent({
              diagnostics: getDiagnosticsPayload(lightDiagnostics),
              light: state,
              spoofSummary,
              type: 'LIGHT_PROGRESS',
            });
            emitDebugFrame(lightDiagnostics);
            frameIndex += 1;
            return;
          }
          if (faceReadyEmitted && livenessController && !livenessCompleted) {
            emitLivenessUpdate(diagnostics, null);
            emitDebugFrame(diagnostics);
            frameIndex += 1;
            return;
          }
          sendEvent({
            detection,
            diagnostics: getDiagnosticsPayload(diagnostics),
            spoof: null,
            spoofSummary,
            type: 'FACE_FOUND',
          });
          emitDebugFrame(diagnostics);
          frameIndex += 1;
          return;
        }

        livenessMetrics = extractLivenessChallengeMetrics(mesh);
        const guideBox = getFaceGuideRect(video.videoWidth, video.videoHeight);
        const comparisonBox = getFaceComparisonBox(detection, video.videoWidth, video.videoHeight);
        faceFit = validateFaceFit(comparisonBox, guideBox, face);
        const anchorPosition = getAnchorPosition(comparisonBox, video.videoWidth, video.videoHeight);
        const isRunningLight = Boolean(lightPipeline && livenessCompleted && !lightCompleted);

        if (isRunningLight && lightPipeline) {
          stage = 'lightChallenge';
          const diagnostics = createDiagnosticsFrame({
            detection,
            faceFit,
            frameIndex,
            frameMs: performance.now() - frameStartedAt,
            livenessMetrics,
            mesh,
            spoof,
            stability,
            stage,
            timestamp,
            video,
          });
          await emitLightUpdate(diagnostics);
          emitDebugFrame({
            ...diagnostics,
            light: lightPipeline.getState(),
            stage: 'lightChallenge',
          });
          frameIndex += 1;
          return;
        }

        if (!faceFit.isAligned) {
          stage = faceReadyEmitted ? 'livenessChallenge' : stage;
          if (!faceReadyEmitted) {
            resetStability();
          }
          const diagnostics = createDiagnosticsFrame({
            detection,
            faceFit,
            frameIndex,
            frameMs: performance.now() - frameStartedAt,
            livenessMetrics,
            mesh,
            spoof,
            stability,
            stage,
            timestamp,
            video,
          });
          if (faceReadyEmitted && livenessController && !livenessCompleted) {
            emitLivenessUpdate(diagnostics, anchorPosition);
            emitDebugFrame(diagnostics);
            frameIndex += 1;
            return;
          }
          sendEvent({
            detection,
            diagnostics: getDiagnosticsPayload(diagnostics),
            faceFit,
            mesh,
            spoof,
            spoofSummary,
            stability: null,
            type: 'FACE_MISALIGNED',
          });
          emitDebugFrame(diagnostics);
          frameIndex += 1;
          return;
        }

        stage = 'stabilizingFace';
        let anchorDrift = getAnchorDrift(anchorPosition, anchorReference);

        if (!anchorReference || !isAnchorStable(anchorDrift, face)) {
          anchorReference = anchorPosition;
          anchorDrift = null;
          stableStartedAt = timestamp;
        }

        const stableMs = Math.max(0, timestamp - stableStartedAt);
        const progress = clamp(stableMs / face.stabilizationDurationMs, 0, 1);
        const isStable = progress >= 1;
        stability = {
          anchorDrift,
          anchorPosition,
          isStable,
          progress,
          requiredMs: face.stabilizationDurationMs,
          stableMs,
        };
        stage = isStable ? 'faceReady' : 'stabilizingFace';
        if (faceReadyEmitted && livenessController && !livenessCompleted) {
          stage = 'livenessChallenge';
        }

        spoof = isStable && !livenessCompletionHold
          ? await recordSpoofFrame(detection)
          : null;

        const diagnostics = createDiagnosticsFrame({
          detection,
          faceFit,
          frameIndex,
          frameMs: performance.now() - frameStartedAt,
          livenessMetrics,
          mesh,
          spoof,
          stability,
          stage,
          timestamp,
          video,
        });

        if (
          (livenessCompletionHold || faceReadyEmitted) &&
          livenessController &&
          !livenessCompleted
        ) {
          emitLivenessUpdate(diagnostics, anchorPosition);
          emitDebugFrame(diagnostics);
          frameIndex += 1;
          return;
        }

        if (isStable && livenessController && !livenessCompleted) {
          if (!faceReadyEmitted) {
            faceReadyEmitted = true;
            sendEvent({
              detection,
              diagnostics: getDiagnosticsPayload(diagnostics),
              faceFit,
              mesh,
              spoof,
              spoofSummary,
              stability,
              type: 'FACE_STABLE',
            });
            emitDebugFrame(diagnostics);
            frameIndex += 1;
            return;
          }

          emitLivenessUpdate(diagnostics, anchorPosition);
          emitDebugFrame(diagnostics);
          frameIndex += 1;
          return;
        }

        sendEvent({
          detection,
          diagnostics: getDiagnosticsPayload(diagnostics),
          faceFit,
          mesh,
          spoof,
          spoofSummary,
          stability,
          type: isStable ? 'FACE_STABLE' : 'FACE_ALIGNED',
        });
        emitDebugFrame(diagnostics);
        frameIndex += 1;
      } catch (error) {
        const failureDetail = isVerificationError(error) ? error.detail : null;
        sendEvent({
          error: getErrorMessage(error, 'Face verification failed. Please try again.'),
          failureDetail,
          type: 'ERROR',
        });
      }
    });

    loop.start();

    return () => {
      stopped = true;
      loop.stop();
      illumination.destroy();
      void lightPipeline?.destroy();
      void stopped;
    };
  });

const cleanupResources = (context: VerificationMachineResourceContext) => {
  context.resources.cameraHandle?.stop();
  void context.resources.modelsHandle?.destroy();
};

export const createVerificationSession = (options: VerificationOptions): VerificationSession => {
  const machine = createVerificationSessionMachine(options, {
    analyzeFace: createAnalyzeFaceActor(),
    cleanup: cleanupResources,
    loadModels: createLoadModelsActor(),
    requestCamera: createRequestCameraActor(),
  });
  const actor = createActor(
    machine,
    options.xstateInspect ? { inspect: options.xstateInspect } : undefined,
  );
  const store = new SubscriptionStore<WebVerificationSnapshot>();
  let latestSnapshot = toVerificationSnapshot<HTMLVideoElement>(actor.getSnapshot());
  let pendingStart: Promise<VerificationResult> | null = null;

  actor.subscribe((snapshot) => {
    latestSnapshot = toVerificationSnapshot<HTMLVideoElement>(snapshot);
    store.emit(latestSnapshot);
  });
  actor.start();
  latestSnapshot = toVerificationSnapshot<HTMLVideoElement>(actor.getSnapshot());

  const waitForResult = (): Promise<VerificationResult> =>
    new Promise((resolve, reject) => {
      const unsubscribe = store.subscribe((snapshot) => {
        if (snapshot.stage === 'completed') {
          unsubscribe();
          if (snapshot.result) {
            resolve(snapshot.result);
            return;
          }

          reject(new Error('Verification completed without a result.'));
          return;
        }

        if (snapshot.stage === 'failed' || snapshot.stage === 'cancelled') {
          unsubscribe();
          reject(
            new VerificationError(
              getSnapshotErrorCode(snapshot),
              snapshot.error ?? snapshot.instruction,
              { detail: snapshot.failureDetail },
            ),
          );
        }
      });

      store.emit(latestSnapshot);
    });

  return {
    destroy() {
      cleanupResources(actor.getSnapshot().context);
      actor.stop();
      store.clear();
    },
    getSnapshot() {
      return latestSnapshot;
    },
    reset() {
      pendingStart = null;
      actor.send({ type: 'RESET' });
    },
    start() {
      if (pendingStart) {
        return pendingStart;
      }

      actor.send({ type: 'START' });
      pendingStart = waitForResult().finally(() => {
        pendingStart = null;
      });

      return pendingStart;
    },
    stop() {
      actor.send({ type: 'STOP' });
    },
    subscribe(listener: (snapshot: WebVerificationSnapshot) => void) {
      const unsubscribe = store.subscribe(listener);
      listener(latestSnapshot);

      return unsubscribe;
    },
  };
};
