import { describe, expect, it } from 'vitest';
import { TrackingMetrics } from './TrackingMetrics';

describe('TrackingMetrics', () => {
  it('reports the latest inference duration and dropped frames', () => {
    const metrics = new TrackingMetrics(0);
    metrics.recordDrop();
    const snapshot = metrics.recordResult(
      {
        frameId: 1,
        timestampMs: 10,
        landmarks: [],
        inferenceMs: 18.5,
      },
      100,
    );
    expect(snapshot.inferenceMs).toBe(18.5);
    expect(snapshot.droppedFrames).toBe(1);
  });

  it('reports tracking and render rates with confidence state', () => {
    const metrics = new TrackingMetrics(0);
    const frame = {
      frameId: 1,
      timestampMs: 900,
      landmarks: [],
      inferenceMs: 20,
    };
    metrics.recordResult(frame, 500);
    metrics.recordRender(500);
    metrics.recordResult(frame, 1000);
    metrics.recordRender(1000);
    metrics.recordTracking(0.75, 35, 'tracking');

    expect(metrics.snapshot()).toMatchObject({
      resultsPerSecond: 2,
      rendersPerSecond: 2,
      confidence: 0.75,
      poseAgeMs: 35,
      trackingState: 'tracking',
    });
  });
});
