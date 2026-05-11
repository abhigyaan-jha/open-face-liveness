export interface OpenCvRuntime {
  ready: boolean;
}

export const loadOpenCv = async (): Promise<OpenCvRuntime> => ({
  ready: true,
});

