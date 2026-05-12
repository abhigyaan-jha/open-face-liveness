import type { ModelCapability, ModelManifest, ModelSpec, ResolvedModelSpec } from '../models.js';
import { VerificationError } from '../errors.js';

const MODEL_CAPABILITIES: readonly ModelCapability[] = ['detector', 'mesh', 'spoof'];
const URL_RESOLUTION_ORIGIN = 'https://web-verify.local';

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
  const response = await fetch(manifestUrl, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new VerificationError(
      'models.manifest_load_failed',
      `Unable to load model manifest: ${response.status} ${response.statusText}`,
      { area: 'models' },
    );
  }

  return parseModelManifest(await response.json());
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
  overrides?: Partial<Record<ModelCapability, string>>,
  options: ResolveModelSpecOptions = {},
): ResolvedModelSpec[] => {
  const baseUrl = options.baseUrl ?? getManifestBaseUrl(options.manifestUrl);

  return manifest.models.map((model) => {
    const url = overrides?.[model.capability] ?? model.url;

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
