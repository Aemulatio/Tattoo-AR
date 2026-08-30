import { describe, expect, it, vi } from 'vitest';
import type { PoseFrame, PoseTracker, TrackerConfig } from '../contracts';
import { FallbackPoseTracker } from './FallbackPoseTracker';

const config: TrackerConfig = {
  wasmRoot: '/wasm/',
  modelAssetPath: '/models/pose.task',
};

function fakeTracker(initializeError?: Error): PoseTracker & {
  initialize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    initialize: vi.fn(async () => {
      if (initializeError) throw initializeError;
    }),
    submit: vi.fn(),
    subscribe: vi.fn((_listener: (frame: PoseFrame) => void) => () => {}),
    dispose: vi.fn(async () => {}),
  };
}

describe('FallbackPoseTracker', () => {
  it('uses the worker tracker when it initializes', async () => {
    const worker = fakeTracker();
    const createFallback = vi.fn(() => fakeTracker());
    const tracker = new FallbackPoseTracker(() => worker, createFallback);

    await tracker.initialize(config);
    await tracker.initialize(config);

    expect(tracker.executionMode).toBe('worker');
    expect(worker.initialize).toHaveBeenCalledOnce();
    expect(worker.initialize).toHaveBeenCalledWith(config);
    expect(createFallback).not.toHaveBeenCalled();
  });

  it('disposes a failed worker and initializes the main-thread fallback', async () => {
    const workerError = new Error('worker module failed to load');
    const worker = fakeTracker(workerError);
    const fallback = fakeTracker();
    const tracker = new FallbackPoseTracker(
      () => worker,
      () => fallback,
    );

    await tracker.initialize(config);

    expect(worker.dispose).toHaveBeenCalledOnce();
    expect(fallback.initialize).toHaveBeenCalledWith(config);
    expect(tracker.executionMode).toBe('main-thread');
    expect(tracker.fallbackReason).toBe(workerError);
  });

  it('falls back when constructing the worker throws', async () => {
    const fallback = fakeTracker();
    const tracker = new FallbackPoseTracker(
      () => {
        throw new Error('workers blocked');
      },
      () => fallback,
    );

    await tracker.initialize(config);

    expect(fallback.initialize).toHaveBeenCalledWith(config);
    expect(tracker.executionMode).toBe('main-thread');
  });

  it('reports both failures when the fallback also fails', async () => {
    const worker = fakeTracker(new Error('worker failed'));
    const fallback = fakeTracker(new Error('fallback failed'));
    const tracker = new FallbackPoseTracker(
      () => worker,
      () => fallback,
    );

    await expect(tracker.initialize(config)).rejects.toThrow(
      'Worker tracker failed (worker failed); main-thread fallback failed (fallback failed)',
    );
    expect(worker.dispose).toHaveBeenCalledOnce();
    expect(fallback.dispose).toHaveBeenCalledOnce();
  });
});
