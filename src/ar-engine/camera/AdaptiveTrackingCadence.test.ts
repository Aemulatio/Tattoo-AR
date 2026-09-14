import { describe, expect, it } from 'vitest';
import { AdaptiveTrackingCadence } from './AdaptiveTrackingCadence';

describe('AdaptiveTrackingCadence', () => {
  it('reduces work as inference cost rises and recovers with hysteresis', () => {
    const cadence = new AdaptiveTrackingCadence({
      warmupSamples: 1,
      smoothingFactor: 1,
    });

    expect(cadence.snapshot()).toMatchObject({
      level: 'quality',
      targetFramesPerSecond: 20,
    });
    expect(cadence.recordInference(45)).toMatchObject({
      level: 'balanced',
      targetFramesPerSecond: 17,
    });
    expect(cadence.recordInference(65)).toMatchObject({
      level: 'reduced',
      targetFramesPerSecond: 15,
    });
    expect(cadence.recordInference(50).level).toBe('reduced');
    expect(cadence.recordInference(45).level).toBe('balanced');
    expect(cadence.recordInference(31).level).toBe('quality');
  });

  it('ignores invalid samples and resets to the quality baseline', () => {
    const cadence = new AdaptiveTrackingCadence({
      warmupSamples: 1,
      smoothingFactor: 1,
    });
    cadence.recordInference(70);

    expect(cadence.recordInference(Number.NaN).level).toBe('reduced');
    cadence.reset();
    expect(cadence.snapshot()).toEqual({
      level: 'quality',
      targetFramesPerSecond: 20,
      smoothedInferenceMs: 0,
    });
  });

  it('uses the warmup median so a cold-start spike does not poison adaptation', () => {
    const cadence = new AdaptiveTrackingCadence({
      warmupSamples: 5,
    });

    expect(cadence.recordInference(200).level).toBe('quality');
    cadence.recordInference(30);
    cadence.recordInference(31);
    cadence.recordInference(29);
    expect(cadence.recordInference(30)).toMatchObject({
      level: 'quality',
      smoothedInferenceMs: 30,
    });
  });
});
