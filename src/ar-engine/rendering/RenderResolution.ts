import type { TrackingCadenceLevel } from '../camera/AdaptiveTrackingCadence';

export type RenderResolutionMode = 'auto' | 'sharp' | 'efficient';

export function renderPixelRatioCap(
  mode: RenderResolutionMode,
  cadence: TrackingCadenceLevel,
): number {
  if (mode === 'sharp') return 2;
  if (mode === 'efficient') return 1;
  if (cadence === 'reduced') return 1;
  if (cadence === 'balanced') return 1.5;
  return 2;
}

export function resolveRenderPixelRatio(
  devicePixelRatio: number,
  maximumPixelRatio: number,
): number {
  const device = Number.isFinite(devicePixelRatio)
    ? Math.max(1, devicePixelRatio)
    : 1;
  const maximum = Number.isFinite(maximumPixelRatio)
    ? Math.min(2, Math.max(1, maximumPixelRatio))
    : 2;
  return Math.min(device, maximum);
}
