import type { TelemetrySample } from './TelemetryHistory';

export interface PerformanceBudgetTargets {
  minimumTrackingFps: number;
  minimumRenderFps: number;
  minimumSamples: number;
  sampleWindow: number;
}

export type PerformanceBudgetStatus = 'collecting' | 'pass' | 'fail';

export interface PerformanceBudgetSnapshot {
  status: PerformanceBudgetStatus;
  sampleCount: number;
  minimumSamples: number;
  inferenceMedianMs: number;
  trackingMedianFps: number;
  renderMedianFps: number;
  trackingPassed: boolean | null;
  renderPassed: boolean | null;
  windowDurationMs: number;
}

export const phase6PerformanceTargets: PerformanceBudgetTargets = {
  minimumTrackingFps: 15,
  minimumRenderFps: 30,
  minimumSamples: 30,
  sampleWindow: 30,
};

export function evaluatePerformanceBudget(
  samples: ReadonlyArray<TelemetrySample>,
  targets: PerformanceBudgetTargets = phase6PerformanceTargets,
): PerformanceBudgetSnapshot {
  const validSamples = samples
    .filter(
      (sample) =>
        Number.isFinite(sample.resultsPerSecond) &&
        sample.resultsPerSecond > 0 &&
        Number.isFinite(sample.rendersPerSecond) &&
        sample.rendersPerSecond > 0,
    )
    .slice(-Math.max(1, Math.round(targets.sampleWindow)));
  const trackingMedianFps = median(
    validSamples.map((sample) => sample.resultsPerSecond),
  );
  const renderMedianFps = median(
    validSamples.map((sample) => sample.rendersPerSecond),
  );
  const inferenceMedianMs = median(
    validSamples.map((sample) => sample.inferenceMs),
  );
  const minimumSamples = Math.max(1, Math.round(targets.minimumSamples));
  const ready = validSamples.length >= minimumSamples;
  const trackingPassed = ready
    ? trackingMedianFps >= targets.minimumTrackingFps
    : null;
  const renderPassed = ready
    ? renderMedianFps >= targets.minimumRenderFps
    : null;
  const firstSample = validSamples.at(0);
  const lastSample = validSamples.at(-1);

  return {
    status: ready
      ? trackingPassed && renderPassed
        ? 'pass'
        : 'fail'
      : 'collecting',
    sampleCount: validSamples.length,
    minimumSamples,
    inferenceMedianMs,
    trackingMedianFps,
    renderMedianFps,
    trackingPassed,
    renderPassed,
    windowDurationMs:
      firstSample && lastSample
        ? Math.max(0, lastSample.timestampMs - firstSample.timestampMs)
        : 0,
  };
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 1
    ? sortedValues[middleIndex]
    : (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
}
