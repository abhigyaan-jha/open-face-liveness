import * as ort from 'onnxruntime-web';
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
import { VerificationError } from '../errors.js';

const DETECTOR_NUM_COORDS = 16;
const DETECTOR_NUM_BOXES = 896;
const BLENDSHAPE_SCORE_COUNT = 52;
export const DEFAULT_ONNX_WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';

type NumericTensor = {
  data: ArrayLike<number>;
  dims: readonly number[];
};

interface OnnxAdapterOptions {
  wasmBaseUrl?: string;
}

let configuredOrtWasmBaseUrl: string | null = null;

const configureOrt = (wasmBaseUrl = DEFAULT_ONNX_WASM_BASE_URL) => {
  if (configuredOrtWasmBaseUrl === wasmBaseUrl) {
    return;
  }

  if (ort.env?.wasm) {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = wasmBaseUrl;
  }

  configuredOrtWasmBaseUrl = wasmBaseUrl;
};

const getTensorDataSlice = (data: ArrayLike<number>, maxLength: number): number[] | Float32Array => {
  if (typeof (data as Float32Array).subarray === 'function') {
    return (data as Float32Array).subarray(0, maxLength);
  }

  if (typeof (data as number[]).slice === 'function') {
    return Array.prototype.slice.call(data, 0, maxLength) as number[];
  }

  return Array.from(data).slice(0, maxLength);
};

const hasNumericTensorData = (tensor: unknown): tensor is NumericTensor => {
  if (!tensor || typeof tensor !== 'object') {
    return false;
  }

  const candidate = tensor as { data?: unknown; dims?: unknown };
  const data = candidate.data;
  if (!data || typeof data !== 'object' || !('length' in data)) {
    return false;
  }

  const length = Number(data.length);
  if (!Number.isFinite(length)) {
    return false;
  }

  if (length > 0 && typeof (data as ArrayLike<unknown>)[0] !== 'number') {
    return false;
  }

  return Array.isArray(candidate.dims) && candidate.dims.every((dimension) => typeof dimension === 'number');
};

const mergeDetectorOutputs = (
  outputs: Record<string, unknown>,
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
    if (!hasNumericTensorData(tensor) || tensor.dims.length === 0) {
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

    const data = getTensorDataSlice(tensor.data, remaining);
    scores.set(data, scoreOffset);
    scoreOffset += data.length;
  }

  let boxOffset = 0;
  for (const tensor of boxTensors) {
    const remaining = boxes.length - boxOffset;
    if (remaining <= 0) {
      break;
    }

    const data = getTensorDataSlice(tensor.data, remaining);
    boxes.set(data, boxOffset);
    boxOffset += data.length;
  }

  return { boxes, scores };
};

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

const createSession = async (url: string, options: OnnxAdapterOptions = {}): Promise<ort.InferenceSession> => {
  configureOrt(options.wasmBaseUrl);
  try {
    return await ort.InferenceSession.create(url, {
      executionProviders: ['wasm'],
    });
  } catch (error) {
    throw new VerificationError('models.load_failed', `Unable to load ONNX model: ${url}`, {
      area: 'models',
      cause: error,
    });
  }
};

const releaseSession = async (session: ort.InferenceSession) => {
  await session.release?.();
};

const validateSession = async <T>(
  session: ort.InferenceSession,
  validate: () => T,
): Promise<T> => {
  try {
    return validate();
  } catch (error) {
    try {
      await releaseSession(session);
    } catch {
      // Preserve the adapter validation error if cleanup itself fails.
    }
    throw error;
  }
};

export const createOnnxDetectorAdapter = async (
  model: ResolvedModelSpec,
  options: OnnxAdapterOptions = {},
): Promise<DetectorAdapter> => {
  const session = await createSession(model.url, options);
  const { inputName, outputNames } = await validateSession(session, () => {
    const inputName = session.inputNames[0];
    const outputNames = [...session.outputNames];

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
    async dispose() {
      await releaseSession(session);
    },
    metadata: {
      inputs: [inputName],
      outputs: outputNames,
    },
    async run(input: Float32Array): Promise<DetectorRawResult> {
      const startedAt = performance.now();
      const outputs = await session.run({
        [inputName]: new ort.Tensor('float32', input, [1, 128, 128, 3]),
      });

      const merged = mergeDetectorOutputs(outputs, outputNames);

      return {
        boxes: merged.boxes,
        runMs: performance.now() - startedAt,
        scores: merged.scores,
      };
    },
  };
};

const getMeshIo = (session: ort.InferenceSession) => {
  const inputNames = session.inputNames;
  const outputNames = [...session.outputNames];
  const inputName = inputNames.find((name) => name === 'input_12');
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

export const createOnnxMeshAdapter = async (
  model: ResolvedModelSpec,
  options: OnnxAdapterOptions = {},
): Promise<MeshAdapter> => {
  const session = await createSession(model.url, options);
  const io = await validateSession(session, () => getMeshIo(session));

  return {
    async dispose() {
      await releaseSession(session);
    },
    metadata: {
      inputs: [io.inputName],
      outputs: [...io.outputNames],
    },
    async run(input: MeshRawInput): Promise<MeshRawResult | null> {
      const startedAt = performance.now();
      const outputs = await session.run({
        [io.inputName]: new ort.Tensor('float32', input.image, [1, 256, 256, 3]),
      });

      const scoreTensor = outputs[io.presenceOutputName];
      const landmarksTensor = outputs[io.landmarksOutputName];

      if (!hasNumericTensorData(scoreTensor) || scoreTensor.data.length === 0) {
        return null;
      }

      if (!hasNumericTensorData(landmarksTensor) || landmarksTensor.data.length < 3) {
        return null;
      }

      return {
        landmarks: Float32Array.from(landmarksTensor.data),
        runMs: performance.now() - startedAt,
        score: sigmoid(Number(scoreTensor.data[0])),
      };
    },
  };
};

const getBlendshapeIo = (session: ort.InferenceSession) => {
  const inputNames = session.inputNames;
  const outputNames = [...session.outputNames];
  const inputName = inputNames.find((name) => name === 'serving_default_input_points:0');
  const outputName = outputNames.find((name) => name === 'StatefulPartitionedCall:0');

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

export const createOnnxBlendshapeAdapter = async (
  model: ResolvedModelSpec,
  options: OnnxAdapterOptions = {},
): Promise<BlendshapeAdapter> => {
  const session = await createSession(model.url, options);
  const io = await validateSession(session, () => getBlendshapeIo(session));

  return {
    async dispose() {
      await releaseSession(session);
    },
    metadata: {
      inputs: [io.inputName],
      outputs: [...io.outputNames],
    },
    async run(input: Float32Array) {
      const startedAt = performance.now();
      const outputs = await session.run({
        [io.inputName]: new ort.Tensor('float32', input, [1, 146, 2]),
      });
      const scoresTensor = outputs[io.outputName];

      if (!hasNumericTensorData(scoresTensor) || scoresTensor.data.length < BLENDSHAPE_SCORE_COUNT) {
        return null;
      }

      const scores = Float32Array.from(scoresTensor.data).subarray(0, BLENDSHAPE_SCORE_COUNT);
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

export const createOnnxSpoofAdapter = async (
  model: ResolvedModelSpec,
  options: OnnxAdapterOptions = {},
): Promise<SpoofAdapter> => {
  const session = await createSession(model.url, options);
  const { inputName, outputName, outputNames } = await validateSession(session, () => {
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const outputNames = [...session.outputNames];

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
    async dispose() {
      await releaseSession(session);
    },
    metadata: {
      inputs: [inputName],
      outputs: outputNames,
    },
    model,
    async run(input: Float32Array): Promise<SpoofRawResult | null> {
      const startedAt = performance.now();
      const outputs = await session.run({
        [inputName]: new ort.Tensor('float32', input, [1, 3, 80, 80]),
      });
      const logitsTensor = outputs[outputName];

      if (!hasNumericTensorData(logitsTensor) || logitsTensor.data.length === 0) {
        return null;
      }

      return {
        logits: Float32Array.from(logitsTensor.data),
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
