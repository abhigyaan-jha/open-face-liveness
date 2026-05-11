import type { ResolvedModelSpec } from '../types.js';
import {
  attachIoMetadata,
  createOnnxDetectorAdapter,
  createOnnxMeshAdapter,
  createOnnxSpoofAdapter,
} from '../providers/onnx.js';
import { createDetectorPipeline } from '../pipelines/detector.js';
import { createMeshPipeline } from '../pipelines/mesh.js';
import { createSpoofPipeline } from '../pipelines/spoof.js';
import { VerificationRuntimeError } from '../errors.js';
import type { LoadPhaseOneRuntimeOptions, PhaseOneRuntimeBundle, SpoofAdapter } from '../types.js';
import { loadModelManifest, requireModelCapability, resolveModelSpecs } from './manifest.js';

const createRequiredSpoofUnavailableError = (
  message = 'Required spoof check could not be initialized.',
  cause?: unknown,
): VerificationRuntimeError =>
  new VerificationRuntimeError(
    {
      check: 'spoof',
      code: 'required_check_unavailable',
      message,
    },
    { cause },
  );

const disposeSpoofAdapters = async (adapters: readonly SpoofAdapter[]): Promise<void> => {
  await Promise.all(adapters.map((adapter) => adapter.dispose()));
};

export const loadPhaseOneRuntime = async (
  options: LoadPhaseOneRuntimeOptions,
): Promise<PhaseOneRuntimeBundle> => {
  const manifest = await loadModelManifest(options.models.manifestUrl);
  const resolvedModels = resolveModelSpecs(manifest, options.models.overrides);

  const detectorModel = requireModelCapability(resolvedModels, 'detector');
  const meshModel = requireModelCapability(resolvedModels, 'mesh');

  const [detectorAdapter, meshAdapter] = await Promise.all([
    createOnnxDetectorAdapter(detectorModel),
    createOnnxMeshAdapter(meshModel),
  ]);
  const shouldLoadSpoof = Boolean(options.checks?.includes('spoof'));

  const detector = createDetectorPipeline(detectorAdapter);
  const mesh = createMeshPipeline(meshAdapter);

  const modelMap = new Map<string, ResolvedModelSpec>(resolvedModels.map((model) => [model.id, model]));
  modelMap.set(detectorModel.id, attachIoMetadata(detectorModel, detector.metadata));
  modelMap.set(meshModel.id, attachIoMetadata(meshModel, mesh.metadata));

  let spoof: PhaseOneRuntimeBundle['spoof'] = null;
  try {
    const spoofAdapters: SpoofAdapter[] = [];
    if (shouldLoadSpoof) {
      const spoofModels = resolvedModels.filter((model) => model.capability === 'spoof');

      if (!spoofModels.length) {
        throw createRequiredSpoofUnavailableError();
      }

      const spoofResults = await Promise.allSettled(
        spoofModels.map(async (model) => ({
          adapter: await createOnnxSpoofAdapter(model),
          model,
        })),
      );
      const failedSpoofModels = spoofResults.filter((result) => result.status === 'rejected');

      for (const result of spoofResults) {
        if (result.status === 'fulfilled') {
          spoofAdapters.push(result.value.adapter);
          modelMap.set(result.value.model.id, attachIoMetadata(result.value.model, result.value.adapter.metadata));
        }
      }

      if (failedSpoofModels.length || spoofAdapters.length !== spoofModels.length) {
        await disposeSpoofAdapters(spoofAdapters);
        throw createRequiredSpoofUnavailableError(
          'Required spoof check could not be initialized.',
          failedSpoofModels.map((result) => result.reason),
        );
      }
    }

    if (spoofAdapters.length) {
      try {
        spoof = createSpoofPipeline(spoofAdapters);
      } catch (error) {
        await disposeSpoofAdapters(spoofAdapters);
        throw createRequiredSpoofUnavailableError(
          'Required spoof check could not be initialized.',
          error,
        );
      }
    }
  } catch (error) {
    await Promise.all([detector.destroy(), mesh.destroy()]);
    throw error;
  }

  return {
    async destroy() {
      await Promise.all([detector.destroy(), mesh.destroy(), spoof?.destroy()]);
    },
    detector,
    mesh,
    models: resolvedModels.map((model) => modelMap.get(model.id) ?? model),
    spoof,
  };
};
