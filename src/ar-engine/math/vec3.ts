import type { Vec3 } from '../contracts';

const epsilon = 1e-8;

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(vector: Vec3, factor: number): Vec3 {
  return {
    x: vector.x * factor,
    y: vector.y * factor,
    z: vector.z * factor,
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vectorLength(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function normalize(vector: Vec3): Vec3 | null {
  const length = vectorLength(vector);
  return length > epsilon ? scale(vector, 1 / length) : null;
}

export function projectOnPlane(vector: Vec3, normal: Vec3): Vec3 {
  return subtract(vector, scale(normal, dot(vector, normal)));
}

export function negate(vector: Vec3): Vec3 {
  return scale(vector, -1);
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return scale(add(a, b), 0.5);
}
