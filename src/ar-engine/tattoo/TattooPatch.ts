import { Mesh, type BufferGeometry, type ShaderMaterial } from 'three';
import type { BodySide, TattooAnchor } from '../contracts';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import type { ForearmRadii } from '../surfaces/forearm/ForearmGeometry';
import type { TattooAsset } from './TattooAssetLoader';
import {
  createTattooMaterial,
  type TattooAppearance,
  type TattooMaterialControls,
} from './tattoo-shader';

export class TattooPatch {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly controls: TattooMaterialControls;
  private anchor: TattooAnchor | null = null;
  private asset: TattooAsset | null = null;
  private surfaceSide: BodySide | null = null;
  private surfaceReady = false;
  private userVisible = true;
  private circumferenceRatio = 0.7;

  constructor(geometry: BufferGeometry) {
    const bundle = createTattooMaterial();
    this.controls = bundle.controls;
    this.mesh = new Mesh(geometry, bundle.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.updateVisibility();
  }

  setAsset(asset: TattooAsset | null): void {
    this.asset = asset;
    this.controls.setTexture(asset?.texture ?? null);
    this.updateVisibility();
  }

  setAnchor(anchor: TattooAnchor | null): void {
    this.anchor = anchor;
    if (anchor) {
      this.controls.setAnchor(anchor.u, anchor.v);
      this.controls.setSize(anchor.width, anchor.height);
      this.controls.setRotation(anchor.rotation);
    }
    this.updateVisibility();
  }

  updateSurface(
    side: BodySide,
    frame: ForearmLocalFrame,
    radii: ForearmRadii,
  ): void {
    this.surfaceSide = side;
    this.surfaceReady = true;
    const u = this.anchor?.u ?? 0.5;
    const radial = lerp(radii.wrist.radial, radii.elbow.radial, u);
    const tangent = lerp(radii.wrist.tangent, radii.elbow.tangent, u);
    const meanRadius = (radial + tangent) / 2;
    this.circumferenceRatio = (Math.PI * 2 * meanRadius) / frame.length;
    this.controls.setCircumferenceRatio(this.circumferenceRatio);
    this.updateVisibility();
  }

  crossesSeam(anchor: TattooAnchor): boolean {
    const circumferentialHalfExtent =
      (Math.abs(Math.cos(anchor.rotation)) * anchor.width +
        Math.abs(Math.sin(anchor.rotation)) * anchor.height) /
      2;
    const angularHalfExtent =
      circumferentialHalfExtent / this.circumferenceRatio;
    return (
      angularHalfExtent >= 0.5 ||
      anchor.v - angularHalfExtent < 0 ||
      anchor.v + angularHalfExtent > 1
    );
  }

  clearSurface(): void {
    this.surfaceReady = false;
    this.updateVisibility();
  }

  setOpacity(opacity: number): void {
    this.controls.setTrackingOpacity(opacity);
  }

  setAppearance(appearance: TattooAppearance): void {
    this.controls.setAppearance(appearance);
  }

  setVisible(visible: boolean): void {
    this.userVisible = visible;
    this.updateVisibility();
  }

  dispose(): void {
    this.mesh.material.dispose();
  }

  private updateVisibility(): void {
    this.mesh.visible = Boolean(
      this.surfaceReady &&
      this.userVisible &&
      this.asset &&
      this.anchor &&
      this.surfaceSide &&
      this.anchor.region === `${this.surfaceSide}Forearm`,
    );
  }
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
