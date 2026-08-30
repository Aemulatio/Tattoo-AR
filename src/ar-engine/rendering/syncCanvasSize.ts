export interface CanvasSizeTarget {
  width: number;
  height: number;
}

export function syncCanvasSize(
  canvas: CanvasSizeTarget,
  displayWidth: number,
  displayHeight: number,
): boolean {
  const width = Math.max(0, Math.round(displayWidth));
  const height = Math.max(0, Math.round(displayHeight));
  let changed = false;

  if (canvas.width !== width) {
    canvas.width = width;
    changed = true;
  }
  if (canvas.height !== height) {
    canvas.height = height;
    changed = true;
  }

  return changed;
}
