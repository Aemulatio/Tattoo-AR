import type { BodyRegion, TattooAnchor } from '../contracts';

export const tattooAnchorSchemaVersion = 1 as const;
export const minimumTattooLongestDimension = 0.05;
export const maximumTattooLongestDimension = 0.8;
export const defaultTattooLongestDimension = 0.3;

export type TattooAnchorInput = Omit<TattooAnchor, 'schemaVersion'>;

export interface TattooAnchorConstraintResult {
  anchor: TattooAnchor;
  boundaryClamped: boolean;
}

export class InvalidTattooAnchorError extends TypeError {
  readonly issues: ReadonlyArray<string>;

  constructor(issues: ReadonlyArray<string>) {
    super(`Invalid tattoo anchor: ${issues.join(', ')}`);
    this.name = 'InvalidTattooAnchorError';
    this.issues = issues;
  }
}

export function createTattooAnchor(input: TattooAnchorInput): TattooAnchor {
  if (!Number.isFinite(input.u)) {
    throw new InvalidTattooAnchorError(['u must be within [0, 1]']);
  }

  const anchor: TattooAnchor = {
    schemaVersion: tattooAnchorSchemaVersion,
    region: input.region,
    u: Math.min(1, Math.max(0, input.u)),
    v: normalizeSurfaceV(input.v),
    width: input.width,
    height: input.height,
    rotation: normalizeRotation(input.rotation),
  };
  assertTattooAnchor(anchor);
  return anchor;
}

export function serializeTattooAnchor(anchor: TattooAnchor): string {
  assertTattooAnchor(anchor);
  return JSON.stringify(projectTattooAnchor(anchor));
}

export function parseTattooAnchor(serialized: string): TattooAnchor {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new InvalidTattooAnchorError(['expected valid JSON']);
  }
  assertTattooAnchor(value);
  return projectTattooAnchor(value);
}

export function isTattooAnchor(value: unknown): value is TattooAnchor {
  return tattooAnchorIssues(value).length === 0;
}

export function assertTattooAnchor(
  value: unknown,
): asserts value is TattooAnchor {
  const issues = tattooAnchorIssues(value);
  if (issues.length > 0) throw new InvalidTattooAnchorError(issues);
}

export function normalizeSurfaceV(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value >= 0 && value < 1) return value;
  return ((value % 1) + 1) % 1;
}

export function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value >= -Math.PI && value < Math.PI) return value;
  const fullTurn = Math.PI * 2;
  return ((((value + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI;
}

export function constrainTattooAnchorToSurface(
  anchor: TattooAnchor,
): TattooAnchorConstraintResult {
  assertTattooAnchor(anchor);
  const axialWidth = Math.abs(Math.sin(anchor.rotation)) * anchor.width;
  const axialHeight = Math.abs(Math.cos(anchor.rotation)) * anchor.height;
  const largestAxialDimension = Math.max(axialWidth, axialHeight);
  const axialHalfExtent =
    largestAxialDimension === 0
      ? 0
      : largestAxialDimension *
        ((axialWidth / largestAxialDimension +
          axialHeight / largestAxialDimension) /
          2);
  const sizeScale = axialHalfExtent > 0.5 ? 0.5 / axialHalfExtent : 1;
  const width = Math.max(Number.MIN_VALUE, anchor.width * sizeScale);
  const height = Math.max(Number.MIN_VALUE, anchor.height * sizeScale);
  const constrainedHalfExtent = Math.min(0.5, axialHalfExtent * sizeScale);
  const u = Math.min(
    1 - constrainedHalfExtent,
    Math.max(constrainedHalfExtent, anchor.u),
  );
  const constrained = { ...anchor, u, width, height };
  assertTattooAnchor(constrained);
  return {
    anchor: constrained,
    boundaryClamped:
      u !== anchor.u || width !== anchor.width || height !== anchor.height,
  };
}

export function tattooSizeForAspectRatio(
  aspectRatio: number,
  longestDimension = defaultTattooLongestDimension,
): Pick<TattooAnchor, 'width' | 'height'> {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError('Tattoo aspect ratio must be positive and finite');
  }
  if (!Number.isFinite(longestDimension) || longestDimension <= 0) {
    throw new RangeError('Tattoo size must be positive and finite');
  }
  const longest = Math.min(
    maximumTattooLongestDimension,
    Math.max(minimumTattooLongestDimension, longestDimension),
  );
  return aspectRatio >= 1
    ? { width: longest, height: longest / aspectRatio }
    : { width: longest * aspectRatio, height: longest };
}

export function resizeTattooAnchor(
  anchor: TattooAnchor,
  longestDimension: number,
): TattooAnchorConstraintResult {
  assertTattooAnchor(anchor);
  if (!Number.isFinite(longestDimension) || longestDimension <= 0) {
    throw new RangeError('Tattoo size must be positive and finite');
  }
  const currentLongest = Math.max(anchor.width, anchor.height);
  const requestedLongest = Math.min(
    maximumTattooLongestDimension,
    Math.max(minimumTattooLongestDimension, longestDimension),
  );
  const scale = requestedLongest / currentLongest;
  return constrainTattooAnchorToSurface(
    createTattooAnchor({
      ...anchor,
      width: anchor.width * scale,
      height: anchor.height * scale,
    }),
  );
}

export function rotateTattooAnchor(
  anchor: TattooAnchor,
  rotation: number,
): TattooAnchorConstraintResult {
  assertTattooAnchor(anchor);
  return constrainTattooAnchorToSurface(
    createTattooAnchor({ ...anchor, rotation }),
  );
}

export function resetTattooAnchorTransform(
  anchor: TattooAnchor,
  aspectRatio: number,
): TattooAnchorConstraintResult {
  assertTattooAnchor(anchor);
  return constrainTattooAnchorToSurface(
    createTattooAnchor({
      ...anchor,
      ...tattooSizeForAspectRatio(aspectRatio),
      rotation: 0,
    }),
  );
}

function tattooAnchorIssues(value: unknown): string[] {
  if (!isRecord(value)) return ['expected an object'];

  const issues: string[] = [];
  if (value.schemaVersion !== tattooAnchorSchemaVersion) {
    issues.push(`schemaVersion must be ${tattooAnchorSchemaVersion}`);
  }
  if (!isBodyRegion(value.region)) {
    issues.push('region must be leftForearm or rightForearm');
  }
  if (!isNumberInRange(value.u, 0, 1, true)) {
    issues.push('u must be within [0, 1]');
  }
  if (!isNumberInRange(value.v, 0, 1, false)) {
    issues.push('v must be within [0, 1)');
  }
  if (!isPositiveSize(value.width)) {
    issues.push('width must be positive and finite');
  }
  if (!isPositiveSize(value.height)) {
    issues.push('height must be positive and finite');
  }
  if (
    !Number.isFinite(value.rotation) ||
    (typeof value.rotation === 'number' &&
      (value.rotation < -Math.PI || value.rotation >= Math.PI))
  ) {
    issues.push('rotation must be finite and within [-π, π)');
  }
  return issues;
}

function isBodyRegion(value: unknown): value is BodyRegion {
  return value === 'leftForearm' || value === 'rightForearm';
}

function isNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  includeMaximum: boolean,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    (includeMaximum ? value <= maximum : value < maximum)
  );
}

function isPositiveSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function projectTattooAnchor(anchor: TattooAnchor): TattooAnchor {
  return {
    schemaVersion: tattooAnchorSchemaVersion,
    region: anchor.region,
    u: anchor.u,
    v: anchor.v,
    width: anchor.width,
    height: anchor.height,
    rotation: anchor.rotation,
  };
}
