import { describe, expect, it } from 'vitest';
import { frameIntervalMs } from './frame-scheduler';

describe('frameIntervalMs', () => {
  it('converts adaptive tracking targets to scheduler intervals', () => {
    expect(frameIntervalMs(20)).toBe(50);
    expect(frameIntervalMs(17)).toBeCloseTo(58.82, 2);
    expect(frameIntervalMs(15)).toBeCloseTo(66.67, 2);
  });

  it('keeps invalid and extreme targets safe', () => {
    expect(frameIntervalMs(Number.NaN)).toBe(50);
    expect(frameIntervalMs(0)).toBe(1000);
    expect(frameIntervalMs(120)).toBeCloseTo(16.67, 2);
  });
});
