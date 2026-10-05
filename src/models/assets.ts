import type { ModelManifest, ResolvedModelSpec, VerificationModelsOptions } from '../models.js';
import {
  BUNDLED_MODEL_MANIFEST,
  getBundledModelFileUrls,
  getBundledTfjsWasmUrls,
} from './bundled-assets.generated.js';
import { loadModelManifest, resolveModelSpecs } from './manifest.js';

export interface ResolvedModelAssets {
  manifest: ModelManifest;
  models: ResolvedModelSpec[];
  /** A base URL, or a map from wasm file name to URL. */
  tfjsWasmPaths: string | Record<string, string>;
}

const ensureTrailingSlash = (url: string): string => url.endsWith('/') ? url : `${url}/`;

const parentDirectory = (path: string): string => path.slice(0, path.lastIndexOf('/') + 1);

// Points the package's own models at the URLs the app's bundler gave their files.
const attachBundledFileUrls = (
  models: readonly ResolvedModelSpec[],
  manifest: ModelManifest,
): ResolvedModelSpec[] => {
  const bundledUrls = getBundledModelFileUrls();
  const manifestUrls = new Map(manifest.models.map((model) => [model.id, model.url]));

  return models.map((model) => {
    // An override points this model somewhere else, so its files do not come from the bundle.
    if (model.url !== manifestUrls.get(model.id)) {
      return model;
    }

    const directory = parentDirectory(model.url);
    return {
      ...model,
      fileUrls: Object.fromEntries(
        Object.keys(model.files).map((file) => [file, bundledUrls[`${directory}${file}`]]),
      ),
    };
  });
};

/**
 * Decides where the manifest, model files, and TensorFlow.js wasm files load from:
 * explicit URLs first, then `assetBaseUrl`, then the files bundled with the app.
 */
export const resolveModelAssets = async (options: VerificationModelsOptions): Promise<ResolvedModelAssets> => {
  const assetBaseUrl = options.assetBaseUrl ? ensureTrailingSlash(options.assetBaseUrl) : undefined;
  const manifest = options.manifestUrl ? await loadModelManifest(options.manifestUrl) : BUNDLED_MODEL_MANIFEST;
  const baseUrl = options.baseUrl ?? (options.manifestUrl || !assetBaseUrl ? undefined : `${assetBaseUrl}models/`);
  const models = resolveModelSpecs(manifest, options.overrides, {
    baseUrl,
    manifestUrl: options.manifestUrl,
  });
  const usesBundledModels = !options.manifestUrl && !baseUrl;

  return {
    manifest,
    models: usesBundledModels ? attachBundledFileUrls(models, manifest) : models,
    tfjsWasmPaths: options.tfjsWasmBaseUrl
      ?? (assetBaseUrl ? `${assetBaseUrl}vendor/tfjs-wasm/` : getBundledTfjsWasmUrls()),
  };
};
