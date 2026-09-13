import { describe, expect, it } from 'vitest';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import type { ForearmRadiusEstimate } from '../surfaces/forearm/ForearmRadiusEstimator';
import { ForearmFeasibilityMonitor } from './ForearmFeasibilityMonitor';

describe('ForearmFeasibilityMonitor', () => {
  it('tracks continuous roll range and largest adjacent step', () => {
    const monitor = new ForearmFeasibilityMonitor();
    for (const [index, degrees] of [-45, -30, 0, 30, 45].entries()) {
      monitor.record(index * 50, frame(degrees), radius(0.1, 0.15));
    }

    const result = monitor.snapshot();

    expect(result.currentRollDegrees).toBeCloseTo(45);
    expect(result.rollRangeDegrees).toBeCloseTo(90);
    expect(result.maximumRollStepDegrees).toBeCloseTo(30);
    expect(result.flipCount).toBe(0);
  });

  it('counts an abrupt axial orientation flip', () => {
    const monitor = new ForearmFeasibilityMonitor();
    monitor.record(0, frame(0), radius(0.1, 0.15));
    monitor.record(50, frame(170), radius(0.1, 0.15));

    expect(monitor.snapshot().flipCount).toBe(1);
  });

  it('reports relative radius drift over only the latest five seconds', () => {
    const monitor = new ForearmFeasibilityMonitor();
    monitor.record(0, frame(0), radius(0.3, 0.3));
    monitor.record(1_000, frame(0), radius(0.1, 0.15));
    monitor.record(6_000, frame(0), radius(0.11, 0.15));

    const result = monitor.snapshot();

    expect(result.radiusWindowMs).toBe(5_000);
    expect(result.wristRadiusDriftPercent).toBeCloseTo(9.5238, 3);
    expect(result.elbowRadiusDriftPercent).toBe(0);
  });

  it('ages out radius samples and clears the session on reset', () => {
    const monitor = new ForearmFeasibilityMonitor();
    monitor.record(0, frame(45), radius(0.1, 0.15));

    expect(monitor.snapshot(6_000).radiusWindowMs).toBe(0);
    monitor.reset();

    expect(monitor.snapshot()).toEqual({
      currentRollDegrees: 0,
      rollRangeDegrees: 0,
      maximumRollStepDegrees: 0,
      flipCount: 0,
      radiusWindowMs: 0,
      wristRadiusDriftPercent: 0,
      elbowRadiusDriftPercent: 0,
    });
  });
});

function frame(rollDegrees: number): ForearmLocalFrame {
  return {
    origin: { x: 0, y: 0, z: 0 },
    axis: { x: 0, y: 1, z: 0 },
    radial: { x: 1, y: 0, z: 0 },
    tangent: { x: 0, y: 0, z: -1 },
    length: 1,
    rollRadians: (rollDegrees * Math.PI) / 180,
    rollConfidence: 1,
    orientationSource: 'hand',
  };
}

function radius(
  wristRadiusRatio: number,
  elbowRadiusRatio: number,
): ForearmRadiusEstimate {
  return {
    radii: {
      wrist: { radial: wristRadiusRatio, tangent: wristRadiusRatio },
      elbow: { radial: elbowRadiusRatio, tangent: elbowRadiusRatio },
    },
    source: 'mask',
    confidence: 1,
    wristRadiusRatio,
    elbowRadiusRatio,
  };
}
