import { describe, expect, it } from 'vitest';
import { ForearmRadiusEstimator } from './ForearmRadiusEstimator';

describe('ForearmRadiusEstimator', () => {
  it('uses anatomical radii until a mask sample is available', () => {
    const estimator = new ForearmRadiusEstimator();

    const result = estimator.update(null, 2, 0);

    expect(result.source).toBe('anatomical');
    expect(result.radii).toEqual({
      wrist: { radial: 0.21, tangent: 0.17 },
      elbow: { radial: 0.3, tangent: 0.24 },
    });
  });

  it('converts mask ratios to tapered world-space ellipse radii', () => {
    const estimator = new ForearmRadiusEstimator();

    const result = estimator.update(sample(0.12, 0.18), 2, 0);

    expect(result.source).toBe('mask');
    expect(result.radii.wrist.radial).toBeCloseTo(0.24);
    expect(result.radii.elbow.radial).toBeCloseTo(0.36);
    expect(result.radii.wrist.tangent / result.radii.wrist.radial).toBeCloseTo(
      0.085 / 0.105,
    );
  });

  it('smooths mask noise instead of copying a width pulse', () => {
    const estimator = new ForearmRadiusEstimator({
      smoothingTimeConstantMs: 450,
    });
    estimator.update(sample(0.1, 0.15), 1, 0);

    const result = estimator.update(sample(0.2, 0.25), 1, 50);

    expect(result.wristRadiusRatio).toBeGreaterThan(0.1);
    expect(result.wristRadiusRatio).toBeLessThan(0.12);
    expect(result.elbowRadiusRatio).toBeGreaterThan(0.15);
    expect(result.elbowRadiusRatio).toBeLessThan(0.17);
  });

  it('holds a missing mask briefly, then returns smoothly to anatomy', () => {
    const estimator = new ForearmRadiusEstimator({
      smoothingTimeConstantMs: 500,
      holdDurationMs: 750,
    });
    const measured = estimator.update(sample(0.16, 0.22), 1, 0);

    const held = estimator.update(null, 1, 500);
    const fallback = estimator.update(null, 1, 1_000);

    expect(held.source).toBe('held-mask');
    expect(held.wristRadiusRatio).toBeCloseTo(measured.wristRadiusRatio);
    expect(fallback.source).toBe('anatomical');
    expect(fallback.wristRadiusRatio).toBeGreaterThan(0.105);
    expect(fallback.wristRadiusRatio).toBeLessThan(held.wristRadiusRatio);
  });

  it('rejects low-confidence samples and clears held state on reset', () => {
    const estimator = new ForearmRadiusEstimator();
    estimator.update(sample(0.16, 0.22), 1, 0);
    estimator.reset();

    const result = estimator.update(sample(0.2, 0.25, 0.2), 1, 50);

    expect(result.source).toBe('anatomical');
    expect(result.wristRadiusRatio).toBe(0.105);
  });
});

function sample(wrist: number, elbow: number, confidence = 0.9) {
  return {
    wristRadiusRatio: wrist,
    elbowRadiusRatio: elbow,
    confidence,
  };
}
