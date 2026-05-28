export interface DemoAssetEnv {
  readonly VITE_OPEN_FACE_LIVENESS_MODEL_BASE_URL?: string;
  readonly VITE_OPEN_FACE_LIVENESS_MODEL_MANIFEST_URL?: string;
  readonly VITE_OPEN_FACE_LIVENESS_OPENCV_ASSET_BASE_URL?: string;
}

export interface DemoAssetConfig {
  readonly modelBaseUrl: string;
  readonly modelManifestUrl: string;
  readonly opencvAssetBaseUrl: string;
}

const DEFAULT_MODEL_BASE_URL = '/models/';
const DEFAULT_OPENCV_ASSET_BASE_URL = '/vendor/opencv/';

const getEnvValue = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const ensureTrailingSlash = (url: string): string => url.endsWith('/') ? url : `${url}/`;

export const getDemoAssetConfig = (env: DemoAssetEnv): DemoAssetConfig => {
  const modelBaseUrl = ensureTrailingSlash(
    getEnvValue(env.VITE_OPEN_FACE_LIVENESS_MODEL_BASE_URL) ?? DEFAULT_MODEL_BASE_URL,
  );

  return {
    modelBaseUrl,
    modelManifestUrl:
      getEnvValue(env.VITE_OPEN_FACE_LIVENESS_MODEL_MANIFEST_URL) ?? `${modelBaseUrl}manifest.json`,
    opencvAssetBaseUrl: ensureTrailingSlash(
      getEnvValue(env.VITE_OPEN_FACE_LIVENESS_OPENCV_ASSET_BASE_URL) ?? DEFAULT_OPENCV_ASSET_BASE_URL,
    ),
  };
};

export const DEMO_ASSET_CONFIG = getDemoAssetConfig(import.meta.env);
