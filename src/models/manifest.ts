import type { ModelCapability, ModelManifest, ModelSpec, ResolvedModelSpec } from '../types.js';

const MODEL_CAPABILITIES: readonly ModelCapability[] = ['detector', 'mesh', 'liveness', 'spoof', 'light'];

const isModelCapability = (value: unknown): value is ModelCapability =>
  typeof value === 'string' && MODEL_CAPABILITIES.includes(value as ModelCapability);

const toModelSpec = (entry: unknown): ModelSpec => {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Invalid model manifest entry.');
  }

  const record = entry as Record<string, unknown>;
  if (!isModelCapability(record.capability)) {
    throw new Error(`Unsupported model capability: ${String(record.capability)}`);
  }

  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new Error('Model manifest entry is missing an id.');
  }

  if (typeof record.url !== 'string' || record.url.length === 0) {
    throw new Error(`Model '${record.id}' is missing a url.`);
  }

  return {
    capability: record.capability,
    format: 'onnx',
    id: record.id,
    required: record.required !== false,
    url: record.url,
    version: typeof record.version === 'string' ? record.version : undefined,
  };
};

export const parseModelManifest = (raw: unknown): ModelManifest => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Model manifest must be an object.');
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.models)) {
    throw new Error("Model manifest must include a 'models' array.");
  }

  return {
    models: record.models.map(toModelSpec),
    version: typeof record.version === 'number' ? record.version : 1,
  };
};

export const loadModelManifest = async (manifestUrl: string): Promise<ModelManifest> => {
  const response = await fetch(manifestUrl, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load model manifest: ${response.status} ${response.statusText}`);
  }

  return parseModelManifest(await response.json());
};

export const resolveModelSpecs = (
  manifest: ModelManifest,
  overrides?: Partial<Record<ModelCapability, string>>,
): ResolvedModelSpec[] =>
  manifest.models.map((model) => ({
    ...model,
    url: overrides?.[model.capability] ?? model.url,
  }));

export const requireModelCapability = (
  models: readonly ResolvedModelSpec[],
  capability: ModelCapability,
): ResolvedModelSpec => {
  const model = models.find((entry) => entry.capability === capability);
  if (!model) {
    throw new Error(`Required model '${capability}' is missing from the manifest.`);
  }

  return model;
};
