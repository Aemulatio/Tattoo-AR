import { OrthographicCamera, Scene, WebGLRenderer } from 'three';
import type {
  BodySide,
  PoseFrame,
  SurfaceHit,
  TattooAnchor,
  Vec2,
} from '../contracts';
import type { ViewportSize } from '../camera/ViewportTransform';
import { ViewportTransform } from '../camera/ViewportTransform';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import type {
  ForearmGeometry,
  ForearmRadii,
} from '../surfaces/forearm/ForearmGeometry';
import { ForearmSurfaceRaycaster } from '../surfaces/forearm/ForearmSurfaceRaycaster';
import type { TattooAsset } from '../tattoo/TattooAssetLoader';
import { TattooPatch } from '../tattoo/TattooPatch';
import { ForearmProjector, forearmProjectionCamera } from './ForearmProjector';
import { ProjectedForearmGeometry } from './ProjectedForearmGeometry';

export interface ARRendererSurfaceInput {
  poseFrame: PoseFrame;
  side: BodySide;
  localFrame: ForearmLocalFrame;
  radii: ForearmRadii;
  transform: ViewportTransform;
  sourceSize: ViewportSize;
  opacity: number;
}

export interface ARRendererOptions {
  onRender?: (timestampMs: number) => void;
}

export class ARRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(
    -1,
    1,
    1,
    -1,
    forearmProjectionCamera.near,
    forearmProjectionCamera.far,
  );
  private readonly projectedSurface: ProjectedForearmGeometry;
  private readonly tattooPatch: TattooPatch;
  private readonly surfaceRaycaster: ForearmSurfaceRaycaster;
  private readonly sourceGeometry: ForearmGeometry;
  private readonly onRender: ((timestampMs: number) => void) | undefined;
  private animationFrame: number | null = null;
  private disposed = false;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  private latestSurface: ARRendererSurfaceInput | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    sourceGeometry: ForearmGeometry,
    options: ARRendererOptions = {},
  ) {
    this.sourceGeometry = sourceGeometry;
    this.onRender = options.onRender;
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, forearmProjectionCamera.z);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.projectedSurface = new ProjectedForearmGeometry(sourceGeometry);
    this.tattooPatch = new TattooPatch(this.projectedSurface.geometry);
    this.surfaceRaycaster = new ForearmSurfaceRaycaster(this.projectedSurface);
    this.scene.add(this.tattooPatch.mesh);
  }

  resize(width: number, height: number, devicePixelRatio = 1): void {
    if (width <= 0 || height <= 0 || this.disposed) return;
    const pixelRatio = Math.min(2, Math.max(1, devicePixelRatio));
    if (
      width === this.width &&
      height === this.height &&
      pixelRatio === this.pixelRatio
    ) {
      return;
    }
    this.width = width;
    this.height = height;
    this.pixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
  }

  updateSurface(input: ARRendererSurfaceInput): void {
    if (this.disposed) return;
    this.latestSurface = input;
    const projector = new ForearmProjector(
      input.poseFrame,
      input.side,
      input.localFrame,
      input.transform,
      input.sourceSize,
    );
    this.projectedSurface.update(this.sourceGeometry, projector);
    this.surfaceRaycaster.setRegion(`${input.side}Forearm`);
    this.tattooPatch.updateSurface(input.side, input.localFrame, input.radii);
    this.tattooPatch.setOpacity(input.opacity);
  }

  updateViewport(transform: ViewportTransform, sourceSize: ViewportSize): void {
    if (!this.latestSurface) return;
    this.updateSurface({ ...this.latestSurface, transform, sourceSize });
  }

  clearSurface(): void {
    this.latestSurface = null;
    this.projectedSurface.clear();
    this.tattooPatch.clearSurface();
  }

  setTattoo(asset: TattooAsset | null): void {
    this.tattooPatch.setAsset(asset);
  }

  setAnchor(anchor: TattooAnchor | null): void {
    this.tattooPatch.setAnchor(anchor);
  }

  crossesTattooSeam(anchor: TattooAnchor): boolean {
    return this.tattooPatch.crossesSeam(anchor);
  }

  hitTest(point: Vec2, transform: ViewportTransform): SurfaceHit | null {
    if (!this.projectedSurface.ready) return null;
    return this.surfaceRaycaster.hitTest(point, transform);
  }

  start(): void {
    if (this.animationFrame !== null || this.disposed) return;
    const render = (timestampMs: number) => {
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);
      this.onRender?.(timestampMs);
      this.animationFrame = requestAnimationFrame(render);
    };
    this.animationFrame = requestAnimationFrame(render);
  }

  pause(): void {
    if (this.animationFrame === null) return;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.scene.remove(this.tattooPatch.mesh);
    this.surfaceRaycaster.dispose();
    this.tattooPatch.dispose();
    this.projectedSurface.dispose();
    this.renderer.dispose();
  }
}
