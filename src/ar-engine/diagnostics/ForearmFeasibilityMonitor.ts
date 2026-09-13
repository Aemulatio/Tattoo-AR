import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import type { ForearmRadiusEstimate } from '../surfaces/forearm/ForearmRadiusEstimator';

export interface ForearmFeasibilitySnapshot {
  currentRollDegrees: number;
  rollRangeDegrees: number;
  maximumRollStepDegrees: number;
  flipCount: number;
  radiusWindowMs: number;
  wristRadiusDriftPercent: number;
  elbowRadiusDriftPercent: number;
}

export interface ForearmFeasibilityMonitorOptions {
  radiusWindowMs: number;
  flipThresholdDegrees: number;
}

const defaults: ForearmFeasibilityMonitorOptions = {
  radiusWindowMs: 5_000,
  flipThresholdDegrees: 120,
};

interface RadiusSample {
  timestampMs: number;
  wristRadiusRatio: number;
  elbowRadiusRatio: number;
}

export class ForearmFeasibilityMonitor {
  private readonly options: ForearmFeasibilityMonitorOptions;
  private readonly radiusSamples: RadiusSample[] = [];
  private lastRollDegrees: number | null = null;
  private minimumRollDegrees = 0;
  private maximumRollDegrees = 0;
  private maximumRollStepDegrees = 0;
  private flipCount = 0;

  constructor(options: Partial<ForearmFeasibilityMonitorOptions> = {}) {
    this.options = { ...defaults, ...options };
  }

  record(
    timestampMs: number,
    frame: ForearmLocalFrame,
    radius: ForearmRadiusEstimate,
  ): void {
    const rollDegrees = radiansToDegrees(frame.rollRadians);
    if (this.lastRollDegrees === null) {
      this.minimumRollDegrees = rollDegrees;
      this.maximumRollDegrees = rollDegrees;
    } else {
      const step = Math.abs(rollDegrees - this.lastRollDegrees);
      this.maximumRollStepDegrees = Math.max(this.maximumRollStepDegrees, step);
      if (step >= this.options.flipThresholdDegrees) this.flipCount += 1;
      this.minimumRollDegrees = Math.min(this.minimumRollDegrees, rollDegrees);
      this.maximumRollDegrees = Math.max(this.maximumRollDegrees, rollDegrees);
    }
    this.lastRollDegrees = rollDegrees;

    this.radiusSamples.push({
      timestampMs,
      wristRadiusRatio: radius.wristRadiusRatio,
      elbowRadiusRatio: radius.elbowRadiusRatio,
    });
    this.trimRadiusSamples(timestampMs);
  }

  snapshot(timestampMs?: number): ForearmFeasibilitySnapshot {
    if (timestampMs !== undefined) this.trimRadiusSamples(timestampMs);
    const first = this.radiusSamples[0];
    const last = this.radiusSamples.at(-1);
    return {
      currentRollDegrees: this.lastRollDegrees ?? 0,
      rollRangeDegrees:
        this.lastRollDegrees === null
          ? 0
          : this.maximumRollDegrees - this.minimumRollDegrees,
      maximumRollStepDegrees: this.maximumRollStepDegrees,
      flipCount: this.flipCount,
      radiusWindowMs:
        first && last ? Math.max(0, last.timestampMs - first.timestampMs) : 0,
      wristRadiusDriftPercent: relativeRange(
        this.radiusSamples.map((sample) => sample.wristRadiusRatio),
      ),
      elbowRadiusDriftPercent: relativeRange(
        this.radiusSamples.map((sample) => sample.elbowRadiusRatio),
      ),
    };
  }

  reset(): void {
    this.radiusSamples.length = 0;
    this.lastRollDegrees = null;
    this.minimumRollDegrees = 0;
    this.maximumRollDegrees = 0;
    this.maximumRollStepDegrees = 0;
    this.flipCount = 0;
  }

  private trimRadiusSamples(timestampMs: number): void {
    const oldestTimestamp = timestampMs - this.options.radiusWindowMs;
    while (
      this.radiusSamples[0] &&
      this.radiusSamples[0].timestampMs < oldestTimestamp
    ) {
      this.radiusSamples.shift();
    }
  }
}

export function emptyForearmFeasibilitySnapshot(): ForearmFeasibilitySnapshot {
  return {
    currentRollDegrees: 0,
    rollRangeDegrees: 0,
    maximumRollStepDegrees: 0,
    flipCount: 0,
    radiusWindowMs: 0,
    wristRadiusDriftPercent: 0,
    elbowRadiusDriftPercent: 0,
  };
}

function relativeRange(values: number[]): number {
  if (values.length < 2) return 0;
  let minimum = values[0] ?? 0;
  let maximum = minimum;
  let sum = 0;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    sum += value;
  }
  const mean = sum / values.length;
  return mean > 0 ? ((maximum - minimum) / mean) * 100 : 0;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
