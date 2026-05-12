/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_WEB_VERIFY_MODEL_BASE_URL?: string;
  readonly VITE_WEB_VERIFY_MODEL_MANIFEST_URL?: string;
  readonly VITE_WEB_VERIFY_OPENCV_ASSET_BASE_URL?: string;
}
