export type TrackingCadenceLevel = 'quality' | 'balanced' | 'reduced';

export interface TrackingCadenceSnapshot {
  level: TrackingCadenceLevel;
  targetFramesPerSecond: number;
  smoothedInferenceMs: number;
}

export interface AdaptiveTrackingCadenceOptions {
  warmupSamples: number;
  smoothingFactor: number;
  balancedThresholdMs: number;
  reducedThresholdMs: number;
  qualityRecoveryMs: number;
  balancedRecoveryMs: number;
}

const defaultOptions: AdaptiveTrackingCadenceOptions = {
  warmupSamples: 5,
  smoothingFactor: 0.2,
  balancedThresholdMs: 42,
  reducedThresholdMs: 58,
  qualityRecoveryMs: 32,
  balancedRecoveryMs: 48,
};

const targetRates: Record<TrackingCadenceLevel, number> = {
  quality: 20,
  balanced: 17,
  reduced: 15,
};

export class AdaptiveTrackingCadence {
  private readonly options: AdaptiveTrackingCadenceOptions;
  private levelValue: TrackingCadenceLevel = 'quality';
  private averageInferenceMs = 0;
  private sampleCount = 0;
  private warmupInferenceMs: number[] = [];

  constructor(options: Partial<AdaptiveTrackingCadenceOptions> = {}) {
    this.options = { ...defaultOptions, ...options };
  }

  get level(): TrackingCadenceLevel {
    return this.levelValue;
  }

  get targetFramesPerSecond(): number {
    return targetRates[this.levelValue];
  }

  recordInference(inferenceMs: number): TrackingCadenceSnapshot {
    if (!Number.isFinite(inferenceMs) || inferenceMs <= 0) {
      return this.snapshot();
    }
    this.sampleCount += 1;
    const warmupSamples = Math.max(1, Math.round(this.options.warmupSamples));
    if (this.sampleCount <= warmupSamples) {
      this.warmupInferenceMs.push(inferenceMs);
      this.averageInferenceMs = median(this.warmupInferenceMs);
    } else {
      const smoothing = Math.min(
        1,
        Math.max(0.01, this.options.smoothingFactor),
      );
      this.averageInferenceMs +=
        (inferenceMs - this.averageInferenceMs) * smoothing;
    }
    if (this.sampleCount >= warmupSamples) {
      this.updateLevel();
    }
    return this.snapshot();
  }

  reset(): void {
    this.levelValue = 'quality';
    this.averageInferenceMs = 0;
    this.sampleCount = 0;
    this.warmupInferenceMs = [];
  }

  snapshot(): TrackingCadenceSnapshot {
    return {
      level: this.levelValue,
      targetFramesPerSecond: this.targetFramesPerSecond,
      smoothedInferenceMs: this.averageInferenceMs,
    };
  }

  private updateLevel(): void {
    if (this.levelValue === 'quality') {
      if (this.averageInferenceMs >= this.options.reducedThresholdMs) {
        this.levelValue = 'reduced';
      } else if (this.averageInferenceMs >= this.options.balancedThresholdMs) {
        this.levelValue = 'balanced';
      }
      return;
    }
    if (this.levelValue === 'balanced') {
      if (this.averageInferenceMs >= this.options.reducedThresholdMs) {
        this.levelValue = 'reduced';
      } else if (this.averageInferenceMs <= this.options.qualityRecoveryMs) {
        this.levelValue = 'quality';
      }
      return;
    }
    if (this.averageInferenceMs <= this.options.balancedRecoveryMs) {
      this.levelValue = 'balanced';
    }
  }
}

function median(values: readonly number[]): number {
  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) {
    return sortedValues[middleIndex];
  }
  return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}
