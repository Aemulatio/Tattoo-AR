import { describe, expect, it } from 'vitest';
import { MonotonicTimestamp } from './MonotonicTimestamp';

describe('MonotonicTimestamp', () => {
  it('never moves backward when a new camera stream resets media time', () => {
    const timestamps = new MonotonicTimestamp();
    // The old stream's last mediaTime was 11,359,926 ms. The replacement
    // camera starts at 80,030 ms, but performance time remains monotonic.
    expect(timestamps.next(11_359_926)).toBe(11_359_926);
    expect(timestamps.next(11_360_030)).toBe(11_360_030);
  });

  it('keeps timestamps strictly increasing if a clock repeats or regresses', () => {
    const timestamps = new MonotonicTimestamp();
    timestamps.next(100);
    expect(timestamps.next(100)).toBeGreaterThan(100);
    expect(timestamps.next(99)).toBeGreaterThan(100);
  });
});
