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
import { VerificationError } from './errors.js';
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

const isCheckSelectionList = (
  checks: WebVerifyCheckSelection | undefined,
): checks is readonly VerificationCheck[] => Array.isArray(checks);

const resolveCheckSelection = (
  checks: WebVerifyCheckSelection | undefined,
  fallback: CheckConfig,
): VerificationCheck[] => {
  if (isCheckSelectionList(checks)) {
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
  sequence: number;
}

class RuntimeLoadAbortedError extends Error {
  constructor(cause?: unknown) {
    super('Runtime load was superseded or cancelled.', { cause });
    this.name = 'RuntimeLoadAbortedError';
  }
}

const isRuntimeLoadAbortedError = (error: unknown): error is RuntimeLoadAbortedError =>
  error instanceof RuntimeLoadAbortedError;

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
  );
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
  private readonly runtimeLeases = new Map<ModelRuntimeBundle, number>();
  private runtimeLoad: PendingRuntimeLoad | null = null;
  private runtimeLoadSequence = 0;
  private readonly retiredRuntimes = new Set<ModelRuntimeBundle>();
  private startInFlight = false;
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
    const overrides = {
      ...(this.config.models.overrides ?? {}),
      ...(options.models?.overrides ?? {}),
    };
    const models: VerificationModelsOptions = {
      baseUrl: options.models?.baseUrl ?? this.config.models.baseUrl,
      manifestUrl: options.models?.manifestUrl ?? this.config.models.manifestUrl,
      onnxWasmBaseUrl: options.models?.onnxWasmBaseUrl ?? this.config.models.onnxWasmBaseUrl,
    };

    if (Object.keys(overrides).length > 0) {
      models.overrides = overrides;
    }

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

  private retainRuntime(runtime: ModelRuntimeBundle): void {
    this.runtimeLeases.set(runtime, (this.runtimeLeases.get(runtime) ?? 0) + 1);
  }

  private async releaseRuntime(runtime: ModelRuntimeBundle): Promise<void> {
    const leases = this.runtimeLeases.get(runtime);
    if (!leases) {
      return;
    }

    if (leases > 1) {
      this.runtimeLeases.set(runtime, leases - 1);
      return;
    }

    this.runtimeLeases.delete(runtime);
    await this.destroyUnleasedRetiredRuntimes();
  }

  private async destroyUnleasedRetiredRuntimes(): Promise<void> {
    const disposableRuntimes = [...this.retiredRuntimes]
      .filter((runtime) => !this.runtimeLeases.has(runtime));

    for (const runtime of disposableRuntimes) {
      this.retiredRuntimes.delete(runtime);
    }

    await Promise.all(disposableRuntimes.map((runtime) => runtime.destroy()));
  }

  private async retireRuntime(runtime: ModelRuntimeBundle): Promise<void> {
    if (this.runtime?.runtime === runtime) {
      return;
    }

    if (this.runtimeLeases.has(runtime)) {
      this.retiredRuntimes.add(runtime);
      return;
    }

    await runtime.destroy();
  }

  private async adoptRuntime(loaded: LoadedRuntime): Promise<void> {
    const previousRuntime = this.runtime?.runtime;

    this.runtime = loaded;
    this.manifest = loaded.manifest;

    if (previousRuntime && previousRuntime !== loaded.runtime) {
      await this.retireRuntime(previousRuntime);
    }
  }

  private createManagedSession(
    options: Parameters<typeof createVerificationSession>[0],
    runtime?: ModelRuntimeBundle,
  ): VerificationSession {
    const session = createVerificationSession(options);
    if (!runtime) {
      return session;
    }

    let released = false;
    this.retainRuntime(runtime);

    const release = async () => {
      if (released) {
        return;
      }

      released = true;
      await this.releaseRuntime(runtime);
    };

    return {
      async destroy() {
        try {
          await session.destroy();
        } finally {
          await release();
        }
      },
      getSnapshot: () => session.getSnapshot(),
      reset: () => session.reset(),
      async start() {
        try {
          return await session.start();
        } finally {
          await release();
        }
      },
      stop: () => session.stop(),
      subscribe: (listener) => session.subscribe(listener),
    };
  }

  private async ensureRuntimeLoaded(request: RuntimeRequest): Promise<LoadedRuntime> {
    if (this.runtime && this.isRuntimeCompatible(this.runtime, request)) {
      return this.runtime;
    }

    if (this.runtimeLoad && this.isRuntimeCompatible(this.runtimeLoad, request)) {
      return this.runtimeLoad.promise;
    }

    const sequence = this.runtimeLoadSequence + 1;
    this.runtimeLoadSequence = sequence;

    let pending!: PendingRuntimeLoad;
    const isPendingCurrent = () =>
      this.runtimeLoad === pending && this.runtimeLoadSequence === sequence;
    const abortLoadedRuntime = async (
      runtime: ModelRuntimeBundle,
      cause?: unknown,
    ): Promise<LoadedRuntime> => {
      await runtime.destroy();
      if (this.runtime && this.isRuntimeCompatible(this.runtime, request)) {
        return this.runtime;
      }

      throw new RuntimeLoadAbortedError(cause);
    };

    const promise = Promise.resolve().then(() => loadModelRuntime({
      checks: request.checks,
      models: request.models,
    })).then(async (runtime) => {
      const loaded = {
        capabilities: request.capabilities,
        key: request.key,
        manifest: {
          ...runtime.manifest,
          models: runtime.models,
        },
        runtime,
      };

      if (!isPendingCurrent()) {
        return abortLoadedRuntime(runtime);
      }

      if (this.runtime && this.isRuntimeCompatible(this.runtime, request)) {
        await runtime.destroy();
        return this.runtime;
      }

      await this.adoptRuntime(loaded);
      return loaded;
    }, (error) => {
      if (!isPendingCurrent()) {
        throw new RuntimeLoadAbortedError(error);
      }

      throw error;
    }).finally(() => {
      if (this.runtimeLoad === pending) {
        this.runtimeLoad = null;
      }
    });

    pending = {
      capabilities: request.capabilities,
      key: request.key,
      promise,
      sequence,
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
      if (!isRuntimeLoadAbortedError(error)) {
        this.state = 'error';
      }
      throw error;
    }
  }

  createSession(video: HTMLVideoElement): VerificationSession {
    const request = this.resolveRuntimeRequest();
    const runtime = this.runtime && this.isRuntimeCompatible(this.runtime, request)
      ? this.runtime.runtime
      : undefined;
    const session = this.createManagedSession({
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
    if (this.startInFlight) {
      throw new VerificationError(
        'session.invalid_state',
        'A verification session is already running.',
        { area: 'session', recoverable: true },
      );
    }

    this.startInFlight = true;
    let session: VerificationSession | null = null;
    let unsubscribe: (() => void) | null = null;

    try {
      const request = this.resolveRuntimeRequest(options);
      this.state = 'loading';
      let loaded: LoadedRuntime;
      try {
        loaded = await this.ensureRuntimeLoaded(request);
      } catch (error) {
        if (!isRuntimeLoadAbortedError(error)) {
          this.state = 'error';
        }
        throw error;
      }

      this.state = 'running';
      session = this.createManagedSession({
        checks: request.checks,
        debug: options.debug,
        face: options.face,
        light: options.light,
        liveness: options.liveness,
        models: request.models,
        runtime: loaded.runtime,
        video: options.video,
      }, loaded.runtime);
      unsubscribe = options.onSnapshot ? session.subscribe(options.onSnapshot) : null;
      this.activeSession = session;

      try {
        this.result = await session.start();
        this.state = 'ready';
        return this.result;
      } catch (error) {
        this.state = 'error';
        throw error;
      }
    } finally {
      try {
        unsubscribe?.();
        if (session) {
          try {
            await session.destroy();
          } finally {
            if (this.activeSession === session) {
              this.activeSession = null;
            }
          }
        }
      } finally {
        this.startInFlight = false;
      }
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
    this.runtimeLoadSequence += 1;
    this.runtimeLoad = null;
    await this.activeSession?.destroy();
    const currentRuntime = this.runtime?.runtime;
    const runtimes = new Set([
      ...(currentRuntime ? [currentRuntime] : []),
      ...this.retiredRuntimes,
    ]);
    this.activeSession = null;
    this.manifest = null;
    this.runtime = null;
    this.runtimeLeases.clear();
    this.retiredRuntimes.clear();
    this.result = null;
    this.state = 'idle';
    await Promise.all([...runtimes].map((runtime) => runtime.destroy()));
  }
}

export const createWebVerifyClient = (userConfig?: WebVerifyUserConfig): WebVerifyClient =>
  new WebVerify(userConfig);
