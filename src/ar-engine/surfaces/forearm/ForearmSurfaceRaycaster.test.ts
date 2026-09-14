import { describe, expect, it } from 'vitest';
import type { PoseFrame, PosePoint } from '../../contracts';
import { ViewportTransform } from '../../camera/ViewportTransform';
import { ForearmProjector } from '../../rendering/ForearmProjector';
import { ProjectedForearmGeometry } from '../../rendering/ProjectedForearmGeometry';
import type { ForearmLocalFrame } from './ForearmFrameEstimator';
import { ForearmGeometry } from './ForearmGeometry';
import { ForearmSurfaceRaycaster } from './ForearmSurfaceRaycaster';
import { PoseLandmark } from '../../tracking/landmark-indices';

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

describe('ForearmSurfaceRaycaster', () => {
  it('returns body-local UVs from the visible projected surface', () => {
    const size = { width: 100, height: 100 };
    const transform = new ViewportTransform({
      source: size,
      display: size,
      fit: 'cover',
    });
    const source = new ForearmGeometry();
    source.update(localFrame, {
      wrist: { radial: 0.3, tangent: 0.3 },
      elbow: { radial: 0.3, tangent: 0.3 },
    });
    const projected = new ProjectedForearmGeometry(source);
    projected.update(
      source,
      new ForearmProjector(poseFrame(), 'left', localFrame, transform, size),
    );
    const raycaster = new ForearmSurfaceRaycaster(projected);

    const hit = raycaster.hitTest({ x: 50, y: 50 }, transform);

    expect(hit?.region).toBe('leftForearm');
    expect(hit?.uv.x).toBeCloseTo(0.5, 1);
    expect(hit?.uv.y).toBeGreaterThanOrEqual(0);
    expect(hit?.uv.y).toBeLessThan(1);
    expect(raycaster.hitTest({ x: 5, y: 5 }, transform)).toBeNull();
  });
});

function poseFrame(): PoseFrame {
  const landmarks = Array.from({ length: 33 }, () => point(0.5, 0.5));
  landmarks[PoseLandmark.leftWrist] = point(0.5, 0.75);
  landmarks[PoseLandmark.leftElbow] = point(0.5, 0.25);
  return { frameId: 1, timestampMs: 1, landmarks, inferenceMs: 1 };
}

function point(x: number, y: number): PosePoint {
  return {
    image: { x, y, z: 0 },
    world: { x: 0, y: 0, z: 0 },
    visibility: 1,
  };
}
