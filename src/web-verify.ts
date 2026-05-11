import { resolveConfig, type WebVerifyConfig, type WebVerifyUserConfig } from './config.js';
import { createVerificationSession, type VerificationSession } from './flow/verification-session.js';
import { loadModelManifest } from './models/manifest.js';
import type { ModelManifest, VerificationCheck, VerificationResult } from './types.js';

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
    return Object.entries(this.config.checks)
      .filter(([, enabled]) => enabled)
      .map(([check]) => check as VerificationCheck);
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

