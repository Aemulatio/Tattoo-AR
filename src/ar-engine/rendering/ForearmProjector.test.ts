import { describe, expect, it } from 'vitest';
import type { PoseFrame, PosePoint } from '../contracts';
import { ViewportTransform } from '../camera/ViewportTransform';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import { PoseLandmark } from '../tracking/landmark-indices';
import { ForearmProjector } from './ForearmProjector';

const localFrame: ForearmLocalFrame = {
  origin: { x: 0, y: 0, z: 0 },
  axis: { x: 0, y: 1, z: 0 },
  radial: { x: 1, y: 0, z: 0 },
  tangent: { x: 0, y: 0, z: -1 },
  length: 2,
  rollRadians: 0,
  rollConfidence: 1,
  orientationSource: 'hand',
};

describe('ForearmProjector', () => {
  it('pins the world-space wrist and elbow to their image landmarks', () => {
    const projector = createProjector(false);

    expect(projector.project(localFrame.origin).source).toEqual({
      x: 25,
      y: 75,
    });
    expect(projector.project({ x: 0, y: 2, z: 0 }).source).toEqual({
      x: 25,
      y: 25,
    });
  });

  it('applies display mirroring only through ViewportTransform', () => {
    const normal = createProjector(false).project({ x: 0.2, y: 1, z: 0 });
    const mirrored = createProjector(true).project({ x: 0.2, y: 1, z: 0 });

    expect(normal.source).toEqual(mirrored.source);
    expect(normal.display).toEqual({ x: 30, y: 50 });
    expect(mirrored.display).toEqual({ x: 70, y: 50 });
    expect(normal.ndc.x).toBeCloseTo(-mirrored.ndc.x);
  });

  it('preserves camera-facing depth and normal evidence', () => {
    const projected = createProjector(false).project(
      { x: 0, y: 1, z: -0.2 },
      { x: 0, y: 0, z: -1 },
    );

    expect(projected.depth).toBeCloseTo(0.1);
    expect(projected.facing).toBe(1);
  });

  it('keeps depth monotonic instead of flattening foreshortened geometry', () => {
    const projector = createProjector(false);

    expect(projector.project({ x: 0, y: 1, z: -1 }).depth).toBeCloseTo(0.5);
    expect(projector.project({ x: 0, y: 1, z: -2 }).depth).toBeCloseTo(1);
  });
});

function createProjector(mirrored: boolean): ForearmProjector {
  const source = { width: 100, height: 100 };
  return new ForearmProjector(
    poseFrame(),
    'left',
    localFrame,
    new ViewportTransform({
      source,
      display: source,
      fit: 'cover',
      mirrored,
    }),
    source,
  );
}

function poseFrame(): PoseFrame {
  const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
  landmarks[PoseLandmark.leftWrist] = point(0.25, 0.75);
  landmarks[PoseLandmark.leftElbow] = point(0.25, 0.25);
  return {
    frameId: 1,
    timestampMs: 10,
    landmarks,
    inferenceMs: 1,
  };
}

function point(x: number, y: number): PosePoint {
  return {
    image: { x, y, z: 0 },
    world: { x: 0, y: 0, z: 0 },
    visibility: 1,
  };
}
