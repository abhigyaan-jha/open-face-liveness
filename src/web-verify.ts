import {
  resolveConfig,
  type CheckConfig,
  type DebugOptions,
  type FaceFitOptions,
  type LightTestOptions,
  type LivenessChallengeOptions,
  type VerificationCheck,
  type WebVerifyConfig,
  type WebVerifyUserConfig,
} from './config.js';
import { createVerificationSession, type VerificationSession } from './flow/verification-session.js';
import { loadModelManifest } from './models/manifest.js';
import type { VerificationModelsOptions, ModelManifest } from './models.js';
import type { VerificationResult } from './result.js';
import type { WebVerificationSnapshot } from './flow/index.js';

export type WebVerifyCheckSelection = Partial<CheckConfig> | readonly VerificationCheck[];

export interface WebVerifyStartOptions {
  checks?: WebVerifyCheckSelection;
  debug?: boolean | DebugOptions;
  face?: Partial<FaceFitOptions>;
  light?: LightTestOptions;
  liveness?: LivenessChallengeOptions;
  models?: Partial<VerificationModelsOptions>;
  onSnapshot?: (snapshot: WebVerificationSnapshot) => void;
  video: HTMLVideoElement;
}

export interface WebVerifyClient {
  readonly activeSession: VerificationSession | null;
  readonly state: 'idle' | 'loading' | 'ready' | 'running' | 'error';
  cancel(): void;
  createSession(video: HTMLVideoElement): VerificationSession;
  dispose(): Promise<void>;
  getEnabledChecks(): VerificationCheck[];
  load(): Promise<ModelManifest>;
  reset(): void;
  start(options: WebVerifyStartOptions): Promise<VerificationResult>;
  verify(video: HTMLVideoElement): Promise<VerificationResult>;
}

const CHECK_ORDER: readonly VerificationCheck[] = ['face', 'liveness', 'light', 'spoof'];

const resolveCheckSelection = (
  checks: WebVerifyCheckSelection | undefined,
  fallback: CheckConfig,
): VerificationCheck[] => {
  if (Array.isArray(checks)) {
    return [...checks];
  }

  const selected = {
    ...fallback,
    ...checks,
  };

  return CHECK_ORDER.filter((check) => selected[check]);
};

export class WebVerify {
  activeSession: VerificationSession | null = null;
  config: WebVerifyConfig;
  manifest: ModelManifest | null = null;
  result: VerificationResult | null = null;
  state: 'idle' | 'loading' | 'ready' | 'running' | 'error' = 'idle';

  constructor(userConfig?: WebVerifyUserConfig) {
    this.config = resolveConfig(userConfig);
  }

  getEnabledChecks(): VerificationCheck[] {
    return resolveCheckSelection(undefined, this.config.checks);
  }

  async load(): Promise<ModelManifest> {
    this.state = 'loading';
    this.manifest = await loadModelManifest(this.config.models.manifestUrl);
    this.state = 'ready';
    return this.manifest;
  }

  createSession(video: HTMLVideoElement): VerificationSession {
    const session = createVerificationSession({
      checks: this.getEnabledChecks(),
      models: {
        manifestUrl: this.config.models.manifestUrl,
      },
      video,
    });
    this.activeSession = session;
    return session;
  }

  async verify(video: HTMLVideoElement): Promise<VerificationResult> {
    this.state = 'running';
    const session = this.createSession(video);

    try {
      this.result = await session.start();
      this.state = 'ready';
      return this.result;
    } catch (error) {
      this.state = 'error';
      throw error;
    }
  }

  async start(options: WebVerifyStartOptions): Promise<VerificationResult> {
    this.state = 'running';
    const session = createVerificationSession({
      checks: resolveCheckSelection(options.checks, this.config.checks),
      debug: options.debug,
      face: options.face,
      light: options.light,
      liveness: options.liveness,
      models: {
        manifestUrl: options.models?.manifestUrl ?? this.config.models.manifestUrl,
        overrides: options.models?.overrides,
      },
      video: options.video,
    });
    const unsubscribe = options.onSnapshot ? session.subscribe(options.onSnapshot) : null;
    this.activeSession = session;

    try {
      this.result = await session.start();
      this.state = 'ready';
      return this.result;
    } catch (error) {
      this.state = 'error';
      throw error;
    } finally {
      unsubscribe?.();
    }
  }

  cancel(): void {
    this.activeSession?.stop();
  }

  reset(): void {
    this.activeSession?.reset();
    this.result = null;
    this.state = this.manifest ? 'ready' : 'idle';
  }

  async dispose(): Promise<void> {
    this.activeSession?.destroy();
    this.activeSession = null;
    this.manifest = null;
    this.result = null;
    this.state = 'idle';
  }
}

export const createWebVerifyClient = (userConfig?: WebVerifyUserConfig): WebVerifyClient =>
  new WebVerify(userConfig);
