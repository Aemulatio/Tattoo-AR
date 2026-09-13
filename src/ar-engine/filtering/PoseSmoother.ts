import type { PoseFrame, PosePoint, Vec3 } from '../contracts';
import { OneEuroFilter, type OneEuroFilterOptions } from './OneEuroFilter';

export interface PoseSmootherOptions {
  image: Partial<OneEuroFilterOptions>;
  world: Partial<OneEuroFilterOptions>;
}

const defaultOptions: PoseSmootherOptions = {
  image: { minCutoff: 1.25, beta: 0.12, derivativeCutoff: 1 },
  world: { minCutoff: 1, beta: 0.16, derivativeCutoff: 1 },
};

interface PointFilters {
  image: VectorFilters;
  world: VectorFilters;
}

interface VectorFilters {
  x: OneEuroFilter;
  y: OneEuroFilter;
  z: OneEuroFilter;
}

export class PoseSmoother {
  private readonly options: PoseSmootherOptions;
  private readonly pointFilters: PointFilters[] = [];

  constructor(options: Partial<PoseSmootherOptions> = {}) {
    this.options = {
      image: { ...defaultOptions.image, ...options.image },
      world: { ...defaultOptions.world, ...options.world },
    };
  }

  smooth(frame: PoseFrame): PoseFrame {
    if (frame.landmarks.length === 0) return frame;
    return {
      ...frame,
      landmarks: frame.landmarks.map((point, index) =>
        this.smoothPoint(point, index, frame.timestampMs),
      ),
    };
  }

  reset(): void {
    this.pointFilters.length = 0;
  }

  private smoothPoint(
    point: PosePoint,
    index: number,
    timestampMs: number,
  ): PosePoint {
    const filters =
      this.pointFilters[index] ??
      (this.pointFilters[index] = {
        image: createVectorFilters(this.options.image),
        world: createVectorFilters(this.options.world),
      });
    return {
      image: smoothVector(filters.image, point.image, timestampMs),
      world: smoothVector(filters.world, point.world, timestampMs),
      visibility: point.visibility,
    };
  }
}

function createVectorFilters(
  options: Partial<OneEuroFilterOptions>,
): VectorFilters {
  return {
    x: new OneEuroFilter(options),
    y: new OneEuroFilter(options),
    z: new OneEuroFilter(options),
  };
}

function smoothVector(
  filters: VectorFilters,
  vector: Vec3,
  timestampMs: number,
): Vec3 {
  return {
    x: filters.x.filter(vector.x, timestampMs),
    y: filters.y.filter(vector.y, timestampMs),
    z: filters.z.filter(vector.z, timestampMs),
  };
}
