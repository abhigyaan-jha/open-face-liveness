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
import { loadModelRuntime } from './models/loader.js';
import type {
  ModelCapability,
  VerificationModelsOptions,
  ModelManifest,
  ModelRuntimeBundle,
} from './models.js';
import type { VerificationResult } from './result.js';
import type { WebVerificationSnapshot } from './flow/index.js';

export type WebVerifyCheckSelection = Partial<CheckConfig> | readonly VerificationCheck[];

export interface WebVerifyLoadOptions {
  checks?: WebVerifyCheckSelection;
  models?: Partial<VerificationModelsOptions>;
}

export interface WebVerifyStartOptions extends WebVerifyLoadOptions {
  debug?: boolean | DebugOptions;
  face?: Partial<FaceFitOptions>;
  light?: LightTestOptions;
  liveness?: LivenessChallengeOptions;
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
  load(options?: WebVerifyLoadOptions): Promise<ModelManifest>;
  reset(): void;
  start(options: WebVerifyStartOptions): Promise<VerificationResult>;
  verify(video: HTMLVideoElement): Promise<VerificationResult>;
}

const CHECK_ORDER: readonly VerificationCheck[] = ['face', 'liveness', 'light', 'spoof'];
const BASE_RUNTIME_CAPABILITIES: readonly ModelCapability[] = ['detector', 'mesh'];

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

interface RuntimeRequest {
  checks: VerificationCheck[];
  capabilities: ModelCapability[];
  key: string;
  models: VerificationModelsOptions;
}

interface LoadedRuntime {
  capabilities: ModelCapability[];
  key: string;
  manifest: ModelManifest;
  runtime: ModelRuntimeBundle;
}

interface PendingRuntimeLoad {
  capabilities: ModelCapability[];
  key: string;
  promise: Promise<LoadedRuntime>;
}

const resolveRuntimeCapabilities = (checks: readonly VerificationCheck[]): ModelCapability[] =>
  checks.includes('spoof')
    ? [...BASE_RUNTIME_CAPABILITIES, 'spoof']
    : [...BASE_RUNTIME_CAPABILITIES];

const hasRuntimeCapabilities = (
  loaded: readonly ModelCapability[],
  requested: readonly ModelCapability[],
): boolean => requested.every((capability) => loaded.includes(capability));

const normalizeOverrides = (
  overrides: VerificationModelsOptions['overrides'],
): VerificationModelsOptions['overrides'] => {
  if (!overrides) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(overrides).sort(([left], [right]) => left.localeCompare(right)),
  ) as VerificationModelsOptions['overrides'];
};

const createRuntimeKey = (models: VerificationModelsOptions): string =>
  JSON.stringify({
    baseUrl: models.baseUrl,
    manifestUrl: models.manifestUrl,
    onnxWasmBaseUrl: models.onnxWasmBaseUrl,
    overrides: normalizeOverrides(models.overrides),
  });

export class WebVerify {
  activeSession: VerificationSession | null = null;
  config: WebVerifyConfig;
  manifest: ModelManifest | null = null;
  private runtime: LoadedRuntime | null = null;
  private runtimeLoad: PendingRuntimeLoad | null = null;
  result: VerificationResult | null = null;
  state: 'idle' | 'loading' | 'ready' | 'running' | 'error' = 'idle';

  constructor(userConfig?: WebVerifyUserConfig) {
    this.config = resolveConfig(userConfig);
  }

  getEnabledChecks(): VerificationCheck[] {
    return resolveCheckSelection(undefined, this.config.checks);
  }

  private resolveRuntimeRequest(options: WebVerifyLoadOptions = {}): RuntimeRequest {
    const checks = resolveCheckSelection(options.checks, this.config.checks);
    const models = {
      baseUrl: options.models?.baseUrl ?? this.config.models.baseUrl,
      manifestUrl: options.models?.manifestUrl ?? this.config.models.manifestUrl,
      onnxWasmBaseUrl: options.models?.onnxWasmBaseUrl ?? this.config.models.onnxWasmBaseUrl,
      overrides: options.models?.overrides,
    };

    return {
      capabilities: resolveRuntimeCapabilities(checks),
      checks,
      key: createRuntimeKey(models),
      models,
    };
  }

  private isRuntimeCompatible(
    runtime: Pick<LoadedRuntime, 'capabilities' | 'key'>,
    request: RuntimeRequest,
  ): boolean {
    return runtime.key === request.key && hasRuntimeCapabilities(runtime.capabilities, request.capabilities);
  }

  private async ensureRuntimeLoaded(request: RuntimeRequest): Promise<LoadedRuntime> {
    if (this.runtime && this.isRuntimeCompatible(this.runtime, request)) {
      return this.runtime;
    }

    if (this.runtimeLoad && this.isRuntimeCompatible(this.runtimeLoad, request)) {
      return this.runtimeLoad.promise;
    }

    const pending: PendingRuntimeLoad = {
      capabilities: request.capabilities,
      key: request.key,
      promise: loadModelRuntime({
        checks: request.checks,
        models: request.models,
      }).then((runtime) => {
        const loaded = {
          capabilities: request.capabilities,
          key: request.key,
          manifest: {
            ...runtime.manifest,
            models: runtime.models,
          },
          runtime,
        };

        if (
          !this.runtime ||
          this.runtime.key !== loaded.key ||
          hasRuntimeCapabilities(loaded.capabilities, this.runtime.capabilities)
        ) {
          this.runtime = loaded;
          this.manifest = loaded.manifest;
        }

        return loaded;
      }).finally(() => {
        if (this.runtimeLoad === pending) {
          this.runtimeLoad = null;
        }
      }),
    };

    this.runtimeLoad = pending;
    return pending.promise;
  }

  async load(options?: WebVerifyLoadOptions): Promise<ModelManifest> {
    this.state = 'loading';
    try {
      const loaded = await this.ensureRuntimeLoaded(this.resolveRuntimeRequest(options));
      this.state = 'ready';
      return loaded.manifest;
    } catch (error) {
      this.state = 'error';
      throw error;
    }
  }

  createSession(video: HTMLVideoElement): VerificationSession {
    const request = this.resolveRuntimeRequest();
    const runtime = this.runtime && this.isRuntimeCompatible(this.runtime, request)
      ? this.runtime.runtime
      : undefined;
    const session = createVerificationSession({
      checks: this.getEnabledChecks(),
      runtime,
      models: {
        baseUrl: this.config.models.baseUrl,
        manifestUrl: this.config.models.manifestUrl,
        onnxWasmBaseUrl: this.config.models.onnxWasmBaseUrl,
        overrides: this.config.models.overrides,
      },
      video,
    });
    this.activeSession = session;
    return session;
  }

  async verify(video: HTMLVideoElement): Promise<VerificationResult> {
    return this.start({ video });
  }

  async start(options: WebVerifyStartOptions): Promise<VerificationResult> {
    const request = this.resolveRuntimeRequest(options);
    this.state = 'loading';
    let loaded: LoadedRuntime;
    try {
      loaded = await this.ensureRuntimeLoaded(request);
    } catch (error) {
      this.state = 'error';
      throw error;
    }

    this.state = 'running';
    const session = createVerificationSession({
      checks: request.checks,
      debug: options.debug,
      face: options.face,
      light: options.light,
      liveness: options.liveness,
      models: request.models,
      runtime: loaded.runtime,
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
    this.state = this.runtime ? 'ready' : 'idle';
  }

  async dispose(): Promise<void> {
    await this.activeSession?.destroy();
    await this.runtime?.runtime.destroy();
    this.activeSession = null;
    this.manifest = null;
    this.runtime = null;
    this.runtimeLoad = null;
    this.result = null;
    this.state = 'idle';
  }
}

export const createWebVerifyClient = (userConfig?: WebVerifyUserConfig): WebVerifyClient =>
  new WebVerify(userConfig);
