import type {
  ModelCapability,
  ModelManifest,
  ModelOverrides,
  ModelSpec,
  ResolvedModelSpec,
} from '../models.js';
import { VerificationError } from '../errors.js';

const MODEL_CAPABILITIES: readonly ModelCapability[] = ['detector', 'mesh', 'blendshape', 'spoof'];
const URL_RESOLUTION_ORIGIN = 'https://open-face-liveness.local';

interface ResolveModelSpecOptions {
  baseUrl?: string;
  manifestUrl?: string;
}

const isModelCapability = (value: unknown): value is ModelCapability =>
  typeof value === 'string' && MODEL_CAPABILITIES.includes(value as ModelCapability);

const toModelSpec = (entry: unknown): ModelSpec => {
  if (!entry || typeof entry !== 'object') {
    throw new VerificationError('models.manifest_invalid', 'Invalid model manifest entry.', {
      area: 'models',
    });
  }

  const record = entry as Record<string, unknown>;
  if (!isModelCapability(record.capability)) {
    throw new VerificationError(
      'models.manifest_invalid',
      `Unsupported model capability: ${String(record.capability)}`,
      { area: 'models' },
    );
  }

  if (typeof record.id !== 'string' || record.id.length === 0) {
    throw new VerificationError('models.manifest_invalid', 'Model manifest entry is missing an id.', {
      area: 'models',
    });
  }

  if (typeof record.url !== 'string' || record.url.length === 0) {
    throw new VerificationError('models.manifest_invalid', `Model '${record.id}' is missing a url.`, {
      area: 'models',
    });
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
    throw new VerificationError('models.manifest_invalid', 'Model manifest must be an object.', {
      area: 'models',
    });
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.models)) {
    throw new VerificationError(
      'models.manifest_invalid',
      "Model manifest must include a 'models' array.",
      { area: 'models' },
    );
  }

  return {
    models: record.models.map(toModelSpec),
    version: typeof record.version === 'number' ? record.version : 1,
  };
};

export const loadModelManifest = async (manifestUrl: string): Promise<ModelManifest> => {
  let response: Response;
  try {
    response = await fetch(manifestUrl, {
      headers: {
        accept: 'application/json',
      },
    });
  } catch (error) {
    throw new VerificationError(
      'models.manifest_load_failed',
      `Unable to load model manifest: ${manifestUrl}`,
      { area: 'models', cause: error },
    );
  }

  if (!response.ok) {
    throw new VerificationError(
      'models.manifest_load_failed',
      `Unable to load model manifest: ${response.status} ${response.statusText}`,
      { area: 'models' },
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    throw new VerificationError(
      'models.manifest_invalid',
      `Unable to parse model manifest: ${manifestUrl}`,
      { area: 'models', cause: error },
    );
  }

  return parseModelManifest(raw);
};

const hasUrlScheme = (url: string): boolean => /^[a-z][a-z\d+\-.]*:/i.test(url);

const isAbsoluteRuntimeUrl = (url: string): boolean => hasUrlScheme(url) || url.startsWith('/');

const ensureTrailingSlash = (url: string): string => url.endsWith('/') ? url : `${url}/`;

const resolveUrl = (url: string, baseUrl?: string): string => {
  if (!baseUrl || isAbsoluteRuntimeUrl(url)) {
    return url;
  }

  const normalizedBaseUrl = ensureTrailingSlash(baseUrl);
  if (hasUrlScheme(normalizedBaseUrl)) {
    return new URL(url, normalizedBaseUrl).toString();
  }

  const originRelativeBaseUrl = normalizedBaseUrl.startsWith('/')
    ? normalizedBaseUrl
    : `/${normalizedBaseUrl}`;
  const resolved = new URL(url, `${URL_RESOLUTION_ORIGIN}${originRelativeBaseUrl}`);

  return normalizedBaseUrl.startsWith('/')
    ? `${resolved.pathname}${resolved.search}${resolved.hash}`
    : `${resolved.pathname.slice(1)}${resolved.search}${resolved.hash}`;
};

const getManifestBaseUrl = (manifestUrl?: string): string | undefined => {
  if (!manifestUrl) {
    return undefined;
  }

  if (hasUrlScheme(manifestUrl)) {
    return new URL('.', manifestUrl).toString();
  }

  const originRelativeManifestUrl = manifestUrl.startsWith('/') ? manifestUrl : `/${manifestUrl}`;
  const resolved = new URL('.', `${URL_RESOLUTION_ORIGIN}${originRelativeManifestUrl}`);

  return manifestUrl.startsWith('/') ? resolved.pathname : resolved.pathname.slice(1);
};

export const resolveModelSpecs = (
  manifest: ModelManifest,
  overrides?: ModelOverrides,
  options: ResolveModelSpecOptions = {},
): ResolvedModelSpec[] => {
  const baseUrl = options.baseUrl ?? getManifestBaseUrl(options.manifestUrl);
  const modelsByCapability = new Map<ModelCapability, ModelSpec[]>();

  for (const model of manifest.models) {
    modelsByCapability.set(model.capability, [
      ...(modelsByCapability.get(model.capability) ?? []),
      model,
    ]);
  }

  for (const capability of MODEL_CAPABILITIES) {
    if (typeof overrides?.[capability] !== 'string') {
      continue;
    }

    const models = modelsByCapability.get(capability) ?? [];
    if (models.length <= 1) {
      continue;
    }

    throw new VerificationError(
      'models.manifest_invalid',
      `Model override '${capability}' matches multiple models. Use model ids instead: ${models
        .map((model) => model.id)
        .join(', ')}.`,
      { area: 'models' },
    );
  }

  return manifest.models.map((model) => {
    const url = overrides?.[model.id] ?? overrides?.[model.capability] ?? model.url;

    return {
      ...model,
      url: resolveUrl(url, baseUrl),
    };
  });
};

export const requireModelCapability = (
  models: readonly ResolvedModelSpec[],
  capability: ModelCapability,
): ResolvedModelSpec => {
  const model = models.find((entry) => entry.capability === capability);
  if (!model) {
    throw new VerificationError(
      'models.required_model_missing',
      `Required model '${capability}' is missing from the manifest.`,
      { area: 'models' },
    );
  }

  return model;
};
