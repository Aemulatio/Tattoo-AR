import { describe, expect, it } from 'vitest';
import type { BodySide, PoseFrame, PosePoint, Vec3 } from '../../contracts';
import { dot, vectorLength } from '../../math/vec3';
import { PoseLandmark } from '../../tracking/landmark-indices';
import { ForearmFrameEstimator } from './ForearmFrameEstimator';

describe('ForearmFrameEstimator', () => {
  it('creates an orthonormal wrist-to-elbow frame', () => {
    const estimator = new ForearmFrameEstimator();

    const result = estimator.update(pose(), 'left');

    expect(result).not.toBeNull();
    expect(result?.length).toBeCloseTo(1);
    expect(vectorLength(result!.axis)).toBeCloseTo(1);
    expect(vectorLength(result!.radial)).toBeCloseTo(1);
    expect(vectorLength(result!.tangent)).toBeCloseTo(1);
    expect(dot(result!.axis, result!.radial)).toBeCloseTo(0);
    expect(dot(result!.axis, result!.tangent)).toBeCloseTo(0);
    expect(dot(result!.radial, result!.tangent)).toBeCloseTo(0);
  });

  it('follows translation and elbow bending', () => {
    const estimator = new ForearmFrameEstimator();
    const first = estimator.update(pose(), 'left')!;
    const moved = estimator.update(
      pose({ wrist: { x: 1, y: 1, z: 0 }, elbow: { x: 1.5, y: 2, z: 0 } }),
      'left',
    )!;

    expect(moved.origin).toEqual({ x: 1, y: 1, z: 0 });
    expect(moved.axis.x).toBeGreaterThan(first.axis.x);
    expect(dot(moved.axis, moved.radial)).toBeCloseTo(0);
  });

  it('changes roll continuously across a slow hand rotation', () => {
    const estimator = new ForearmFrameEstimator();
    let previous = estimator.update(pose({ rollDegrees: -45 }), 'left')!;

    for (const rollDegrees of [-30, -15, 0, 15, 30, 45]) {
      const current = estimator.update(pose({ rollDegrees }), 'left')!;
      expect(dot(previous.radial, current.radial)).toBeGreaterThan(0.9);
      expect(current.orientationSource).toBe('hand');
      previous = current;
    }
    expect(Math.abs(previous.rollRadians)).toBeCloseTo(Math.PI / 2);
  });

  it('transports the previous frame when hand landmarks disappear', () => {
    const estimator = new ForearmFrameEstimator();
    const handFrame = estimator.update(pose({ rollDegrees: 30 }), 'left')!;
    const lostHand = estimator.update(pose({ handVisibility: 0 }), 'left')!;

    expect(lostHand.orientationSource).toBe('transported');
    expect(dot(handFrame.radial, lostHand.radial)).toBeGreaterThan(0.99);
    expect(lostHand.rollRadians).toBeCloseTo(handFrame.rollRadians);
    expect(lostHand.rollConfidence).toBeLessThan(handFrame.rollConfidence);
  });

  it('uses a neutral orientation before hand evidence is available', () => {
    const estimator = new ForearmFrameEstimator();

    const result = estimator.update(pose({ handVisibility: 0 }), 'left');

    expect(result?.orientationSource).toBe('neutral');
    expect(result?.rollConfidence).toBe(0.15);
  });

  it('reads landmarks from the explicitly selected side', () => {
    const estimator = new ForearmFrameEstimator();
    const result = estimator.update(
      pose({ side: 'right', wrist: { x: 2, y: 0, z: 0 } }),
      'right',
    );

    expect(result?.origin.x).toBe(2);
  });
});

interface PoseOptions {
  side?: BodySide;
  wrist?: Vec3;
  elbow?: Vec3;
  rollDegrees?: number;
  handVisibility?: number;
}

function pose(options: PoseOptions = {}): PoseFrame {
  const side = options.side ?? 'left';
  const wrist = options.wrist ?? { x: 0, y: 0, z: 0 };
  const elbow = options.elbow ?? { x: 0, y: 1, z: 0 };
  const radians = ((options.rollDegrees ?? 0) * Math.PI) / 180;
  const radial = { x: Math.cos(radians), y: 0, z: Math.sin(radians) };
  const handVisibility = options.handVisibility ?? 1;
  const landmarks = Array.from({ length: 23 }, () => point());
  const indices =
    side === 'left'
      ? {
          wrist: PoseLandmark.leftWrist,
          elbow: PoseLandmark.leftElbow,
          index: PoseLandmark.leftIndex,
          pinky: PoseLandmark.leftPinky,
        }
      : {
          wrist: PoseLandmark.rightWrist,
          elbow: PoseLandmark.rightElbow,
          index: PoseLandmark.rightIndex,
          pinky: PoseLandmark.rightPinky,
        };
  landmarks[indices.wrist] = point(wrist, 1);
  landmarks[indices.elbow] = point(elbow, 1);
  landmarks[indices.index] = point(
    {
      x: wrist.x + radial.x * 0.1,
      y: wrist.y + radial.y * 0.1,
      z: wrist.z + radial.z * 0.1,
    },
    handVisibility,
  );
  landmarks[indices.pinky] = point(
    {
      x: wrist.x - radial.x * 0.1,
      y: wrist.y - radial.y * 0.1,
      z: wrist.z - radial.z * 0.1,
    },
    handVisibility,
  );
  return { frameId: 1, timestampMs: 0, landmarks, inferenceMs: 5 };
}

function point(world: Vec3 = { x: 0, y: 0, z: 0 }, visibility = 0): PosePoint {
  return {
    image: { x: world.x, y: world.y, z: world.z },
    world,
    visibility,
  };
}
