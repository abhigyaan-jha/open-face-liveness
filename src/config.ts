export type VerificationCheck = 'face' | 'liveness' | 'spoof' | 'light';

export interface CheckConfig {
  face: boolean;
  light: boolean;
  liveness: boolean;
  spoof: boolean;
}

export interface ModelConfig {
  basePath?: string;
  manifestUrl: string;
}

export interface DebugConfig {
  overlay: boolean;
  timings: boolean;
}

export interface WebVerifyConfig {
  checks: CheckConfig;
  debug: DebugConfig;
  models: ModelConfig;
}

export type WebVerifyUserConfig = Partial<{
  checks: Partial<CheckConfig>;
  debug: Partial<DebugConfig> | boolean;
  models: Partial<ModelConfig>;
}>;

export const defaultConfig: WebVerifyConfig = {
  checks: {
    face: true,
    light: false,
    liveness: true,
    spoof: false,
  },
  debug: {
    overlay: false,
    timings: false,
  },
  models: {
    basePath: '/models/',
    manifestUrl: '/models/manifest.json',
  },
};

export const resolveConfig = (userConfig: WebVerifyUserConfig = {}): WebVerifyConfig => ({
  checks: {
    ...defaultConfig.checks,
    ...userConfig.checks,
  },
  debug: typeof userConfig.debug === 'boolean'
    ? { overlay: userConfig.debug, timings: userConfig.debug }
    : {
        ...defaultConfig.debug,
        ...userConfig.debug,
      },
  models: {
    ...defaultConfig.models,
    ...userConfig.models,
  },
});

