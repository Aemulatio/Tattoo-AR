import { describe, expect, it, vi } from 'vitest';
import type { SurfaceHit, TattooAnchor, Vec2 } from '../contracts';
import { createTattooAnchor } from './TattooAnchor';
import {
  TattooGestureController,
  type TattooGestureControllerOptions,
  type TattooGestureUpdate,
} from './TattooGestureController';

describe('TattooGestureController', () => {
  it('places a new anchor and commits only when the pointer is released', () => {
    const fixture = createFixture();

    expect(fixture.controller.pointerDown(1, { x: 50, y: 75 })).toBe('place');
    expect(fixture.anchor).toMatchObject({ u: 0.5, v: 0.75 });
    expect(fixture.commits).toHaveLength(0);

    expect(fixture.controller.pointerUp(1)).toBe(true);
    expect(fixture.commits).toHaveLength(1);
    expect(fixture.commits[0].kind).toBe('place');
  });

  it('preserves tap-to-reposition after an anchor already exists', () => {
    const fixture = createFixture(anchor({ u: 0.3, v: 0.4 }));

    fixture.controller.pointerDown(1, { x: 70, y: 20 });
    expect(fixture.anchor).toMatchObject({ u: 0.3, v: 0.4 });
    fixture.controller.pointerUp(1);

    expect(fixture.anchor).toMatchObject({ u: 0.7, v: 0.2 });
    expect(fixture.commits).toHaveLength(1);
  });

  it('drags through the duplicated UV seam using the shortest delta', () => {
    const hitTest = vi
      .fn<(point: Vec2) => SurfaceHit | null>()
      .mockReturnValueOnce(hit(0.4, 0.98))
      .mockReturnValueOnce(hit(0.5, 0.02));
    const fixture = createFixture(anchor({ u: 0.4, v: 0.98 }), { hitTest });

    fixture.controller.pointerDown(1, { x: 10, y: 10 });
    fixture.controller.pointerMove(1, { x: 20, y: 20 });
    fixture.controller.pointerUp(1);

    expect(fixture.anchor?.u).toBeCloseTo(0.5);
    expect(fixture.anchor?.v).toBeCloseTo(0.02);
    expect(fixture.updates.at(-1)?.seamCrossed).toBe(true);
    expect(fixture.commits[0].kind).toBe('drag');
  });

  it('uses a two-pointer gesture for proportional scale and rotation', () => {
    const fixture = createFixture(
      anchor({ width: 0.2, height: 0.3, rotation: 0 }),
    );

    fixture.controller.pointerDown(1, { x: 0, y: 0 });
    fixture.controller.pointerDown(2, { x: 10, y: 0 });
    fixture.controller.pointerMove(2, { x: 0, y: 20 });

    expect(fixture.anchor?.width).toBeCloseTo(0.4);
    expect(fixture.anchor?.height).toBeCloseTo(0.6);
    expect(fixture.anchor?.rotation).toBeCloseTo(Math.PI / 2);
    fixture.controller.pointerUp(2);
    expect(fixture.commits).toHaveLength(0);
    fixture.controller.pointerUp(1);
    expect(fixture.commits).toHaveLength(1);
    expect(fixture.commits[0].kind).toBe('transform');
  });

  it('inverts visual rotation handedness for a mirrored display', () => {
    const fixture = createFixture(anchor(), { isDisplayMirrored: () => true });

    fixture.controller.pointerDown(1, { x: 0, y: 0 });
    fixture.controller.pointerDown(2, { x: 10, y: 0 });
    fixture.controller.pointerMove(2, { x: 0, y: 10 });

    expect(fixture.anchor?.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('takes the shortest rotation path across the angle wrap', () => {
    const fixture = createFixture(anchor());
    const nearHalfTurn = Math.PI - 0.02;

    fixture.controller.pointerDown(1, { x: 0, y: 0 });
    fixture.controller.pointerDown(2, {
      x: Math.cos(nearHalfTurn) * 20,
      y: Math.sin(nearHalfTurn) * 20,
    });
    fixture.controller.pointerMove(2, {
      x: Math.cos(-nearHalfTurn) * 20,
      y: Math.sin(-nearHalfTurn) * 20,
    });

    expect(fixture.anchor?.rotation).toBeCloseTo(0.04);
  });

  it('continues as a body-local drag after one pinch pointer is lifted', () => {
    const fixture = createFixture(anchor());

    fixture.controller.pointerDown(1, { x: 50, y: 50 });
    fixture.controller.pointerDown(2, { x: 60, y: 50 });
    fixture.controller.pointerMove(2, { x: 70, y: 50 });
    fixture.controller.pointerUp(2);
    fixture.controller.pointerMove(1, { x: 60, y: 50 });
    fixture.controller.pointerUp(1);

    expect(fixture.anchor?.u).toBeCloseTo(0.6);
    expect(fixture.commits[0].kind).toBe('drag');
  });

  it('clamps scaling and reports attempts to leave the surface', () => {
    const hitTest = vi.fn((point: Vec2) =>
      point.x > 100 ? null : hit(point.x / 100, point.y / 100),
    );
    const fixture = createFixture(anchor({ width: 0.2, height: 0.3 }), {
      hitTest,
    });

    fixture.controller.pointerDown(1, { x: 50, y: 50 });
    fixture.controller.pointerMove(1, { x: 120, y: 50 });
    fixture.controller.pointerUp(1);

    expect(fixture.updates.at(-1)?.boundaryClamped).toBe(true);
    expect(fixture.commits[0].boundaryClamped).toBe(true);

    fixture.controller.pointerDown(1, { x: 50, y: 50 });
    fixture.controller.pointerDown(2, { x: 60, y: 50 });
    fixture.controller.pointerMove(2, { x: 150, y: 50 });
    expect(Math.max(fixture.anchor!.width, fixture.anchor!.height)).toBeCloseTo(
      0.8,
    );
  });
});

function createFixture(
  initialAnchor: TattooAnchor | null = null,
  overrides: Partial<TattooGestureControllerOptions> = {},
) {
  let currentAnchor = initialAnchor;
  const updates: TattooGestureUpdate[] = [];
  const commits: TattooGestureUpdate[] = [];
  const options: TattooGestureControllerOptions = {
    getAnchor: () => currentAnchor,
    hitTest: (point) => hit(point.x / 100, point.y / 100),
    createAnchor: (surfaceHit) =>
      anchor({
        region: surfaceHit.region,
        u: surfaceHit.uv.x,
        v: surfaceHit.uv.y,
      }),
    onUpdate: (update) => {
      currentAnchor = update.anchor;
      updates.push(update);
    },
    onCommit: (update) => commits.push(update),
    ...overrides,
  };
  const controller = new TattooGestureController(options);
  return {
    controller,
    updates,
    commits,
    get anchor() {
      return currentAnchor;
    },
  };
}

function anchor(overrides: Partial<TattooAnchor> = {}): TattooAnchor {
  return createTattooAnchor({
    region: 'leftForearm',
    u: 0.5,
    v: 0.5,
    width: 0.2,
    height: 0.3,
    rotation: 0,
    ...overrides,
  });
}

function hit(u: number, v: number): SurfaceHit {
  return { region: 'leftForearm', uv: { x: u, y: v } };
}
