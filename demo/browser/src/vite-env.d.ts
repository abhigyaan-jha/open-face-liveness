/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_OPEN_FACE_LIVENESS_MODEL_BASE_URL?: string;
  readonly VITE_OPEN_FACE_LIVENESS_MODEL_MANIFEST_URL?: string;
  readonly VITE_OPEN_FACE_LIVENESS_OPENCV_ASSET_BASE_URL?: string;
}
