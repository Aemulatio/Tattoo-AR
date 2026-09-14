import { describe, expect, it } from 'vitest';
import type { PoseFrame, PosePoint } from '../contracts';
import { ViewportTransform } from '../camera/ViewportTransform';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import { ForearmGeometry } from '../surfaces/forearm/ForearmGeometry';
import { PoseLandmark } from '../tracking/landmark-indices';
import { ForearmProjector } from './ForearmProjector';
import { ProjectedForearmGeometry } from './ProjectedForearmGeometry';

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

describe('ProjectedForearmGeometry', () => {
  it('reuses renderer buffers while projection changes', () => {
    const source = new ForearmGeometry({
      longitudinalSegments: 1,
      radialSegments: 4,
    });
    source.update(localFrame, {
      wrist: { radial: 0.2, tangent: 0.2 },
      elbow: { radial: 0.2, tangent: 0.2 },
    });
    const projected = new ProjectedForearmGeometry(source);
    const position = projected.geometry.getAttribute('position');
    const facing = projected.geometry.getAttribute('facing');
    const sourceUv = projected.geometry.getAttribute('sourceUv');

    projected.update(source, projector(false));
    const firstX = position.getX(0);
    const firstSourceX = sourceUv.getX(0);
    projected.update(source, projector(true));

    expect(projected.geometry.getAttribute('position')).toBe(position);
    expect(projected.geometry.getAttribute('facing')).toBe(facing);
    expect(projected.geometry.getAttribute('sourceUv')).toBe(sourceUv);
    expect(position.getX(0)).toBeCloseTo(-firstX);
    expect(sourceUv.getX(0)).toBeCloseTo(firstSourceX);
    expect(projected.ready).toBe(true);
  });
});

function projector(mirrored: boolean): ForearmProjector {
  const size = { width: 100, height: 100 };
  return new ForearmProjector(
    poseFrame(),
    'left',
    localFrame,
    new ViewportTransform({
      source: size,
      display: size,
      fit: 'cover',
      mirrored,
    }),
    size,
  );
}

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
