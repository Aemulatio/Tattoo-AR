import { describe, expect, it } from 'vitest';
import type { ForearmLocalFrame } from './ForearmFrameEstimator';
import {
  anatomicalFallbackRadii,
  ForearmGeometry,
  sampleForearmSurface,
  type ForearmRadii,
} from './ForearmGeometry';

const frame: ForearmLocalFrame = {
  origin: { x: 1, y: 2, z: 3 },
  axis: { x: 0, y: 1, z: 0 },
  radial: { x: 1, y: 0, z: 0 },
  tangent: { x: 0, y: 0, z: -1 },
  length: 2,
  rollRadians: 0,
  rollConfidence: 1,
  orientationSource: 'hand',
};
const radii: ForearmRadii = {
  wrist: { radial: 0.2, tangent: 0.1 },
  elbow: { radial: 0.4, tangent: 0.3 },
};

describe('ForearmGeometry', () => {
  it('creates the ADR topology without rebuilding it on update', () => {
    const mesh = new ForearmGeometry();
    const positions = mesh.geometry.getAttribute('position');
    const normals = mesh.geometry.getAttribute('normal');
    const index = mesh.geometry.getIndex();

    expect(positions.count).toBe(13 * 25);
    expect(index?.count).toBe(12 * 24 * 6);

    mesh.update(frame, radii);
    mesh.update({ ...frame, origin: { x: 4, y: 5, z: 6 } }, radii);

    expect(mesh.geometry.getAttribute('position')).toBe(positions);
    expect(mesh.geometry.getAttribute('normal')).toBe(normals);
    expect(mesh.geometry.getIndex()).toBe(index);
  });

  it('tapers an elliptical cross-section from wrist to elbow', () => {
    const mesh = new ForearmGeometry({
      longitudinalSegments: 1,
      radialSegments: 4,
      seamAngleRadians: 0,
    });
    const position = mesh.update(frame, radii).getAttribute('position');

    expect(vertex(position.array, 0)).toEqual([1.2, 2, 3]);
    expect(vertex(position.array, 1)).toEqual([1, 2, 2.9]);
    expect(vertex(position.array, 5)).toEqual([1.4, 4, 3]);
    expect(vertex(position.array, 6)).toEqual([1, 4, 2.7]);
  });

  it('duplicates a stable seam while spanning the full UV interval', () => {
    const mesh = new ForearmGeometry({
      longitudinalSegments: 1,
      radialSegments: 4,
      seamAngleRadians: Math.PI / 3,
    });
    const geometry = mesh.update(frame, radii);
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');

    expect(vertex(position.array, 0)).toEqual(vertex(position.array, 4));
    expect(uv.getX(0)).toBe(0);
    expect(uv.getY(0)).toBe(0);
    expect(uv.getX(4)).toBe(0);
    expect(uv.getY(4)).toBe(1);
    expect(uv.getX(5)).toBe(1);
  });

  it('writes unit normals for the elliptical surface', () => {
    const mesh = new ForearmGeometry({
      longitudinalSegments: 2,
      radialSegments: 8,
    });
    const normal = mesh.update(frame, radii).getAttribute('normal');

    for (let index = 0; index < normal.count; index += 1) {
      expect(
        Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index)),
      ).toBeCloseTo(1, 6);
    }
    expect(normal.getY(0)).toBeLessThan(0);
  });

  it('uses outward-facing triangle winding', () => {
    const mesh = new ForearmGeometry({
      longitudinalSegments: 1,
      radialSegments: 4,
      seamAngleRadians: 0,
    });
    const geometry = mesh.update(frame, radii);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    if (!index) throw new Error('expected indexed geometry');

    const a = vertex(position.array, index.getX(0));
    const b = vertex(position.array, index.getX(1));
    const c = vertex(position.array, index.getX(2));
    const faceNormal = cross(subtract(b, a), subtract(c, a));

    expect(
      dot(faceNormal, [normal.getX(0), normal.getY(0), normal.getZ(0)]),
    ).toBeGreaterThan(0);
  });

  it('samples the same body-local surface across the duplicated seam', () => {
    const start = sampleForearmSurface(frame, radii, 0.4, 0, Math.PI / 3);
    const end = sampleForearmSurface(frame, radii, 0.4, 1, Math.PI / 3);

    expectVector(end.position, start.position);
    expectVector(end.normal, start.normal);
    expectVector(end.longitudinalTangent, start.longitudinalTangent);
    expectVector(end.circumferentialTangent, start.circumferentialTangent);
  });

  it('provides a conservative anatomical fallback that scales with length', () => {
    expect(anatomicalFallbackRadii(2)).toEqual({
      wrist: { radial: 0.21, tangent: 0.17 },
      elbow: { radial: 0.3, tangent: 0.24 },
    });
    expect(() => anatomicalFallbackRadii(0)).toThrow(RangeError);
  });
});

function vertex(array: ArrayLike<number>, index: number): number[] {
  const offset = index * 3;
  return [array[offset], array[offset + 1], array[offset + 2]].map((value) =>
    Math.abs(value) < 1e-6 ? 0 : Number(value.toFixed(6)),
  );
}

function subtract(left: number[], right: number[]): number[] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function cross(left: number[], right: number[]): number[] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function dot(left: number[], right: number[]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function expectVector(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
  expect(actual.z).toBeCloseTo(expected.z, 8);
}
