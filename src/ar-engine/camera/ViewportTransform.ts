export type ViewportFit = 'cover' | 'contain';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface ViewportTransformOptions {
  source: ViewportSize;
  display: ViewportSize;
  fit: ViewportFit;
  mirrored?: boolean;
}

export interface ViewportPoint {
  x: number;
  y: number;
}

/**
 * The one boundary between camera-source pixels, display pixels and renderer
 * coordinates. Tracker input deliberately remains outside this transform:
 * it always receives the canonical, unmirrored camera frame.
 */
export class ViewportTransform {
  private readonly options: ViewportTransformOptions;
  private readonly scale: number;
  private readonly offset: ViewportPoint;
  private readonly mirrored: boolean;

  constructor(options: ViewportTransformOptions) {
    this.options = options;
    const { source, display, fit } = options;
    assertValidSize(source, 'source');
    assertValidSize(display, 'display');

    const scaleX = display.width / source.width;
    const scaleY = display.height / source.height;
    this.scale =
      fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    this.offset = {
      x: (display.width - source.width * this.scale) / 2,
      y: (display.height - source.height * this.scale) / 2,
    };
    this.mirrored = options.mirrored ?? false;
  }

  sourceToDisplay(point: ViewportPoint): ViewportPoint {
    const x = point.x * this.scale + this.offset.x;
    return {
      x: this.mirrored ? this.options.display.width - x : x,
      y: point.y * this.scale + this.offset.y,
    };
  }

  displayToSource(point: ViewportPoint): ViewportPoint {
    const x = this.mirrored ? this.options.display.width - point.x : point.x;
    return {
      x: (x - this.offset.x) / this.scale,
      y: (point.y - this.offset.y) / this.scale,
    };
  }

  displayToNdc(point: ViewportPoint): ViewportPoint {
    return {
      x: (point.x / this.options.display.width) * 2 - 1,
      y: 1 - (point.y / this.options.display.height) * 2,
    };
  }

  ndcToDisplay(point: ViewportPoint): ViewportPoint {
    return {
      x: ((point.x + 1) / 2) * this.options.display.width,
      y: ((1 - point.y) / 2) * this.options.display.height,
    };
  }
}

function assertValidSize(size: ViewportSize, name: string): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new Error(`${name} dimensions must be positive finite numbers.`);
  }
}
