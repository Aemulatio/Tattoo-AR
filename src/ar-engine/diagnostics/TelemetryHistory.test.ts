import { describe, expect, it } from 'vitest';
import { TelemetryHistory } from './TelemetryHistory';

describe('TelemetryHistory', () => {
  it('keeps only the newest bounded samples', () => {
    const history = new TelemetryHistory(3);
    for (let timestampMs = 1; timestampMs <= 5; timestampMs += 1) {
      history.push(timestampMs, snapshot(timestampMs));
    }

    expect(history.samples().map((sample) => sample.timestampMs)).toEqual([
      3, 4, 5,
    ]);
  });

  it('clears retained samples', () => {
    const history = new TelemetryHistory();
    history.push(1, snapshot(1));

    history.clear();

    expect(history.samples()).toHaveLength(0);
  });
});

function snapshot(value: number) {
  return {
    inferenceMs: value,
    resultsPerSecond: value,
    rendersPerSecond: value,
    droppedFrames: value,
    confidence: value,
    poseAgeMs: value,
    trackingState: 'tracking' as const,
  };
}
