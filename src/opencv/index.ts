export interface OpenCvAssetUrls {
  baseUrl: string;
  jsUrl: string;
  wasmUrl: string;
  workerUrl: string;
}

export const DEFAULT_OPENCV_ASSET_BASE_URL = '/vendor/opencv/';

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

export const resolveOpenCvAssetUrls = (
  baseUrl = DEFAULT_OPENCV_ASSET_BASE_URL,
): OpenCvAssetUrls => {
  const normalizedBaseUrl = ensureTrailingSlash(baseUrl);

  return {
    baseUrl: normalizedBaseUrl,
    jsUrl: `${normalizedBaseUrl}opencv.js`,
    wasmUrl: `${normalizedBaseUrl}opencv_js.wasm`,
    workerUrl: `${normalizedBaseUrl}opencv-worker.js`,
  };
};

