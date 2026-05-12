import type { RuntimeVerificationCheck } from './config.js';
import type { FaceDetectionResult, FaceMeshResult, Rect, SpoofFrameResult } from './result.js';

export type ModelCapability = 'detector' | 'mesh' | 'spoof';

export interface ModelSpec {
  capability: ModelCapability;
  format: 'onnx';
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
  inputs?: string[];
  outputs?: string[];
}

export interface VerificationModelsOptions {
  baseUrl?: string;
  manifestUrl: string;
  onnxWasmBaseUrl?: string;
  overrides?: Partial<Record<ModelCapability, string>>;
}

export interface DetectorRawResult {
  boxes: Float32Array;
  runMs: number;
  scores: Float32Array;
}

export interface MeshRawInput {
  crop: Rect;
  image: Float32Array;
}

export interface MeshRawResult {
  landmarks: Float32Array;
  runMs: number;
  score: number;
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
