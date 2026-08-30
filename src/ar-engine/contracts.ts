export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PosePoint {
  image: Vec3;
  world: Vec3;
  visibility: number;
}

export interface PoseFrame {
  frameId: number;
  timestampMs: number;
  landmarks: ReadonlyArray<PosePoint>;
  inferenceMs: number;
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
