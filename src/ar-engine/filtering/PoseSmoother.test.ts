import { describe, expect, it } from 'vitest';
import type { PoseFrame, PosePoint } from '../contracts';
import { PoseSmoother } from './PoseSmoother';

describe('PoseSmoother', () => {
  it('keeps the first pose unchanged', () => {
    const smoother = new PoseSmoother();
    const frame = poseFrame(0, point(0.25));

    expect(smoother.smooth(frame).landmarks).toEqual(frame.landmarks);
  });

  it('attenuates landmark jitter without changing visibility', () => {
    const smoother = new PoseSmoother({
      image: { minCutoff: 1, beta: 0 },
      world: { minCutoff: 1, beta: 0 },
    });
    smoother.smooth(poseFrame(0, point(0.5, 0.8)));

    const smoothed = smoother.smooth(poseFrame(50, point(0.6, 0.4)));

    expect(smoothed.landmarks[0]?.image.x).toBeGreaterThan(0.5);
    expect(smoothed.landmarks[0]?.image.x).toBeLessThan(0.6);
    expect(smoothed.landmarks[0]?.visibility).toBe(0.4);
  });

  it('retains filter state across a temporary empty result', () => {
    const smoother = new PoseSmoother({
      image: { minCutoff: 1, beta: 0 },
      world: { minCutoff: 1, beta: 0 },
    });
    smoother.smooth(poseFrame(0, point(0)));
    expect(smoother.smooth(poseFrame(50)).landmarks).toHaveLength(0);

    const reacquired = smoother.smooth(poseFrame(100, point(1)));

    expect(reacquired.landmarks[0]?.image.x).toBeGreaterThan(0);
    expect(reacquired.landmarks[0]?.image.x).toBeLessThan(1);
  });
});

function poseFrame(timestampMs: number, ...landmarks: PosePoint[]): PoseFrame {
  return { frameId: 1, timestampMs, landmarks, inferenceMs: 5 };
}

function point(value: number, visibility = 1): PosePoint {
  return {
    image: { x: value, y: value, z: value },
    world: { x: value, y: value, z: value },
    visibility,
  };
}
