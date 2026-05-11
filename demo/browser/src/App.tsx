import {
  Camera,
  Check,
  MoveDown,
  MoveLeft,
  MoveRight,
  MoveUp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  createLightSequence,
  createLivenessSequence,
  createWebVerifyClient,
  isVerificationError,
  type CheckConfig,
  type VerificationResult,
  type VerificationSession,
  type WebVerificationSnapshot,
} from '../../../src/index.js';
import type { FrameSize, LivenessChallengeDirection, Rect } from '../../../src/result.js';
import { createFrameToDisplayMapper } from '../../../src/capture/geometry.js';
import { mountDiagnosticsOverlay } from '../../../src/draw/index.js';

const MODEL_MANIFEST_URL = '/models/manifest.json';
const OPENCV_ASSET_BASE_URL = '/vendor/opencv/';

type OverlayPhase = 'detecting' | 'idle' | 'recentering' | 'stabilizing' | 'success';

const verifier = createWebVerifyClient({
  models: {
    manifestUrl: MODEL_MANIFEST_URL,
  },
});

const formatNumber = (value: number | null | undefined, digits = 3): string =>
  Number.isFinite(value) ? Number(value).toFixed(digits) : '-';

const formatPercent = (value: number | null | undefined, digits = 1): string =>
  Number.isFinite(value) ? `${(Number(value) * 100).toFixed(digits)}%` : '-';

const formatMs = (value: number | null | undefined): string =>
  Number.isFinite(value) ? `${Number(value).toFixed(1)} ms` : '-';

const getErrorMessage = (error: unknown): string => {
  if (isVerificationError(error)) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return typeof error === 'string' && error.length > 0
    ? error
    : 'Verification failed.';
};

const getOverlayPhase = (snapshot: WebVerificationSnapshot | null): OverlayPhase => {
  if (snapshot?.stage === 'lightChallenge') {
    return snapshot.light?.phase === 'complete' ? 'success' : 'stabilizing';
  }

  switch (snapshot?.liveness?.phase) {
    case 'active':
      return 'detecting';
    case 'celebrating':
    case 'complete':
      return 'success';
    case 'recentering':
      return 'recentering';
    case 'stabilizing':
      return 'stabilizing';
    case 'idle':
    case undefined:
      break;
  }

  if (snapshot?.stage === 'completed') {
    return 'success';
  }

  if (snapshot?.stage === 'requestingCamera' || snapshot?.stage === 'loadingModels') {
    return 'stabilizing';
  }

  if (snapshot?.stage === 'stabilizingFace') {
    return 'recentering';
  }

  if (snapshot?.stage === 'acquiringFace' || snapshot?.stage === 'faceReady') {
    return 'detecting';
  }

  return 'idle';
};

const getGuideClasses = (phase: OverlayPhase): string => {
  switch (phase) {
    case 'stabilizing':
      return 'face-guide-base face-guide-stabilizing';
    case 'detecting':
      return 'face-guide-base face-guide-detecting';
    case 'recentering':
      return 'face-guide-base face-guide-recentering';
    case 'success':
      return 'face-guide-base face-guide-success';
    case 'idle':
    default:
      return 'face-guide-base face-guide-idle';
  }
};

const UnifiedOverlay = ({
  guideRect,
  phase,
  showDarkOverlay,
  showFaceGuide = true,
}: {
  guideRect: Rect | null;
  phase: OverlayPhase;
  showDarkOverlay: boolean;
  showFaceGuide?: boolean;
}) => {
  const showSuccess = phase === 'success';
  const guideStyle = guideRect
    ? {
        height: `${guideRect.height}px`,
        left: `${guideRect.x}px`,
        top: `${guideRect.y}px`,
        width: `${guideRect.width}px`,
      }
    : undefined;

  return (
    <div className="overlay-root" data-testid="unified-overlay">
      {showDarkOverlay && guideStyle ? (
        <div className="absolute-fill">
          <div className="face-cutout" data-testid="face-cutout" style={guideStyle} />
        </div>
      ) : null}

      {showFaceGuide && guideStyle ? (
        <div className="absolute-fill">
          <div className={getGuideClasses(phase)} data-testid="face-guide" style={guideStyle} />
        </div>
      ) : null}

      {showSuccess ? (
        <div className="success-center">
          <div className="success-badge">
            <Check className="success-icon" strokeWidth={3} />
          </div>
        </div>
      ) : null}
    </div>
  );
};

const DirectionalArrow = ({ direction }: { direction: LivenessChallengeDirection }) => {
  if (direction === 'none') {
    return null;
  }

  const icons = {
    down: MoveDown,
    left: MoveLeft,
    right: MoveRight,
    up: MoveUp,
  };
  const offsets = {
    down: 'translateY(15px)',
    left: 'translateX(-15px)',
    right: 'translateX(15px)',
    up: 'translateY(-15px)',
  };
  const Icon = icons[direction];

  return (
    <div className="direction-arrow-layer" data-testid={`arrow-${direction}`}>
      <div className="direction-arrow" style={{ '--arrow-offset': offsets[direction] } as React.CSSProperties}>
        <Icon strokeWidth={2} />
      </div>
    </div>
  );
};

const VerificationCamera = ({
  centerContent,
  direction = 'none',
  overlay,
  statusContent,
  videoChildren,
  videoFrameSize,
}: {
  centerContent?: ReactNode;
  direction?: LivenessChallengeDirection;
  overlay: {
    phase: OverlayPhase;
    showDarkOverlay: boolean;
    showFaceGuide: boolean;
  };
  statusContent?: ReactNode;
  videoChildren: ReactNode;
  videoFrameSize: FrameSize | null;
}) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const [guideRect, setGuideRect] = useState<Rect | null>(null);

  const updateGuideRect = useCallback(() => {
    const surface = surfaceRef.current;
    const videoWrapper = videoWrapperRef.current;
    if (!surface || !videoWrapper || !videoFrameSize?.width || !videoFrameSize.height) {
      setGuideRect(null);
      return;
    }

    const frameGuideRect = {
      height: videoFrameSize.height * 0.58,
      width: videoFrameSize.height * 0.58 * 0.78,
      x: (videoFrameSize.width - videoFrameSize.height * 0.58 * 0.78) / 2,
      y: videoFrameSize.height * 0.18,
    };
    const surfaceBounds = surface.getBoundingClientRect();
    const videoBounds = videoWrapper.getBoundingClientRect();
    const mapper = createFrameToDisplayMapper(
      videoFrameSize,
      { height: videoBounds.height, width: videoBounds.width },
      { fit: 'cover', mirrored: true },
    );
    const mappedGuideRect = mapper.mapRect(frameGuideRect);
    setGuideRect({
      height: mappedGuideRect.height,
      width: mappedGuideRect.width,
      x: videoBounds.left - surfaceBounds.left + mappedGuideRect.x,
      y: videoBounds.top - surfaceBounds.top + mappedGuideRect.y,
    });
  }, [videoFrameSize]);

  useEffect(() => {
    updateGuideRect();

    const surface = surfaceRef.current;
    const videoWrapper = videoWrapperRef.current;
    if (!surface || !videoWrapper) {
      return;
    }

    const resizeObserver = new ResizeObserver(updateGuideRect);
    resizeObserver.observe(surface);
    resizeObserver.observe(videoWrapper);

    return () => resizeObserver.disconnect();
  }, [updateGuideRect]);

  return (
    <>
      <div className="camera-surface" ref={surfaceRef}>
        <section aria-label="Camera video feed" className="video-container" data-testid="video-container">
          <div className="video-wrapper" data-testid="video-wrapper" ref={videoWrapperRef}>
            {videoChildren}
          </div>
        </section>

        <UnifiedOverlay guideRect={guideRect} {...overlay} />
        <DirectionalArrow direction={direction} />

        {centerContent ? <div className="camera-center-copy">{centerContent}</div> : null}
      </div>

      <div className="verification-status">
        <div className="status-copy">{statusContent}</div>
      </div>
    </>
  );
};

const DebugRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <p className="debug-row">
    <span>{label}</span>
    <span>{value ?? '-'}</span>
  </p>
);

const ResultRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <p className="result-row">
    <span>{label}</span>
    <span>{value ?? '-'}</span>
  </p>
);

const ResultCard = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="result-card">
    <h2>{title}</h2>
    <div className="result-card-body">{children}</div>
  </section>
);

const VerificationResults = ({ result }: { result: VerificationResult | null }) => {
  if (!result) {
    return null;
  }

  const face = result.face;
  const liveness = result.liveness;
  const light = result.light;
  const spoof = result.spoof;

  return (
    <>
      <div className="result-grid">
        <ResultCard title="Face">
          <ResultRow label="detector score" value={formatNumber(face?.detection.score)} />
          <ResultRow label="mesh score" value={formatNumber(face?.mesh.score)} />
          <ResultRow label="aligned" value={face?.faceFit.isAligned ? 'yes' : 'no'} />
          <ResultRow label="large enough" value={face?.faceFit.isFaceLargeEnough ? 'yes' : 'no'} />
          <ResultRow label="stable" value={face?.stability.isStable ? 'yes' : 'no'} />
          <ResultRow label="stable ms" value={formatMs(face?.stability.stableMs)} />
        </ResultCard>

        <ResultCard title="Liveness">
          <ResultRow label="sequence" value={liveness?.sequence.join(', ') || '-'} />
          <ResultRow label="completed" value={liveness?.completedChallenges.join(', ') || '-'} />
          <ResultRow label="duration" value={formatMs(liveness?.telemetry.sessionDurationMs)} />
          <ResultRow label="max yaw" value={formatNumber(liveness?.telemetry.maxAbsYaw)} />
          <ResultRow label="max pitch" value={formatNumber(liveness?.telemetry.maxAbsPitch)} />
          <ResultRow label="max mouth" value={formatNumber(liveness?.telemetry.maxMouthRatio)} />
        </ResultCard>

        <ResultCard title="Light">
          <ResultRow label="status" value={light?.status ?? '-'} />
          <ResultRow label="passed" value={light ? (light.passed ? 'yes' : 'no') : '-'} />
          <ResultRow label="matched steps" value={light ? `${light.matchedSteps}/${light.sequence.length}` : '-'} />
          <ResultRow label="score" value={formatPercent(light?.sequenceAverageScore)} />
          <ResultRow label="correlation" value={formatNumber(light?.sequenceCorrelation)} />
          <ResultRow label="response" value={formatNumber(light?.sequenceResponseMagnitude)} />
        </ResultCard>

        <ResultCard title="Spoof">
          <ResultRow label="samples" value={spoof ? `${spoof.sampleCount} ok / ${spoof.skippedSampleCount} skipped` : '-'} />
          <ResultRow label="models used" value={spoof?.modelsUsed ?? '-'} />
          <ResultRow label="real frame ratio" value={formatPercent(spoof?.realFrameRatio)} />
          <ResultRow label="median real" value={formatNumber(spoof?.medianRealScore)} />
          <ResultRow label="median paper" value={formatNumber(spoof?.medianPaperScore)} />
          <ResultRow label="median screen" value={formatNumber(spoof?.medianScreenScore)} />
        </ResultCard>
      </div>

      {liveness?.challengeRecords.length ? (
        <section className="result-section">
          <h2>Liveness challenge records</h2>
          <div className="step-list">
            {liveness.challengeRecords.map((record) => (
              <article className="step-card" key={`${record.challenge}-${record.startedAt}`}>
                <p className="step-title">{record.challenge}</p>
                <p>yaw {formatNumber(record.final.yaw)}</p>
                <p>pitch {formatNumber(record.final.pitch)}</p>
                <p>mouth {formatNumber(record.final.mouthRatio)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {light?.steps.length ? (
        <section className="result-section">
          <h2>Light sequence</h2>
          <div className="step-list">
            {light.steps.map((step) => (
              <article className="step-card" key={`${step.color.id}-${step.index}`}>
                <p className="step-title">
                  <span
                    aria-hidden="true"
                    className="color-dot"
                    style={{ backgroundColor: step.color.css }}
                  />
                  {step.index + 1}. {step.color.label}
                </p>
                <p>{step.passed ? 'passed' : 'failed'}</p>
                <p>score {formatPercent(step.matchScore)}</p>
                <p>response {formatNumber(step.responseMagnitude)}</p>
                <p>pixels {step.sampledPixelsBefore}/{step.sampledPixelsAfter}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <details className="raw-result">
        <summary>Raw result JSON</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </>
  );
};

const LiveDebugPanel = ({
  debugEnabled,
  snapshot,
}: {
  debugEnabled: boolean;
  snapshot: WebVerificationSnapshot | null;
}) => {
  if (!debugEnabled) {
    return null;
  }

  const diagnostics = snapshot?.diagnostics ?? null;
  const liveness = snapshot?.liveness ?? null;
  const light = snapshot?.light ?? diagnostics?.light ?? null;

  return (
    <aside aria-live="polite" className="debug-panel">
      <div className="debug-title">
        <p className="debug-section-title">Live diagnostics</p>
        <p className="status-subtitle">debug on</p>
      </div>

      <div className="debug-grid">
        <div className="debug-section">
          <p className="debug-section-title">Frame</p>
          <DebugRow label="stage" value={snapshot?.stage ?? '-'} />
          <DebugRow label="frame" value={diagnostics?.frameIndex ?? '-'} />
          <DebugRow label="frame ms" value={formatMs(diagnostics?.timings.frameMs)} />
        </div>

        <div className="debug-section">
          <p className="debug-section-title">Liveness</p>
          <DebugRow label="phase" value={liveness?.phase ?? '-'} />
          <DebugRow label="challenge" value={liveness?.currentChallenge ?? '-'} />
          <DebugRow label="progress" value={formatPercent(liveness?.progress)} />
        </div>

        <div className="debug-section">
          <p className="debug-section-title">Light</p>
          <DebugRow label="phase" value={light?.phase ?? '-'} />
          <DebugRow label="color" value={light?.activeColor?.label ?? '-'} />
          <DebugRow label="score" value={formatPercent(light?.sequenceAverageScore)} />
        </div>

        <div className="debug-section">
          <p className="debug-section-title">Anti-spoof</p>
          <DebugRow label="latest" value={snapshot?.spoof ? `${snapshot.spoof.label} real=${formatNumber(snapshot.spoof.realScore)}` : '-'} />
          <DebugRow label="median real" value={formatNumber(snapshot?.spoofSummary?.medianRealScore)} />
          <DebugRow label="samples" value={snapshot?.spoofSummary ? `${snapshot.spoofSummary.sampleCount} ok` : '-'} />
        </div>
      </div>
    </aside>
  );
};

export const App = function App() {
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [startOnOpen, setStartOnOpen] = useState(false);
  const [activePage, setActivePage] = useState<'home' | 'results'>('home');
  const [snapshot, setSnapshot] = useState<WebVerificationSnapshot | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [videoFrameSize, setVideoFrameSize] = useState<FrameSize | null>(null);
  const [videoElementReady, setVideoElementReady] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const diagnosticsOverlayRef = useRef<HTMLDivElement>(null);
  const diagnosticsOverlayCleanupRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<VerificationSession | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const cleanupDiagnosticsOverlay = useCallback(() => {
    diagnosticsOverlayCleanupRef.current?.();
    diagnosticsOverlayCleanupRef.current = null;
  }, []);

  const mountActiveDiagnosticsOverlay = useCallback(() => {
    cleanupDiagnosticsOverlay();

    if (!debugEnabled || !sessionRef.current || !diagnosticsOverlayRef.current) {
      return;
    }

    diagnosticsOverlayCleanupRef.current = mountDiagnosticsOverlay(
      sessionRef.current,
      diagnosticsOverlayRef.current,
      {
        fit: 'cover',
        mirrored: true,
      },
    );
  }, [cleanupDiagnosticsOverlay, debugEnabled]);

  const attachActiveSession = useCallback(() => {
    sessionRef.current = verifier.activeSession;
    mountActiveDiagnosticsOverlay();
  }, [mountActiveDiagnosticsOverlay]);

  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
    setVideoElementReady(Boolean(video));
  }, []);

  const updateVideoFrameSize = () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      return;
    }

    setVideoFrameSize({
      height: video.videoHeight,
      width: video.videoWidth,
    });
  };

  const disposeSession = () => {
    cleanupDiagnosticsOverlay();
    sessionRef.current = null;
    verifier.cancel();
    setSnapshot(null);
    setVideoFrameSize(null);
  };

  const startVerificationSession = async () => {
    setSessionError(null);

    try {
      if (!videoRef.current) {
        throw new Error('Camera video element is not ready.');
      }

      const verification = verifier.start({
        checks: {
          face: true,
          light: true,
          liveness: true,
          spoof: true,
        } satisfies CheckConfig,
        debug: debugEnabled,
        light: {
          opencvAssetBaseUrl: OPENCV_ASSET_BASE_URL,
          sequence: createLightSequence({ length: 4 }),
        },
        liveness: {
          challenges: createLivenessSequence({ length: 3 }),
        },
        models: {
          manifestUrl: MODEL_MANIFEST_URL,
        },
        onSnapshot: setSnapshot,
        video: videoRef.current,
      });
      attachActiveSession();
      const nextResult = await verification;

      setResult(nextResult);
    } catch (error) {
      setSessionError(getErrorMessage(error));
    }
  };

  const restartVerificationSession = () => {
    disposeSession();
    void startVerificationSession();
  };

  const startFreshVerification = () => {
    disposeSession();
    setActivePage('home');
    setResult(null);
    setSessionError(null);
    setStartOnOpen(true);
    setVerificationOpen(true);
  };

  const handleVerificationOpenChange = (nextOpen: boolean) => {
    setVerificationOpen(nextOpen);
    if (!nextOpen) {
      setStartOnOpen(false);
      disposeSession();
    }
  };

  useEffect(() => {
    return () => {
      cleanupDiagnosticsOverlay();
      void verifier.dispose();
    };
  }, [cleanupDiagnosticsOverlay]);

  useEffect(() => {
    mountActiveDiagnosticsOverlay();

    return cleanupDiagnosticsOverlay;
  }, [cleanupDiagnosticsOverlay, mountActiveDiagnosticsOverlay, verificationOpen]);

  useEffect(() => {
    if (!verificationOpen || !startOnOpen || !videoElementReady) {
      return;
    }

    setStartOnOpen(false);
    void startVerificationSession();
  }, [verificationOpen, startOnOpen, videoElementReady]);

  const canRetry = snapshot?.stage === 'failed' || snapshot?.stage === 'cancelled' || Boolean(sessionError);
  const isPreparing =
    startOnOpen ||
    snapshot?.stage === 'booting' ||
    snapshot?.stage === 'requestingCamera' ||
    snapshot?.stage === 'loadingModels';
  const isScanning = Boolean(
    snapshot &&
      (
        snapshot.stage === 'loadingModels' ||
        snapshot.stage === 'acquiringFace' ||
        snapshot.stage === 'stabilizingFace' ||
        snapshot.stage === 'faceReady' ||
        snapshot.stage === 'livenessChallenge' ||
        snapshot.stage === 'lightChallenge' ||
        snapshot.stage === 'completed'
      ),
  );
  const shouldShowGuide = verificationOpen && (isPreparing || isScanning);
  const overlayPhase = getOverlayPhase(snapshot);
  const challengeDirection = snapshot?.liveness?.direction ?? 'none';
  const instruction =
    snapshot?.light?.instruction ||
    snapshot?.liveness?.instruction ||
    snapshot?.instruction ||
    'Preparing verification...';
  const currentError = sessionError ?? snapshot?.error ?? null;
  const resultsAvailable = Boolean(result);

  return (
    <main className="page">
      <div className="top-actions">
        <button
          className="btn-primary btn-inline"
          disabled={!resultsAvailable}
          onClick={() => {
            setVerificationOpen(false);
            setActivePage('results');
          }}
          type="button"
        >
          Results
        </button>
      </div>

      {activePage === 'home' ? (
        <section className="home">
          <button className="btn-primary btn-inline" onClick={startFreshVerification} type="button">
            Start verification
          </button>
          <label className="toggle-row">
            <input
              checked={debugEnabled}
              onChange={(event) => setDebugEnabled(event.target.checked)}
              type="checkbox"
            />
            Debug diagnostics
          </label>
        </section>
      ) : (
        <section className="results">
          <h1>Verification results</h1>
          <p className="results-copy">
            Local runtime outputs from face, liveness, light, and spoof modules.
          </p>
          <VerificationResults result={result} />
          <div>
            <button className="btn-primary btn-inline" onClick={startFreshVerification} type="button">
              Restart verification
            </button>
          </div>
        </section>
      )}

      {verificationOpen ? (
        <>
          <div className="dialog-overlay" onClick={() => handleVerificationOpenChange(false)} />
          <section className="dialog-content" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button className="dialog-close" onClick={() => handleVerificationOpenChange(false)} type="button">
              <X aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>

            <VerificationCamera
              centerContent={
                isPreparing ? (
                  <div>
                    <Camera aria-hidden="true" />
                    <p>Initializing...</p>
                  </div>
                ) : null
              }
              direction={challengeDirection}
              overlay={{
                phase: overlayPhase,
                showDarkOverlay: shouldShowGuide && !debugEnabled,
                showFaceGuide: shouldShowGuide,
              }}
              statusContent={
                <>
                  <p className="status-title" id="dialog-title">{instruction}</p>
                  {snapshot?.liveness ? (
                    <p className="status-subtitle">
                      Step {snapshot.liveness.currentStep || 1}/{snapshot.liveness.totalSteps}
                      {debugEnabled ? ` ${Math.round(snapshot.liveness.progress * 100)}%` : null}
                    </p>
                  ) : null}
                  {snapshot?.light ? (
                    <p className="status-subtitle">
                      Light {Math.min(snapshot.light.colorIndex + 1, snapshot.light.totalSteps)}/{snapshot.light.totalSteps}
                      {debugEnabled ? ` ${Math.round(snapshot.light.progress * 100)}%` : null}
                    </p>
                  ) : null}
                </>
              }
              videoFrameSize={videoFrameSize}
              videoChildren={
                <>
                  <video
                    autoPlay
                    muted
                    onLoadedMetadata={updateVideoFrameSize}
                    playsInline
                    ref={setVideoElement}
                  />
                  <div aria-hidden="true" className="diagnostics-overlay" ref={diagnosticsOverlayRef} />
                </>
              }
            />

            <LiveDebugPanel debugEnabled={debugEnabled} snapshot={snapshot} />

            {canRetry ? (
              <footer className="footer-retry">
                {currentError ? <p className="error-copy">{currentError}</p> : null}
                <button className="btn-primary btn-block" onClick={restartVerificationSession} type="button">
                  Retry
                </button>
              </footer>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  );
};
