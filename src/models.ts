export type ModelCapability =
  | 'face-detector'
  | 'face-mesh'
  | 'spoof'
  | 'light'
  | 'liveness';

export interface ModelSpec {
  capability: ModelCapability;
  format: 'onnx' | 'opencv';
  id: string;
  required?: boolean;
  url: string;
  version?: string;
}

export interface ModelManifest {
  models: readonly ModelSpec[];
  version: number;
}

export const parseModelManifest = (raw: unknown): ModelManifest => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Model manifest must be an object.');
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.models)) {
    throw new Error("Model manifest must include a 'models' array.");
  }

  return {
    models: record.models as ModelSpec[],
    version: typeof record.version === 'number' ? record.version : 1,
  };
};

export const loadModelManifest = async (manifestUrl: string): Promise<ModelManifest> => {
  const response = await fetch(manifestUrl, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Unable to load model manifest: ${response.status} ${response.statusText}`);
  }

  return parseModelManifest(await response.json());
};

