import type { TrackingMetricsSnapshot } from './TrackingMetrics';

export interface TelemetrySample extends TrackingMetricsSnapshot {
  timestampMs: number;
}

export class TelemetryHistory {
  private readonly maximumSamples: number;
  private readonly values: TelemetrySample[] = [];

  constructor(maximumSamples = 60) {
    if (!Number.isInteger(maximumSamples) || maximumSamples < 2) {
      throw new Error('Telemetry history requires at least two samples');
    }
    this.maximumSamples = maximumSamples;
  }

  push(timestampMs: number, snapshot: TrackingMetricsSnapshot): void {
    this.values.push({ timestampMs, ...snapshot });
    if (this.values.length > this.maximumSamples) this.values.shift();
  }

  samples(): ReadonlyArray<TelemetrySample> {
    return this.values;
  }

  clear(): void {
    this.values.length = 0;
  }
}
