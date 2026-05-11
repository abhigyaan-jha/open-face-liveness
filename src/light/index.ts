export {
  clampLightTestRect,
  createLightPipeline,
  createLightTestTargetColorComparison,
  getLightTestSampleRects,
  getPearsonCorrelation,
  getRgbChromaticity,
  sampleLightTestImageData,
  summarizeLightTestSequence,
} from '../pipelines/light.js';
export type {
  CreateLightPipelineOptions,
  LightPipeline,
  LightPipelineFrame,
  LightPipelineUpdate,
} from '../pipelines/light.js';
export type {
  LightTestChroma,
  LightTestColor,
  LightTestOptions,
  LightTestPassChecks,
  LightTestPhase,
  LightTestResult,
  LightTestSample,
  LightTestState,
  LightTestStatus,
  LightTestStepComparison,
  ResolvedLightTestOptions,
} from '../types.js';
