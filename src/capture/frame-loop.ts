export type FrameLoopCallback = (timestamp: number) => void;

export interface FrameLoop {
  start(): void;
  stop(): void;
}

export const createFrameLoop = (callback: FrameLoopCallback): FrameLoop => {
  let frameId: number | null = null;
  const tick = (timestamp: number) => {
    callback(timestamp);
    frameId = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (frameId === null) {
        frameId = requestAnimationFrame(tick);
      }
    },
    stop() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
};

