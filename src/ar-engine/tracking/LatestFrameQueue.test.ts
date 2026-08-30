import { describe, expect, it } from 'vitest';
import { LatestFrameQueue } from './LatestFrameQueue';

class TestFrame {
  closed = 0;
  close(): void {
    this.closed += 1;
  }
}

describe('LatestFrameQueue', () => {
  it('keeps only the newest queued frame', () => {
    const queue = new LatestFrameQueue<TestFrame>();
    const first = new TestFrame();
    const newest = new TestFrame();
    queue.replace(first);
    queue.replace(newest);
    expect(first.closed).toBe(1);
    expect(queue.take()).toBe(newest);
    expect(queue.take()).toBeNull();
  });

  it('disposes a queued frame during cleanup', () => {
    const queue = new LatestFrameQueue<TestFrame>();
    const frame = new TestFrame();
    queue.replace(frame);
    queue.clear();
    expect(frame.closed).toBe(1);
  });
});
