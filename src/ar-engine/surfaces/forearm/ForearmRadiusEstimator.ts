import type { ForearmMaskSample } from '../../contracts';
import { anatomicalFallbackRadii, type ForearmRadii } from './ForearmGeometry';

export type ForearmRadiusSource = 'mask' | 'held-mask' | 'anatomical';

export interface ForearmRadiusEstimate {
  radii: ForearmRadii;
  source: ForearmRadiusSource;
  confidence: number;
  wristRadiusRatio: number;
  elbowRadiusRatio: number;
}

export interface ForearmRadiusEstimatorOptions {
  smoothingTimeConstantMs: number;
  holdDurationMs: number;
  minimumMaskConfidence: number;
}

const defaults: ForearmRadiusEstimatorOptions = {
  smoothingTimeConstantMs: 450,
  holdDurationMs: 750,
  minimumMaskConfidence: 0.5,
};

const fallbackRatios = {
  wristRadial: 0.105,
  wristTangent: 0.085,
  elbowRadial: 0.15,
  elbowTangent: 0.12,
} as const;

export class ForearmRadiusEstimator {
  private readonly options: ForearmRadiusEstimatorOptions;
  private wristRadiusRatio: number | null = null;
  private elbowRadiusRatio: number | null = null;
  private lastTimestampMs: number | null = null;
  private lastMaskTimestampMs: number | null = null;
  private lastMaskConfidence = 0;

  constructor(options: Partial<ForearmRadiusEstimatorOptions> = {}) {
    this.options = { ...defaults, ...options };
  }

  update(
    sample: ForearmMaskSample | null | undefined,
    forearmLength: number,
    timestampMs: number,
  ): ForearmRadiusEstimate {
    const fallback = anatomicalFallbackRadii(forearmLength);
    const validSample = this.validateSample(sample);
    let source: ForearmRadiusSource = 'anatomical';
    let confidence = 0.2;
    let targetWristRatio: number = fallbackRatios.wristRadial;
    let targetElbowRatio: number = fallbackRatios.elbowRadial;

    if (validSample) {
      targetWristRatio = clamp(validSample.wristRadiusRatio, 0.06, 0.22);
      targetElbowRatio = clamp(
        validSample.elbowRadiusRatio,
        Math.max(0.08, targetWristRatio * 0.7),
        Math.min(0.28, targetWristRatio * 2),
      );
      this.lastMaskTimestampMs = timestampMs;
      this.lastMaskConfidence = validSample.confidence;
      source = 'mask';
      confidence = validSample.confidence;
    } else if (
      this.lastMaskTimestampMs !== null &&
      timestampMs - this.lastMaskTimestampMs <= this.options.holdDurationMs &&
      this.wristRadiusRatio !== null &&
      this.elbowRadiusRatio !== null
    ) {
      targetWristRatio = this.wristRadiusRatio;
      targetElbowRatio = this.elbowRadiusRatio;
      const age = Math.max(0, timestampMs - this.lastMaskTimestampMs);
      source = 'held-mask';
      confidence =
        this.lastMaskConfidence * (1 - age / this.options.holdDurationMs);
    }

    const alpha = this.smoothingAlpha(timestampMs);
    this.wristRadiusRatio = smooth(
      this.wristRadiusRatio,
      targetWristRatio,
      alpha,
    );
    this.elbowRadiusRatio = smooth(
      this.elbowRadiusRatio,
      targetElbowRatio,
      alpha,
    );
    this.lastTimestampMs = timestampMs;

    const wristScale = this.wristRadiusRatio / fallbackRatios.wristRadial;
    const elbowScale = this.elbowRadiusRatio / fallbackRatios.elbowRadial;
    return {
      radii: {
        wrist: {
          radial: forearmLength * this.wristRadiusRatio,
          tangent: fallback.wrist.tangent * wristScale,
        },
        elbow: {
          radial: forearmLength * this.elbowRadiusRatio,
          tangent: fallback.elbow.tangent * elbowScale,
        },
      },
      source,
      confidence: clamp(confidence, 0, 1),
      wristRadiusRatio: this.wristRadiusRatio,
      elbowRadiusRatio: this.elbowRadiusRatio,
    };
  }

  reset(): void {
    this.wristRadiusRatio = null;
    this.elbowRadiusRatio = null;
    this.lastTimestampMs = null;
    this.lastMaskTimestampMs = null;
    this.lastMaskConfidence = 0;
  }

  private validateSample(
    sample: ForearmMaskSample | null | undefined,
  ): ForearmMaskSample | null {
    if (
      !sample ||
      !Number.isFinite(sample.wristRadiusRatio) ||
      !Number.isFinite(sample.elbowRadiusRatio) ||
      !Number.isFinite(sample.confidence) ||
      sample.wristRadiusRatio <= 0 ||
      sample.elbowRadiusRatio <= 0 ||
      sample.confidence < this.options.minimumMaskConfidence
    ) {
      return null;
    }
    return sample;
  }

  private smoothingAlpha(timestampMs: number): number {
    if (this.lastTimestampMs === null) return 1;
    const elapsedMs = Math.max(0, timestampMs - this.lastTimestampMs);
    if (this.options.smoothingTimeConstantMs <= 0) return 1;
    return 1 - Math.exp(-elapsedMs / this.options.smoothingTimeConstantMs);
  }
}

function smooth(current: number | null, target: number, alpha: number): number {
  return current === null ? target : current + (target - current) * alpha;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
