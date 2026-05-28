const TWO_PI = Math.PI * 2;

export interface OneEuroOptions {
  beta: number;
  derivativeCutoff: number;
  minCutoff: number;
}

const getAlpha = (cutoff: number, deltaSeconds: number): number => {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / deltaSeconds);
};

class LowPassFilter {
  private initialized = false;
  private previous = 0;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.initialized = true;
      this.previous = value;
      return value;
    }

    const filtered = alpha * value + (1 - alpha) * this.previous;
    this.previous = filtered;
    return filtered;
  }

  reset(): void {
    this.initialized = false;
    this.previous = 0;
  }
}

class OneEuroFilter {
  private readonly derivativeFilter = new LowPassFilter();
  private readonly signalFilter = new LowPassFilter();
  private lastTimestampSeconds: number | null = null;
  private lastValue: number | null = null;

  constructor(private readonly options: OneEuroOptions) {}

  filter(value: number, timestampSeconds: number): number {
    if (!Number.isFinite(value)) {
      return value;
    }

    if (this.lastTimestampSeconds === null || this.lastValue === null) {
      this.lastTimestampSeconds = timestampSeconds;
      this.lastValue = value;
      return this.signalFilter.filter(value, 1);
    }

    const deltaSeconds = Math.max(1 / 120, timestampSeconds - this.lastTimestampSeconds);
    const derivative = (value - this.lastValue) / deltaSeconds;
    const filteredDerivative = this.derivativeFilter.filter(
      derivative,
      getAlpha(this.options.derivativeCutoff, deltaSeconds),
    );
    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(filteredDerivative);
    const filtered = this.signalFilter.filter(value, getAlpha(cutoff, deltaSeconds));

    this.lastTimestampSeconds = timestampSeconds;
    this.lastValue = value;
    return filtered;
  }

  reset(): void {
    this.derivativeFilter.reset();
    this.signalFilter.reset();
    this.lastTimestampSeconds = null;
    this.lastValue = null;
  }
}

export class LandmarkSmoother {
  private filters: OneEuroFilter[] = [];

  constructor(private readonly options: OneEuroOptions) {}

  filter(values: Float32Array, timestampSeconds: number): Float32Array {
    if (this.filters.length !== values.length) {
      this.reset();
      this.filters = Array.from({ length: values.length }, () => new OneEuroFilter(this.options));
    }

    const smoothed = new Float32Array(values.length);
    for (let index = 0; index < values.length; index += 1) {
      smoothed[index] = this.filters[index].filter(values[index], timestampSeconds);
    }

    return smoothed;
  }

  reset(): void {
    for (const filter of this.filters) {
      filter.reset();
    }
    this.filters = [];
  }
}
