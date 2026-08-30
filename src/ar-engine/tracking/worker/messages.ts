import type { PoseFrame, TrackerConfig } from '../../contracts';

export type WorkerRequest =
  | { type: 'initialize'; config: TrackerConfig }
  | { type: 'frame'; bitmap: ImageBitmap; timestampMs: number }
  | { type: 'dispose' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'pose'; frame: PoseFrame }
  | { type: 'error'; message: string };
