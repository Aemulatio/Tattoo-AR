import { describe, expect, it } from 'vitest';
import { TrackingMetrics } from './TrackingMetrics';

describe('TrackingMetrics', () => {
  it('reports the latest inference duration and dropped frames', () => {
    const metrics = new TrackingMetrics();
    metrics.recordDrop();
    const snapshot = metrics.recordResult({
      frameId: 1,
      timestampMs: 10,
      landmarks: [],
      inferenceMs: 18.5,
    });
    expect(snapshot.inferenceMs).toBe(18.5);
    expect(snapshot.droppedFrames).toBe(1);
  });
});
