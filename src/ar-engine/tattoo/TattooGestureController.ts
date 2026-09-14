import type { SurfaceHit, TattooAnchor, Vec2 } from '../contracts';
import {
  constrainTattooAnchorToSurface,
  createTattooAnchor,
  maximumTattooLongestDimension,
  minimumTattooLongestDimension,
  normalizeRotation,
} from './TattooAnchor';

export type TattooGestureKind = 'place' | 'drag' | 'transform';

export interface TattooGestureUpdate {
  anchor: TattooAnchor;
  kind: TattooGestureKind;
  boundaryClamped: boolean;
  seamCrossed: boolean;
}

export interface TattooGestureControllerOptions {
  getAnchor(): TattooAnchor | null;
  hitTest(point: Vec2): SurfaceHit | null;
  createAnchor(hit: SurfaceHit): TattooAnchor | null;
  crossesSeam?(anchor: TattooAnchor): boolean;
  isDisplayMirrored?(): boolean;
  onUpdate(update: TattooGestureUpdate): void;
  onCommit(update: TattooGestureUpdate): void;
}

interface DragState {
  pointerId: number;
  startPoint: Vec2;
  startHit: SurfaceHit;
  startAnchor: TattooAnchor;
  moved: boolean;
  placedOnDown: boolean;
}

interface TransformState {
  pointerIds: readonly [number, number];
  startDistance: number;
  startAngle: number;
  startAnchor: TattooAnchor;
  rotationDirection: number;
}

const dragThresholdPixels = 6;
const transformThresholdPixels = 4;

/** Owns transient pointer state while keeping every result body-local. */
export class TattooGestureController {
  private readonly options: TattooGestureControllerOptions;
  private readonly pointers = new Map<number, Vec2>();
  private drag: DragState | null = null;
  private transform: TransformState | null = null;
  private changed = false;
  private hadMultiplePointers = false;
  private sawBoundary = false;
  private sawSeam = false;
  private lastKind: TattooGestureKind = 'place';

  constructor(options: TattooGestureControllerOptions) {
    this.options = options;
  }

  get mode(): TattooGestureKind | null {
    if (this.pointers.size >= 2) return 'transform';
    if (this.pointers.size === 1)
      return this.lastKind === 'place' ? 'place' : 'drag';
    return null;
  }

  get activePointerIds(): ReadonlyArray<number> {
    return [...this.pointers.keys()];
  }

  hasPointer(pointerId: number): boolean {
    return this.pointers.has(pointerId);
  }

  pointerDown(pointerId: number, point: Vec2): TattooGestureKind | null {
    if (!isFinitePoint(point) || this.pointers.has(pointerId)) return null;
    if (this.pointers.size >= 2) return null;

    if (this.pointers.size === 0) {
      const hit = this.options.hitTest(point);
      if (!hit) return null;

      let anchor = this.options.getAnchor();
      let placedOnDown = false;
      if (!anchor || anchor.region !== hit.region) {
        const created = this.options.createAnchor(hit);
        if (!created) return null;
        anchor = this.apply(created, 'place');
        placedOnDown = true;
      }

      this.pointers.set(pointerId, copyPoint(point));
      this.drag = {
        pointerId,
        startPoint: copyPoint(point),
        startHit: hit,
        startAnchor: anchor,
        moved: false,
        placedOnDown,
      };
      this.lastKind = placedOnDown ? 'place' : 'drag';
      return this.mode;
    }

    this.pointers.set(pointerId, copyPoint(point));
    this.hadMultiplePointers = true;
    this.lastKind = 'transform';
    this.drag = null;
    this.beginTransform();
    return 'transform';
  }

  pointerMove(pointerId: number, point: Vec2): TattooGestureKind | null {
    if (!isFinitePoint(point) || !this.pointers.has(pointerId)) return null;
    this.pointers.set(pointerId, copyPoint(point));

    if (this.pointers.size >= 2) {
      this.lastKind = 'transform';
      this.transform ??= this.createTransformState();
      if (this.transform) this.updateTransform();
      return 'transform';
    }

    const drag = this.drag;
    if (!drag || drag.pointerId !== pointerId) return this.mode;
    if (distance(drag.startPoint, point) > dragThresholdPixels) {
      drag.moved = true;
      this.lastKind = 'drag';
    }
    if (!drag.moved) return this.mode;

    const hit = this.options.hitTest(point);
    if (!hit || hit.region !== drag.startHit.region) {
      this.signalBoundary('drag');
      return 'drag';
    }

    const crossedSeam = Math.abs(hit.uv.y - drag.startHit.uv.y) > 0.5;
    const candidate = createTattooAnchor({
      ...drag.startAnchor,
      u: drag.startAnchor.u + hit.uv.x - drag.startHit.uv.x,
      v:
        drag.startAnchor.v + shortestWrappedDelta(drag.startHit.uv.y, hit.uv.y),
    });
    this.apply(candidate, 'drag', crossedSeam);
    return 'drag';
  }

  /** Returns true when the complete multi-pointer interaction has ended. */
  pointerUp(pointerId: number): boolean {
    if (!this.pointers.has(pointerId)) return false;

    if (
      this.pointers.size === 1 &&
      this.drag &&
      !this.drag.moved &&
      !this.drag.placedOnDown &&
      !this.hadMultiplePointers
    ) {
      this.apply(
        createTattooAnchor({
          ...this.drag.startAnchor,
          u: this.drag.startHit.uv.x,
          v: this.drag.startHit.uv.y,
        }),
        'place',
      );
    }

    this.pointers.delete(pointerId);
    this.transform = null;
    if (this.pointers.size === 0) {
      this.finish();
      return true;
    }

    const [remaining] = this.pointers.entries();
    const anchor = this.options.getAnchor();
    const hit = this.options.hitTest(remaining[1]);
    this.drag =
      anchor && hit
        ? {
            pointerId: remaining[0],
            startPoint: copyPoint(remaining[1]),
            startHit: hit,
            startAnchor: anchor,
            moved: false,
            placedOnDown: true,
          }
        : null;
    return false;
  }

  cancel(): void {
    if (this.pointers.size === 0) return;
    this.pointers.clear();
    this.finish();
  }

  reset(): void {
    this.pointers.clear();
    this.resetInteraction();
  }

  private beginTransform(): void {
    this.transform = this.createTransformState();
  }

  private createTransformState(): TransformState | null {
    const entries = [...this.pointers.entries()];
    const anchor = this.options.getAnchor();
    if (entries.length < 2 || !anchor) return null;
    const first = entries[0];
    const second = entries[1];
    const startDistance = distance(first[1], second[1]);
    if (
      !Number.isFinite(startDistance) ||
      startDistance < transformThresholdPixels
    )
      return null;
    return {
      pointerIds: [first[0], second[0]],
      startDistance,
      startAngle: angle(first[1], second[1]),
      startAnchor: anchor,
      rotationDirection: this.options.isDisplayMirrored?.() ? -1 : 1,
    };
  }

  private updateTransform(): void {
    const transform = this.transform;
    if (!transform) return;
    const first = this.pointers.get(transform.pointerIds[0]);
    const second = this.pointers.get(transform.pointerIds[1]);
    if (!first || !second) return;

    const rawScale = distance(first, second) / transform.startDistance;
    const scale = boundedScale(transform.startAnchor, rawScale);
    const rotationDelta = normalizeRotation(
      angle(first, second) - transform.startAngle,
    );
    const candidate = createTattooAnchor({
      ...transform.startAnchor,
      width: transform.startAnchor.width * scale,
      height: transform.startAnchor.height * scale,
      rotation:
        transform.startAnchor.rotation +
        rotationDelta * transform.rotationDirection,
    });
    this.apply(candidate, 'transform');
  }

  private apply(
    candidate: TattooAnchor,
    kind: TattooGestureKind,
    seamCrossed = false,
  ): TattooAnchor {
    const constrained = constrainTattooAnchorToSurface(candidate);
    const crossesSeam =
      seamCrossed || Boolean(this.options.crossesSeam?.(constrained.anchor));
    const update = {
      anchor: constrained.anchor,
      kind,
      boundaryClamped: constrained.boundaryClamped,
      seamCrossed: crossesSeam,
    } satisfies TattooGestureUpdate;
    this.changed = true;
    this.lastKind = kind;
    this.sawBoundary ||= update.boundaryClamped;
    this.sawSeam ||= update.seamCrossed;
    this.options.onUpdate(update);
    return update.anchor;
  }

  private signalBoundary(kind: TattooGestureKind): void {
    const anchor = this.options.getAnchor();
    if (!anchor) return;
    const seamCrossed = Boolean(this.options.crossesSeam?.(anchor));
    this.sawBoundary = true;
    this.sawSeam ||= seamCrossed;
    this.options.onUpdate({
      anchor,
      kind,
      boundaryClamped: true,
      seamCrossed,
    });
  }

  private finish(): void {
    const anchor = this.options.getAnchor();
    if (anchor && (this.changed || this.sawBoundary || this.sawSeam)) {
      this.options.onCommit({
        anchor,
        kind: this.lastKind,
        boundaryClamped: this.sawBoundary,
        seamCrossed: this.sawSeam,
      });
    }
    this.resetInteraction();
  }

  private resetInteraction(): void {
    this.drag = null;
    this.transform = null;
    this.changed = false;
    this.hadMultiplePointers = false;
    this.sawBoundary = false;
    this.sawSeam = false;
    this.lastKind = 'place';
  }
}

function shortestWrappedDelta(from: number, to: number): number {
  const direct = to - from;
  if (direct > 0.5) return direct - 1;
  if (direct < -0.5) return direct + 1;
  return direct;
}

function boundedScale(anchor: TattooAnchor, rawScale: number): number {
  const longestDimension = Math.max(anchor.width, anchor.height);
  const minimumScale = minimumTattooLongestDimension / longestDimension;
  const maximumScale = maximumTattooLongestDimension / longestDimension;
  if (Number.isNaN(rawScale) || rawScale <= 0) return minimumScale;
  if (rawScale === Number.POSITIVE_INFINITY) return maximumScale;
  return Math.min(maximumScale, Math.max(minimumScale, rawScale));
}

function distance(first: Vec2, second: Vec2): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function angle(first: Vec2, second: Vec2): number {
  return Math.atan2(second.y - first.y, second.x - first.x);
}

function copyPoint(point: Vec2): Vec2 {
  return { x: point.x, y: point.y };
}

function isFinitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
