import { describe, expect, it } from 'vitest';
import type { TrackingMetricsSnapshot } from './TrackingMetrics';
import {
  evaluatePerformanceBudget,
  type PerformanceBudgetTargets,
} from './PerformanceBudget';

const testTargets: PerformanceBudgetTargets = {
  minimumTrackingFps: 15,
  minimumRenderFps: 30,
  minimumSamples: 3,
  sampleWindow: 3,
};

describe('evaluatePerformanceBudget', () => {
  it('collects enough valid samples before reporting a result', () => {
    const result = evaluatePerformanceBudget(
      [sample(0, 0, 0), sample(1_000, 16, 60), sample(2_000, 17, 60)],
      testTargets,
    );

    expect(result).toMatchObject({
      status: 'collecting',
      sampleCount: 2,
      trackingPassed: null,
      renderPassed: null,
    });
  });

  it('uses medians so one slow sample does not fail a stable run', () => {
    const result = evaluatePerformanceBudget(
      [sample(1_000, 15, 31), sample(2_000, 2, 5), sample(3_000, 17, 60)],
      testTargets,
    );

    expect(result).toMatchObject({
      status: 'pass',
      sampleCount: 3,
      inferenceMedianMs: 30,
      trackingMedianFps: 15,
      renderMedianFps: 31,
      trackingPassed: true,
      renderPassed: true,
      windowDurationMs: 2_000,
    });
  });

  it('reports which median misses its target', () => {
    const result = evaluatePerformanceBudget(
      [sample(1_000, 14, 45), sample(2_000, 13, 50), sample(3_000, 16, 55)],
      testTargets,
    );

    expect(result).toMatchObject({
      status: 'fail',
      trackingMedianFps: 14,
      renderMedianFps: 50,
      trackingPassed: false,
      renderPassed: true,
    });
  });

  it('evaluates only the newest bounded sample window', () => {
    const result = evaluatePerformanceBudget(
      [
        sample(0, 1, 1),
        sample(1_000, 15, 30),
        sample(2_000, 16, 31),
        sample(3_000, 17, 32),
      ],
      testTargets,
    );

    expect(result).toMatchObject({
      status: 'pass',
      trackingMedianFps: 16,
      renderMedianFps: 31,
      windowDurationMs: 2_000,
    });
  });
});

function sample(
  timestampMs: number,
  resultsPerSecond: number,
  rendersPerSecond: number,
) {
  const metrics: TrackingMetricsSnapshot = {
    inferenceMs: 30,
    resultsPerSecond,
    rendersPerSecond,
    droppedFrames: 0,
    confidence: 0.9,
    poseAgeMs: 10,
    trackingState: 'tracking',
  };
  return { timestampMs, ...metrics };
}
