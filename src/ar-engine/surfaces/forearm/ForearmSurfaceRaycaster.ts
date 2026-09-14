import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Raycaster,
  Vector2,
} from 'three';
import type { BodyRegion, SurfaceHit, Vec2 } from '../../contracts';
import type { ViewportTransform } from '../../camera/ViewportTransform';
import type { ProjectedForearmGeometry } from '../../rendering/ProjectedForearmGeometry';
import { forearmProjectionCamera } from '../../rendering/ForearmProjector';
import { normalizeSurfaceV } from '../../tattoo/TattooAnchor';

export class ForearmSurfaceRaycaster {
  private readonly camera = new OrthographicCamera(
    -1,
    1,
    1,
    -1,
    forearmProjectionCamera.near,
    forearmProjectionCamera.far,
  );
  private readonly raycaster = new Raycaster();
  private readonly pointerNdc = new Vector2();
  private readonly material = new MeshBasicMaterial({ side: DoubleSide });
  private readonly mesh: Mesh;
  private region: BodyRegion = 'leftForearm';

  constructor(privateGeometry: ProjectedForearmGeometry) {
    this.mesh = new Mesh(privateGeometry.geometry, this.material);
    this.camera.position.set(0, 0, forearmProjectionCamera.z);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  setRegion(region: BodyRegion): void {
    this.region = region;
  }

  hitTest(point: Vec2, transform: ViewportTransform): SurfaceHit | null {
    const ndc = transform.displayToNdc(point);
    this.pointerNdc.set(ndc.x, ndc.y);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this.mesh.updateMatrixWorld(true);
    const facing = this.mesh.geometry.getAttribute('facing');
    const intersections = this.raycaster.intersectObject(this.mesh, false);

    for (const intersection of intersections) {
      const face = intersection.face;
      const uv = intersection.uv;
      if (!face || !uv) continue;
      const faceFacing =
        (facing.getX(face.a) + facing.getX(face.b) + facing.getX(face.c)) / 3;
      if (faceFacing <= 0.02) continue;
      return {
        region: this.region,
        uv: { x: clamp01(uv.x), y: normalizeSurfaceV(uv.y) },
      };
    }
    return null;
  }

  dispose(): void {
    this.material.dispose();
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
