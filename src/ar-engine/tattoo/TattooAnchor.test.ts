import { describe, expect, it } from 'vitest';
import {
  createTattooAnchor,
  constrainTattooAnchorToSurface,
  InvalidTattooAnchorError,
  isTattooAnchor,
  parseTattooAnchor,
  resetTattooAnchorTransform,
  resizeTattooAnchor,
  rotateTattooAnchor,
  serializeTattooAnchor,
  tattooSizeForAspectRatio,
} from './TattooAnchor';

const input = {
  region: 'leftForearm' as const,
  u: 0.42,
  v: 0.75,
  width: 0.22,
  height: 0.31,
  rotation: Math.PI / 6,
};

describe('TattooAnchor', () => {
  it('creates a versioned body-local anchor', () => {
    expect(createTattooAnchor(input)).toEqual({ schemaVersion: 1, ...input });
  });

  it('canonicalizes surface coordinates and rotation on creation', () => {
    expect(
      createTattooAnchor({
        ...input,
        u: 1.2,
        v: -0.25,
        rotation: Math.PI * 2.5,
      }),
    ).toMatchObject({ u: 1, v: 0.75, rotation: Math.PI / 2 });
  });

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite u input %s before clamping',
    (u) => {
      expect(() => createTattooAnchor({ ...input, u })).toThrow('u');
    },
  );

  it('round-trips without viewport-dependent data', () => {
    const anchor = createTattooAnchor(input);
    const serialized = serializeTattooAnchor(anchor);

    expect(parseTattooAnchor(serialized)).toEqual(anchor);
    expect(serialized).not.toMatch(/pixel|viewport|screen/i);
  });

  it('projects only declared body-local fields at every boundary', () => {
    const extraFields = { ...input, screenX: 640 };
    const created = createTattooAnchor(extraFields);
    const serialized = serializeTattooAnchor({
      ...created,
      viewportWidth: 1280,
    } as typeof created);
    const parsed = parseTattooAnchor(
      JSON.stringify({ ...created, screenY: 360 }),
    );

    expect(created).not.toHaveProperty('screenX');
    expect(serialized).not.toMatch(/viewportWidth/);
    expect(parsed).not.toHaveProperty('screenY');
  });

  it('keeps rotated tattoo extents within the longitudinal boundary', () => {
    const result = constrainTattooAnchorToSurface(
      createTattooAnchor({
        ...input,
        u: 0.98,
        width: 0.4,
        height: 0.2,
        rotation: Math.PI / 2,
      }),
    );

    expect(result.anchor.u).toBeCloseTo(0.8);
    expect(result.boundaryClamped).toBe(true);
  });

  it('scales oversized anchors to fit the supported surface', () => {
    const result = constrainTattooAnchorToSurface(
      createTattooAnchor({ ...input, width: 2, height: 2, rotation: 0 }),
    );

    expect(result.anchor.u).toBeCloseTo(0.5);
    expect(result.anchor.width).toBeCloseTo(1);
    expect(result.anchor.height).toBeCloseTo(1);
    expect(result.boundaryClamped).toBe(true);
  });

  it('constrains maximum finite dimensions without numeric overflow', () => {
    const result = constrainTattooAnchorToSurface(
      createTattooAnchor({
        ...input,
        width: Number.MAX_VALUE,
        height: Number.MAX_VALUE,
        rotation: Math.PI / 4,
      }),
    );

    expect(result.anchor.u).toBeCloseTo(0.5);
    expect(result.anchor.width).toBeCloseTo(Math.SQRT1_2);
    expect(result.anchor.height).toBeCloseTo(Math.SQRT1_2);
    expect(isTattooAnchor(result.anchor)).toBe(true);
  });

  it('creates proportional default sizes for portrait and landscape artwork', () => {
    expect(tattooSizeForAspectRatio(0.5)).toEqual({
      width: 0.15,
      height: 0.3,
    });
    expect(tattooSizeForAspectRatio(2)).toEqual({
      width: 0.3,
      height: 0.15,
    });
  });

  it('resizes proportionally and clamps the longest dimension', () => {
    const anchor = createTattooAnchor(input);
    const resized = resizeTattooAnchor(anchor, 2).anchor;

    expect(Math.max(resized.width, resized.height)).toBeCloseTo(0.8);
    expect(resized.width / resized.height).toBeCloseTo(
      anchor.width / anchor.height,
    );
  });

  it('applies rotation and reset through the surface constraint', () => {
    const anchor = createTattooAnchor({
      ...input,
      width: 0.4,
      height: 0.2,
      rotation: Math.PI / 4,
    });
    const rotated = rotateTattooAnchor(anchor, Math.PI * 2.5).anchor;
    const reset = resetTattooAnchorTransform(rotated, 2).anchor;

    expect(rotated.rotation).toBeCloseTo(Math.PI / 2);
    expect(reset).toMatchObject({ width: 0.3, height: 0.15, rotation: 0 });
  });

  it.each([
    [{ ...input, schemaVersion: 2 }, 'schemaVersion'],
    [{ ...input, schemaVersion: 1, region: 'leftUpperArm' }, 'region'],
    [{ ...input, schemaVersion: 1, u: -0.01 }, 'u'],
    [{ ...input, schemaVersion: 1, v: 1 }, 'v'],
    [{ ...input, schemaVersion: 1, width: 0 }, 'width'],
    [
      { ...input, schemaVersion: 1, height: Number.POSITIVE_INFINITY },
      'height',
    ],
    [{ ...input, schemaVersion: 1, rotation: Number.NaN }, 'rotation'],
    [{ ...input, schemaVersion: 1, rotation: Math.PI }, 'rotation'],
  ])('rejects an invalid %s field', (candidate, field) => {
    expect(isTattooAnchor(candidate)).toBe(false);
    expect(() => serializeTattooAnchor(candidate as never)).toThrow(field);
  });

  it('reports malformed serialized input as an anchor error', () => {
    expect(() => parseTattooAnchor('{')).toThrow(InvalidTattooAnchorError);
    expect(() => parseTattooAnchor('null')).toThrow('expected an object');
  });
});
