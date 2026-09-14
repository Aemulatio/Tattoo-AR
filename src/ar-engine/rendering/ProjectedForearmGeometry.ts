import { BufferAttribute, BufferGeometry, DynamicDrawUsage } from 'three';
import type { ForearmGeometry } from '../surfaces/forearm/ForearmGeometry';
import type { ForearmProjector } from './ForearmProjector';

/** Reusable renderer-space copy of the current body-local forearm surface. */
export class ProjectedForearmGeometry {
  readonly geometry: BufferGeometry;
  private readonly positions: Float32Array;
  private readonly facing: Float32Array;
  private readonly sourceUvs: Float32Array;
  private hasProjection = false;

  constructor(source: ForearmGeometry) {
    const sourcePosition = source.geometry.getAttribute('position');
    this.positions = new Float32Array(sourcePosition.count * 3);
    this.facing = new Float32Array(sourcePosition.count);
    this.sourceUvs = new Float32Array(sourcePosition.count * 2);

    const position = new BufferAttribute(this.positions, 3);
    const facing = new BufferAttribute(this.facing, 1);
    const sourceUv = new BufferAttribute(this.sourceUvs, 2);
    position.setUsage(DynamicDrawUsage);
    facing.setUsage(DynamicDrawUsage);
    sourceUv.setUsage(DynamicDrawUsage);

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', position);
    this.geometry.setAttribute('facing', facing);
    this.geometry.setAttribute('sourceUv', sourceUv);
    this.geometry.setAttribute(
      'uv',
      source.geometry.getAttribute('uv').clone(),
    );
    const index = source.geometry.getIndex();
    if (index) this.geometry.setIndex(index.clone());
  }

  update(source: ForearmGeometry, projector: ForearmProjector): BufferGeometry {
    const sourcePosition = source.geometry.getAttribute('position');
    const sourceNormal = source.geometry.getAttribute('normal');
    const position = this.geometry.getAttribute('position');
    const facing = this.geometry.getAttribute('facing');
    const sourceUv = this.geometry.getAttribute('sourceUv');
    if (sourcePosition.count !== position.count) {
      throw new Error('Projected forearm topology does not match its source');
    }

    for (let index = 0; index < sourcePosition.count; index += 1) {
      const projected = projector.project(
        {
          x: sourcePosition.getX(index),
          y: sourcePosition.getY(index),
          z: sourcePosition.getZ(index),
        },
        {
          x: sourceNormal.getX(index),
          y: sourceNormal.getY(index),
          z: sourceNormal.getZ(index),
        },
      );
      const offset = index * 3;
      this.positions[offset] = projected.ndc.x;
      this.positions[offset + 1] = projected.ndc.y;
      this.positions[offset + 2] = projected.depth;
      this.facing[index] = projected.facing;
      const sourceOffset = index * 2;
      this.sourceUvs[sourceOffset] =
        projected.source.x / projector.source.width;
      this.sourceUvs[sourceOffset + 1] =
        projected.source.y / projector.source.height;
    }

    position.needsUpdate = true;
    facing.needsUpdate = true;
    sourceUv.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
    this.hasProjection = true;
    return this.geometry;
  }

  get ready(): boolean {
    return this.hasProjection;
  }

  clear(): void {
    this.hasProjection = false;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
