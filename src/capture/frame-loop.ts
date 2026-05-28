export interface FrameLoop {
  start(): void;
  stop(): void;
}

export const createFrameLoop = (callback: (timestamp: number) => Promise<void> | void): FrameLoop => {
  let frameId = 0;
  let running = false;
  let processing = false;

  const tick = (timestamp: number) => {
    if (!running) {
      return;
    }

    if (processing) {
      frameId = requestAnimationFrame(tick);
      return;
    }

    processing = true;
    Promise.resolve(callback(timestamp))
      .catch(() => {
        // Errors are reported by the owning actor; the loop only controls scheduling.
      })
      .finally(() => {
        processing = false;
        if (running) {
          frameId = requestAnimationFrame(tick);
        }
      });
  };

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      frameId = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
    },
  };
};
