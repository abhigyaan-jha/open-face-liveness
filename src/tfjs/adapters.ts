import * as tf from '@tensorflow/tfjs-core';
import { setThreadsCount, setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { loadGraphModel, type GraphModel } from '@tensorflow/tfjs-converter';
import type {
  BlendshapeAdapter,
  DetectorAdapter,
  DetectorRawResult,
  MeshAdapter,
  MeshRawInput,
  MeshRawResult,
  ResolvedModelSpec,
  SpoofAdapter,
  SpoofRawResult,
} from '../models.js';
import { DEFAULT_TFJS_WASM_BASE_URL } from '../config.js';
import { VerificationError } from '../errors.js';

const DETECTOR_NUM_COORDS = 16;
const DETECTOR_NUM_BOXES = 896;
const BLENDSHAPE_SCORE_COUNT = 52;

type NumericTensor = {
  data: Float32Array;
  dims: readonly number[];
};

interface TfjsAdapterOptions {
  wasmBaseUrl?: string;
}

let wasmBackendReady: Promise<void> | null = null;

// TensorFlow.js has one global engine, so the first wasm base URL wins for the page.
const ensureWasmBackend = (wasmBaseUrl = DEFAULT_TFJS_WASM_BASE_URL): Promise<void> => {
  wasmBackendReady ??= (async () => {
    // Wasm paths only apply before the backend initializes, e.g. by the host app.
    // tf.findBackend() would start initialization itself, so read the registry instead.
    if (!tf.engine().registry.wasm) {
      setWasmPaths(wasmBaseUrl);
      // Threads need blob-URL workers, which strict Content Security Policies block.
      setThreadsCount(1);
    }

    if (!(await tf.setBackend('wasm'))) {
      throw new Error('TensorFlow.js wasm backend failed to initialize.');
    }
    await tf.ready();
  })().catch((error: unknown) => {
    wasmBackendReady = null;
    throw new VerificationError('models.load_failed', 'Unable to initialize the TensorFlow.js wasm backend.', {
      area: 'models',
      cause: error,
    });
  });

  return wasmBackendReady;
};

const mergeDetectorOutputs = (
  outputs: Record<string, NumericTensor>,
  outputNames: readonly string[],
): Pick<DetectorRawResult, 'boxes' | 'scores'> => {
  const scoreTensors: NumericTensor[] = [];
  const boxTensors: NumericTensor[] = [];
  const scores = new Float32Array(DETECTOR_NUM_BOXES);
  const boxes = new Float32Array(DETECTOR_NUM_BOXES * DETECTOR_NUM_COORDS);

  scores.fill(-100);
  boxes.fill(0);

  for (const name of outputNames) {
    const tensor = outputs[name];
    if (!tensor || tensor.dims.length === 0) {
      continue;
    }

    const lastDimension = tensor.dims[tensor.dims.length - 1];
    if (lastDimension === 1) {
      scoreTensors.push(tensor);
      continue;
    }

    if (lastDimension === DETECTOR_NUM_COORDS) {
      boxTensors.push(tensor);
    }
  }

  scoreTensors.sort((left, right) => right.data.length - left.data.length);
  boxTensors.sort((left, right) => right.data.length - left.data.length);

  let scoreOffset = 0;
  for (const tensor of scoreTensors) {
    const remaining = scores.length - scoreOffset;
    if (remaining <= 0) {
      break;
    }

    const data = tensor.data.subarray(0, remaining);
    scores.set(data, scoreOffset);
    scoreOffset += data.length;
  }

  let boxOffset = 0;
  for (const tensor of boxTensors) {
    const remaining = boxes.length - boxOffset;
    if (remaining <= 0) {
      break;
    }

    const data = tensor.data.subarray(0, remaining);
    boxes.set(data, boxOffset);
    boxOffset += data.length;
  }

  return { boxes, scores };
};

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

class ModelIntegrityError extends Error {}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

const getRequestUrl = (input: RequestInfo | URL): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

// Fetches only the files the manifest lists, and only if their bytes match its SHA-256 pins.
const createVerifiedFetch = (model: ResolvedModelSpec, modelUrl: URL) => {
  const expected = new Map(
    Object.entries(model.files).map(([path, hash]) => [new URL(path, modelUrl).href, hash]),
  );
  const verified = new Set<string>();

  const fetchFunc = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(getRequestUrl(input), document.baseURI).href;
    const hash = expected.get(url);
    if (!hash) {
      throw new ModelIntegrityError(`Model file is not listed in the manifest: ${url}`);
    }

    const response = await fetch(input, init);
    if (!response.ok) {
      throw new Error(`Model request failed: ${response.status} ${url}`);
    }

    const bytes = await response.arrayBuffer();
    if (toHex(await crypto.subtle.digest('SHA-256', bytes)) !== hash) {
      throw new ModelIntegrityError(`Model file SHA-256 does not match the manifest: ${url}`);
    }

    verified.add(url);
    return new Response(bytes, { headers: response.headers, status: response.status });
  };

  return { allFilesVerified: () => verified.size === expected.size, fetchFunc };
};

const loadModel = async (model: ResolvedModelSpec, options: TfjsAdapterOptions = {}): Promise<GraphModel> => {
  await ensureWasmBackend(options.wasmBaseUrl);
  const modelUrl = new URL(model.url, document.baseURI);
  const { allFilesVerified, fetchFunc } = createVerifiedFetch(model, modelUrl);

  let graph: GraphModel;
  try {
    graph = await loadGraphModel(modelUrl.href, { fetchFunc });
  } catch (error) {
    const integrityFailed = error instanceof ModelIntegrityError;
    throw new VerificationError(
      integrityFailed ? 'models.integrity_failed' : 'models.load_failed',
      integrityFailed ? error.message : `Unable to load TensorFlow.js model: ${model.url}`,
      { area: 'models', cause: error },
    );
  }

  if (!allFilesVerified()) {
    graph.dispose();
    throw new VerificationError(
      'models.integrity_failed',
      `Model '${model.id}' did not load every file its manifest entry lists.`,
      { area: 'models' },
    );
  }

  return graph;
};

const validateModel = <T>(model: GraphModel, validate: () => T): T => {
  try {
    return validate();
  } catch (error) {
    model.dispose();
    throw error;
  }
};

const runModel = async (
  model: GraphModel,
  inputName: string,
  input: Float32Array,
  shape: number[],
  outputNames: readonly string[],
): Promise<Record<string, NumericTensor>> => {
  const outputs = tf.tidy(() => {
    const result = model.execute({ [inputName]: tf.tensor(input, shape, 'float32') }, [...outputNames]);
    return Array.isArray(result) ? result : [result];
  });

  try {
    const data = await Promise.all(outputs.map((output) => output.data<'float32'>()));
    return Object.fromEntries(
      outputNames.map((name, index) => [name, { data: data[index], dims: outputs[index].shape }]),
    );
  } finally {
    tf.dispose(outputs);
  }
};

export const createTfjsDetectorAdapter = async (
  model: ResolvedModelSpec,
  options: TfjsAdapterOptions = {},
): Promise<DetectorAdapter> => {
  const graph = await loadModel(model, options);
  const { inputName, outputNames } = validateModel(graph, () => {
    const inputName = graph.inputNodes[0];
    const outputNames = [...graph.outputNodes];

    if (!inputName) {
      throw new VerificationError(
        'models.adapter_invalid',
        `Detector model '${model.id}' is missing an input.`,
        { area: 'models' },
      );
    }

    return { inputName, outputNames };
  });

  return {
    dispose() {
      graph.dispose();
      return Promise.resolve();
    },
    metadata: {
      inputs: [inputName],
      outputs: outputNames,
    },
    async run(input: Float32Array): Promise<DetectorRawResult> {
      const startedAt = performance.now();
      const outputs = await runModel(graph, inputName, input, [1, 128, 128, 3], outputNames);
      const merged = mergeDetectorOutputs(outputs, outputNames);

      return {
        boxes: merged.boxes,
        runMs: performance.now() - startedAt,
        scores: merged.scores,
      };
    },
  };
};

const getMeshIo = (graph: GraphModel) => {
  const outputNames = [...graph.outputNodes];
  const inputName = graph.inputNodes.find((name) => name === 'input_12');
  const landmarksOutputName = outputNames.find((name) => name === 'Identity');
  const presenceOutputName = outputNames.find((name) => name === 'Identity_1');

  if (!inputName || !presenceOutputName || !landmarksOutputName) {
    throw new VerificationError(
      'models.adapter_invalid',
      'Unexpected Google face landmarks model I/O signature.',
      { area: 'models' },
    );
  }

  return {
    inputName,
    landmarksOutputName,
    outputNames,
    presenceOutputName,
  };
};

export const createTfjsMeshAdapter = async (
  model: ResolvedModelSpec,
  options: TfjsAdapterOptions = {},
): Promise<MeshAdapter> => {
  const graph = await loadModel(model, options);
  const io = validateModel(graph, () => getMeshIo(graph));
  const runOutputNames = [io.landmarksOutputName, io.presenceOutputName];

  return {
    dispose() {
      graph.dispose();
      return Promise.resolve();
    },
    metadata: {
      inputs: [io.inputName],
      outputs: [...io.outputNames],
    },
    async run(input: MeshRawInput): Promise<MeshRawResult | null> {
      const startedAt = performance.now();
      const outputs = await runModel(graph, io.inputName, input.image, [1, 256, 256, 3], runOutputNames);

      const scoreTensor = outputs[io.presenceOutputName];
      const landmarksTensor = outputs[io.landmarksOutputName];

      if (!scoreTensor || scoreTensor.data.length === 0) {
        return null;
      }

      if (!landmarksTensor || landmarksTensor.data.length < 3) {
        return null;
      }

      return {
        landmarks: landmarksTensor.data,
        runMs: performance.now() - startedAt,
        score: sigmoid(scoreTensor.data[0]),
      };
    },
  };
};

const getBlendshapeIo = (graph: GraphModel) => {
  const outputNames = [...graph.outputNodes];
  const inputName = graph.inputNodes.find((name) => name === 'serving_default_input_points_0');
  const outputName = outputNames.find((name) => name === 'StatefulPartitionedCall_0');

  if (!inputName || !outputName) {
    throw new VerificationError(
      'models.adapter_invalid',
      'Unexpected Google face blendshape model I/O signature.',
      { area: 'models' },
    );
  }

  return {
    inputName,
    outputName,
    outputNames,
  };
};

export const createTfjsBlendshapeAdapter = async (
  model: ResolvedModelSpec,
  options: TfjsAdapterOptions = {},
): Promise<BlendshapeAdapter> => {
  const graph = await loadModel(model, options);
  const io = validateModel(graph, () => getBlendshapeIo(graph));

  return {
    dispose() {
      graph.dispose();
      return Promise.resolve();
    },
    metadata: {
      inputs: [io.inputName],
      outputs: [...io.outputNames],
    },
    async run(input: Float32Array) {
      const startedAt = performance.now();
      const outputs = await runModel(graph, io.inputName, input, [1, 146, 2], [io.outputName]);
      const scoresTensor = outputs[io.outputName];

      if (!scoresTensor || scoresTensor.data.length < BLENDSHAPE_SCORE_COUNT) {
        return null;
      }

      const scores = scoresTensor.data.subarray(0, BLENDSHAPE_SCORE_COUNT);
      if (scores.some((score) => !Number.isFinite(score))) {
        return null;
      }

      return {
        runMs: performance.now() - startedAt,
        scores,
      };
    },
  };
};

export const createTfjsSpoofAdapter = async (
  model: ResolvedModelSpec,
  options: TfjsAdapterOptions = {},
): Promise<SpoofAdapter> => {
  const graph = await loadModel(model, options);
  const { inputName, outputName, outputNames } = validateModel(graph, () => {
    const inputName = graph.inputNodes[0];
    const outputName = graph.outputNodes[0];
    const outputNames = [...graph.outputNodes];

    if (!inputName || !outputName) {
      throw new VerificationError(
        'models.adapter_invalid',
        `Spoof model '${model.id}' is missing an input or output.`,
        { area: 'models' },
      );
    }

    return { inputName, outputName, outputNames };
  });

  return {
    dispose() {
      graph.dispose();
      return Promise.resolve();
    },
    metadata: {
      inputs: [inputName],
      outputs: outputNames,
    },
    model,
    async run(input: Float32Array): Promise<SpoofRawResult | null> {
      const startedAt = performance.now();
      const outputs = await runModel(graph, inputName, input, [1, 3, 80, 80], [outputName]);
      const logitsTensor = outputs[outputName];

      if (!logitsTensor || logitsTensor.data.length === 0) {
        return null;
      }

      return {
        logits: logitsTensor.data,
        runMs: performance.now() - startedAt,
      };
    },
  };
};

export const attachIoMetadata = (
  model: ResolvedModelSpec,
  metadata: { inputs: string[]; outputs: string[] },
): ResolvedModelSpec => ({
  ...model,
  inputs: [...metadata.inputs],
  outputs: [...metadata.outputs],
});
