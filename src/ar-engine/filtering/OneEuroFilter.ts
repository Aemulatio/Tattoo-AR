export interface OneEuroFilterOptions {
  minCutoff: number;
  beta: number;
  derivativeCutoff: number;
}

const defaultOptions: OneEuroFilterOptions = {
  minCutoff: 1.2,
  beta: 0.08,
  derivativeCutoff: 1,
};

export class OneEuroFilter {
  private readonly options: OneEuroFilterOptions;
  private previousTimestampMs: number | null = null;
  private previousRawValue: number | null = null;
  private filteredValue: number | null = null;
  private filteredDerivative = 0;

  constructor(options: Partial<OneEuroFilterOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
    if (
      this.options.minCutoff <= 0 ||
      this.options.derivativeCutoff <= 0 ||
      this.options.beta < 0
    ) {
      throw new Error(
        'One Euro filter cutoffs must be positive and beta non-negative',
      );
    }
  }

  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) {
      return this.filteredValue ?? value;
    }
    if (
      this.previousTimestampMs === null ||
      this.previousRawValue === null ||
      this.filteredValue === null
    ) {
      this.previousTimestampMs = timestampMs;
      this.previousRawValue = value;
      this.filteredValue = value;
      return value;
    }

    const elapsedSeconds = (timestampMs - this.previousTimestampMs) / 1000;
    if (elapsedSeconds <= 0) return this.filteredValue;

    const derivative = (value - this.previousRawValue) / elapsedSeconds;
    this.filteredDerivative = lowPass(
      this.filteredDerivative,
      derivative,
      smoothingFactor(this.options.derivativeCutoff, elapsedSeconds),
    );
    const cutoff =
      this.options.minCutoff +
      this.options.beta * Math.abs(this.filteredDerivative);
    this.filteredValue = lowPass(
      this.filteredValue,
      value,
      smoothingFactor(cutoff, elapsedSeconds),
    );
    this.previousTimestampMs = timestampMs;
    this.previousRawValue = value;
    return this.filteredValue;
  }

  reset(): void {
    this.previousTimestampMs = null;
    this.previousRawValue = null;
    this.filteredValue = null;
    this.filteredDerivative = 0;
  }
}

function smoothingFactor(cutoff: number, elapsedSeconds: number): number {
  const rate = 2 * Math.PI * cutoff * elapsedSeconds;
  return rate / (rate + 1);
}

function lowPass(previous: number, value: number, alpha: number): number {
  return previous + alpha * (value - previous);
}
