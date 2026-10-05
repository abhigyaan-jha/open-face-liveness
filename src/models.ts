import type { RuntimeVerificationCheck } from './config.js';
import type { FaceDetectionResult, FaceMeshResult, SpoofFrameResult } from './result.js';

export type ModelCapability = 'detector' | 'mesh' | 'blendshape' | 'spoof';

export type ModelOverrides = Partial<Record<ModelCapability, string>> & {
  [modelId: string]: string | undefined;
};

export interface ModelSpec {
  capability: ModelCapability;
  /**
   * SHA-256 hex digest of every file the model loads, keyed by path relative to `url`.
   * Loading fails if a file is missing from this list or its bytes do not match.
   */
  files: Record<string, string>;
  format: 'tfjs';
  id: string;
  required: boolean;
  url: string;
  version?: string;
}

export interface ModelManifest {
  models: ModelSpec[];
  version: number;
}

export interface ResolvedModelSpec extends ModelSpec {
  /**
   * Where to fetch each file in `files`, when it differs from its path relative to `url`,
   * e.g. the hashed URLs a bundler gives the package's own model files.
   */
  fileUrls?: Record<string, string>;
  inputs?: string[];
  outputs?: string[];
}

/**
 * Where models and TensorFlow.js wasm files load from. Leave everything unset to load the
 * files the app's bundler (Vite, webpack 5, Rspack, Parcel, Next.js) emits from this package.
 */
export interface VerificationModelsOptions {
  /**
   * Base URL of a copy of the package's `models/` and `vendor/` directories, e.g. one made by
   * `npx open-face-liveness init public/open-face-liveness`, or a CDN mirror of the package.
   */
  assetBaseUrl?: string;
  /** Base URL that model URLs in the manifest resolve against. Defaults to the manifest's directory. */
  baseUrl?: string;
  /** URL of a custom model manifest. Defaults to the manifest built into the package. */
  manifestUrl?: string;
  tfjsWasmBaseUrl?: string;
  overrides?: ModelOverrides;
}

export interface DetectorRawResult {
  boxes: Float32Array;
  runMs: number;
  scores: Float32Array;
}

export interface MeshRawInput {
  image: Float32Array;
}

export interface MeshRawResult {
  landmarks: Float32Array;
  runMs: number;
  score: number;
}

export interface BlendshapeRawResult {
  runMs: number;
  scores: Float32Array;
}

export interface SpoofRawResult {
  logits: Float32Array;
  runMs: number;
}

export interface DetectorAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  dispose(): Promise<void>;
  run(input: Float32Array): Promise<DetectorRawResult>;
}

export interface MeshAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  dispose(): Promise<void>;
  run(input: MeshRawInput): Promise<MeshRawResult | null>;
}

export interface BlendshapeAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  dispose(): Promise<void>;
  run(input: Float32Array): Promise<BlendshapeRawResult | null>;
}

export interface SpoofAdapter {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  readonly model: ResolvedModelSpec;
  dispose(): Promise<void>;
  run(input: Float32Array): Promise<SpoofRawResult | null>;
}

export interface DetectorPipeline {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  destroy(): Promise<void>;
  detect(video: HTMLVideoElement): Promise<FaceDetectionResult | null>;
}

export interface MeshPipeline {
  readonly metadata: {
    inputs: string[];
    outputs: string[];
  };
  destroy(): Promise<void>;
  estimate(
    video: HTMLVideoElement,
    detection: FaceDetectionResult,
    options: { roiExpandFactor: number },
  ): Promise<FaceMeshResult | null>;
  reset?(): void;
}

export interface SpoofPipeline {
  readonly metadata: {
    models: Array<{
      id: string;
      inputs: string[];
      outputs: string[];
    }>;
  };
  analyze(video: HTMLVideoElement, detection: FaceDetectionResult): Promise<SpoofFrameResult | null>;
  destroy(): Promise<void>;
}

export interface ModelRuntimeBundle {
  destroy(): Promise<void>;
  detector: DetectorPipeline;
  manifest: ModelManifest;
  mesh: MeshPipeline;
  models: ResolvedModelSpec[];
  spoof: SpoofPipeline | null;
}

export interface LoadModelRuntimeOptions {
  checks?: readonly RuntimeVerificationCheck[];
  models: VerificationModelsOptions;
}

export {
  loadModelManifest,
  parseModelManifest,
  requireModelCapability,
  resolveModelSpecs,
} from './models/manifest.js';
export { loadModelRuntime } from './models/loader.js';
