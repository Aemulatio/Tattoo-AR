import { describe, expect, it } from 'vitest';
import { syncCanvasSize, type CanvasSizeTarget } from './syncCanvasSize';

describe('syncCanvasSize', () => {
  it('does not rewrite an unchanged canvas backing store', () => {
    let width = 640;
    let height = 480;
    let writes = 0;
    const canvas: CanvasSizeTarget = {
      get width() {
        return width;
      },
      set width(value) {
        writes += 1;
        width = value;
      },
      get height() {
        return height;
      },
      set height(value) {
        writes += 1;
        height = value;
      },
    };

    expect(syncCanvasSize(canvas, 640, 480)).toBe(false);
    expect(writes).toBe(0);
  });

  it('rounds and updates changed dimensions once', () => {
    const canvas: CanvasSizeTarget = { width: 0, height: 0 };

    expect(syncCanvasSize(canvas, 639.6, 479.5)).toBe(true);
    expect(canvas).toEqual({ width: 640, height: 480 });
  });
});
