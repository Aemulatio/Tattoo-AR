import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import type { Vec3 } from '../../contracts';
import type { ForearmLocalFrame } from './ForearmFrameEstimator';

export interface EllipseRadii {
  radial: number;
  tangent: number;
}

export interface ForearmRadii {
  wrist: EllipseRadii;
  elbow: EllipseRadii;
}

export interface ForearmSurfaceSample {
  position: Vec3;
  normal: Vec3;
  longitudinalTangent: Vec3;
  circumferentialTangent: Vec3;
}

export interface ForearmGeometryOptions {
  longitudinalSegments?: number;
  radialSegments?: number;
  seamAngleRadians?: number;
}

export const defaultForearmGeometrySegments = {
  longitudinal: 12,
  radial: 24,
} as const;

/**
 * Owns one mutable mesh. Topology and typed arrays are allocated once; only
 * position and normal values change as the tracked forearm moves.
 */
export class ForearmGeometry {
  readonly geometry: BufferGeometry;
  readonly longitudinalSegments: number;
  readonly radialSegments: number;
  readonly seamAngleRadians: number;

  private readonly positions: Float32Array;
  private readonly normals: Float32Array;

  constructor(options: ForearmGeometryOptions = {}) {
    this.longitudinalSegments =
      options.longitudinalSegments ??
      defaultForearmGeometrySegments.longitudinal;
    this.radialSegments =
      options.radialSegments ?? defaultForearmGeometrySegments.radial;
    this.seamAngleRadians = options.seamAngleRadians ?? Math.PI;
    assertSegmentCount('longitudinalSegments', this.longitudinalSegments, 1);
    assertSegmentCount('radialSegments', this.radialSegments, 3);

    const vertexCount =
      (this.longitudinalSegments + 1) * (this.radialSegments + 1);
    this.positions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);

    const positionAttribute = new BufferAttribute(this.positions, 3);
    const normalAttribute = new BufferAttribute(this.normals, 3);
    positionAttribute.setUsage(DynamicDrawUsage);
    normalAttribute.setUsage(DynamicDrawUsage);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', positionAttribute);
    this.geometry.setAttribute('normal', normalAttribute);
    this.geometry.setAttribute('uv', new BufferAttribute(this.createUvs(), 2));
    this.geometry.setIndex(new BufferAttribute(this.createIndices(), 1));
  }

  update(frame: ForearmLocalFrame, radii: ForearmRadii): BufferGeometry {
    if (!Number.isFinite(frame.length) || frame.length <= 0) {
      throw new RangeError(
        'forearm frame length must be a positive finite number',
      );
    }
    assertRadii(radii);
    const positionAttribute = this.geometry.getAttribute('position');
    const normalAttribute = this.geometry.getAttribute('normal');
    const ringSize = this.radialSegments + 1;
    const radialSlope =
      (radii.elbow.radial - radii.wrist.radial) / frame.length;
    const tangentSlope =
      (radii.elbow.tangent - radii.wrist.tangent) / frame.length;

    for (
      let longitudinalIndex = 0;
      longitudinalIndex <= this.longitudinalSegments;
      longitudinalIndex += 1
    ) {
      const u = longitudinalIndex / this.longitudinalSegments;
      const center = addScaled(frame.origin, frame.axis, frame.length * u);
      const radialRadius = lerp(radii.wrist.radial, radii.elbow.radial, u);
      const tangentRadius = lerp(radii.wrist.tangent, radii.elbow.tangent, u);

      for (
        let radialIndex = 0;
        radialIndex <= this.radialSegments;
        radialIndex += 1
      ) {
        const angle =
          this.seamAngleRadians +
          (radialIndex / this.radialSegments) * Math.PI * 2;
        const radialFactor = Math.cos(angle);
        const tangentFactor = Math.sin(angle);
        const vertexIndex = longitudinalIndex * ringSize + radialIndex;
        const offset = vertexIndex * 3;

        this.positions[offset] =
          center.x +
          frame.radial.x * radialRadius * radialFactor +
          frame.tangent.x * tangentRadius * tangentFactor;
        this.positions[offset + 1] =
          center.y +
          frame.radial.y * radialRadius * radialFactor +
          frame.tangent.y * tangentRadius * tangentFactor;
        this.positions[offset + 2] =
          center.z +
          frame.radial.z * radialRadius * radialFactor +
          frame.tangent.z * tangentRadius * tangentFactor;

        writeEllipseNormal(
          this.normals,
          offset,
          frame,
          radialFactor / radialRadius,
          tangentFactor / tangentRadius,
          -(
            (radialFactor * radialFactor * radialSlope) / radialRadius +
            (tangentFactor * tangentFactor * tangentSlope) / tangentRadius
          ),
        );
      }
    }

    positionAttribute.needsUpdate = true;
    normalAttribute.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    return this.geometry;
  }

  dispose(): void {
    this.geometry.dispose();
  }

  private createUvs(): Float32Array {
    const uvs = new Float32Array(
      (this.longitudinalSegments + 1) * (this.radialSegments + 1) * 2,
    );
    let offset = 0;
    for (
      let longitudinalIndex = 0;
      longitudinalIndex <= this.longitudinalSegments;
      longitudinalIndex += 1
    ) {
      for (
        let radialIndex = 0;
        radialIndex <= this.radialSegments;
        radialIndex += 1
      ) {
        uvs[offset] = longitudinalIndex / this.longitudinalSegments;
        uvs[offset + 1] = radialIndex / this.radialSegments;
        offset += 2;
      }
    }
    return uvs;
  }

  private createIndices(): Uint16Array | Uint32Array {
    const vertexCount =
      (this.longitudinalSegments + 1) * (this.radialSegments + 1);
    const indices =
      vertexCount <= 65_535
        ? new Uint16Array(this.longitudinalSegments * this.radialSegments * 6)
        : new Uint32Array(this.longitudinalSegments * this.radialSegments * 6);
    const ringSize = this.radialSegments + 1;
    let offset = 0;

    for (
      let longitudinalIndex = 0;
      longitudinalIndex < this.longitudinalSegments;
      longitudinalIndex += 1
    ) {
      for (
        let radialIndex = 0;
        radialIndex < this.radialSegments;
        radialIndex += 1
      ) {
        const a = longitudinalIndex * ringSize + radialIndex;
        const b = a + ringSize;
        indices[offset] = a;
        indices[offset + 1] = a + 1;
        indices[offset + 2] = b;
        indices[offset + 3] = b;
        indices[offset + 4] = a + 1;
        indices[offset + 5] = b + 1;
        offset += 6;
      }
    }
    return indices;
  }
}

export function anatomicalFallbackRadii(forearmLength: number): ForearmRadii {
  if (!Number.isFinite(forearmLength) || forearmLength <= 0) {
    throw new RangeError('forearmLength must be a positive finite number');
  }
  return {
    wrist: {
      radial: forearmLength * 0.105,
      tangent: forearmLength * 0.085,
    },
    elbow: {
      radial: forearmLength * 0.15,
      tangent: forearmLength * 0.12,
    },
  };
}

export function sampleForearmSurface(
  frame: ForearmLocalFrame,
  radii: ForearmRadii,
  u: number,
  v: number,
  seamAngleRadians = Math.PI,
): ForearmSurfaceSample {
  if (!Number.isFinite(u) || !Number.isFinite(v)) {
    throw new RangeError('forearm surface coordinates must be finite');
  }
  if (!Number.isFinite(frame.length) || frame.length <= 0) {
    throw new RangeError(
      'forearm frame length must be a positive finite number',
    );
  }
  assertRadii(radii);

  const angle = seamAngleRadians + v * Math.PI * 2;
  const radialFactor = Math.cos(angle);
  const tangentFactor = Math.sin(angle);
  const radialRadius = lerp(radii.wrist.radial, radii.elbow.radial, u);
  const tangentRadius = lerp(radii.wrist.tangent, radii.elbow.tangent, u);
  const radialSlope = radii.elbow.radial - radii.wrist.radial;
  const tangentSlope = radii.elbow.tangent - radii.wrist.tangent;
  const center = addScaled(frame.origin, frame.axis, frame.length * u);
  const position = add(
    center,
    addScaledVector(
      scale(frame.radial, radialRadius * radialFactor),
      frame.tangent,
      tangentRadius * tangentFactor,
    ),
  );
  const normal = normalizeVector(
    add(
      addScaledVector(
        scale(frame.radial, radialFactor / radialRadius),
        frame.tangent,
        tangentFactor / tangentRadius,
      ),
      scale(
        frame.axis,
        -(
          (radialFactor * radialFactor * radialSlope) /
            (radialRadius * frame.length) +
          (tangentFactor * tangentFactor * tangentSlope) /
            (tangentRadius * frame.length)
        ),
      ),
    ),
  );
  const longitudinalTangent = normalizeVector(
    add(
      scale(frame.axis, frame.length),
      addScaledVector(
        scale(frame.radial, radialSlope * radialFactor),
        frame.tangent,
        tangentSlope * tangentFactor,
      ),
    ),
  );
  const circumferentialTangent = normalizeVector(
    addScaledVector(
      scale(frame.radial, -radialRadius * tangentFactor),
      frame.tangent,
      tangentRadius * radialFactor,
    ),
  );

  return {
    position,
    normal,
    longitudinalTangent,
    circumferentialTangent,
  };
}

function writeEllipseNormal(
  target: Float32Array,
  offset: number,
  frame: ForearmLocalFrame,
  radialFactor: number,
  tangentFactor: number,
  axialFactor: number,
): void {
  const x =
    frame.radial.x * radialFactor +
    frame.tangent.x * tangentFactor +
    frame.axis.x * axialFactor;
  const y =
    frame.radial.y * radialFactor +
    frame.tangent.y * tangentFactor +
    frame.axis.y * axialFactor;
  const z =
    frame.radial.z * radialFactor +
    frame.tangent.z * tangentFactor +
    frame.axis.z * axialFactor;
  const inverseLength = 1 / Math.hypot(x, y, z);
  target[offset] = x * inverseLength;
  target[offset + 1] = y * inverseLength;
  target[offset + 2] = z * inverseLength;
}

function addScaled(origin: Vec3, direction: Vec3, amount: number): Vec3 {
  return {
    x: origin.x + direction.x * amount,
    y: origin.y + direction.y * amount,
    z: origin.z + direction.z * amount,
  };
}

function add(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z,
  };
}

function addScaledVector(origin: Vec3, direction: Vec3, amount: number): Vec3 {
  return addScaled(origin, direction, amount);
}

function scale(vector: Vec3, amount: number): Vec3 {
  return {
    x: vector.x * amount,
    y: vector.y * amount,
    z: vector.z * amount,
  };
}

function normalizeVector(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < 1e-9) throw new RangeError('surface tangent is degenerate');
  return scale(vector, 1 / length);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function assertSegmentCount(
  name: string,
  value: number,
  minimum: number,
): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer of at least ${minimum}`);
  }
}

function assertRadii(radii: ForearmRadii): void {
  const values = [
    radii.wrist.radial,
    radii.wrist.tangent,
    radii.elbow.radial,
    radii.elbow.tangent,
  ];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError('forearm radii must be positive finite numbers');
  }
}
