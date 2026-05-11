import { resolveConfig, type VerificationCheck, type WebVerifyConfig, type WebVerifyUserConfig } from './config.js';
import { emptyResult, type VerificationResult } from './result.js';
import { loadModelManifest, type ModelManifest } from './models.js';

export class WebVerify {
  config: WebVerifyConfig;
  manifest: ModelManifest | null = null;
  result: VerificationResult;
  state: 'idle' | 'loading' | 'ready' | 'running' | 'error' = 'idle';

  constructor(userConfig?: WebVerifyUserConfig) {
    this.config = resolveConfig(userConfig);
    this.result = emptyResult(this.getEnabledChecks());
  }

  getEnabledChecks(): VerificationCheck[] {
    return Object.entries(this.config.checks)
      .filter(([, enabled]) => enabled)
      .map(([check]) => check as VerificationCheck);
  }

  async load(): Promise<void> {
    this.state = 'loading';
    this.manifest = await loadModelManifest(this.config.models.manifestUrl);
    this.state = 'ready';
  }

  async verify(_input: HTMLVideoElement | HTMLCanvasElement | ImageData): Promise<VerificationResult> {
    this.state = 'running';
    this.result = {
      ...emptyResult(this.getEnabledChecks()),
      completedAt: Date.now(),
    };
    this.state = 'ready';
    return this.result;
  }

  reset(): void {
    this.result = emptyResult(this.getEnabledChecks());
    this.state = this.manifest ? 'ready' : 'idle';
  }

  async dispose(): Promise<void> {
    this.manifest = null;
    this.reset();
  }
}

