export interface OnnxBackend {
  createSession(modelUrl: string): Promise<unknown>;
}

export const createOnnxBackend = (): OnnxBackend => ({
  async createSession(modelUrl) {
    return { modelUrl };
  },
});

