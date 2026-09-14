export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type BodySide = 'left' | 'right';

export type BodyRegion = 'leftForearm' | 'rightForearm';

export interface TattooAnchor {
  schemaVersion: 1;
  region: BodyRegion;
  /** Longitudinal position: 0 at the wrist, 1 at the elbow. */
  u: number;
  /** Angular position around the surface, normalized to [0, 1). */
  v: number;
  /** Size relative to forearm length, never viewport pixels. */
  width: number;
  height: number;
  /** Rotation in the local tangent plane, in radians. */
  rotation: number;
}

export interface SurfaceHit {
  region: BodyRegion;
  uv: Vec2;
}

export interface PosePoint {
  image: Vec3;
  world: Vec3;
  visibility: number;
}

export interface ForearmMaskSample {
  wristRadiusRatio: number;
  elbowRadiusRatio: number;
  confidence: number;
}

export interface PoseFrame {
  frameId: number;
  timestampMs: number;
  landmarks: ReadonlyArray<PosePoint>;
  inferenceMs: number;
  forearmMaskSamples?: Partial<Record<BodySide, ForearmMaskSample>>;
}

export interface TrackerConfig {
  wasmRoot: string;
  modelAssetPath: string;
}

export interface PoseTracker {
  initialize(config: TrackerConfig): Promise<void>;
  submit(frame: ImageBitmap, timestampMs: number): void;
  subscribe(listener: (frame: PoseFrame) => void): () => void;
  dispose(): Promise<void>;
}
