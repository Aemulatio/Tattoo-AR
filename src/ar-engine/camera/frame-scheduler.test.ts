import { describe, expect, it } from 'vitest';
import { frameIntervalMs, FrameCadenceGate } from './frame-scheduler';

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

describe('FrameCadenceGate', () => {
  it.each([
    [20, 20],
    [17, 17],
    [15, 15],
  ])(
    'approximates a %i FPS target from discrete 30 FPS camera frames',
    (targetFramesPerSecond, expectedFrames) => {
      const gate = new FrameCadenceGate();
      let submittedFrames = 0;
      for (let frame = 0; frame < 30; frame += 1) {
        if (gate.shouldSubmit((frame * 1_000) / 30, targetFramesPerSecond)) {
          submittedFrames += 1;
        }
      }

      expect(submittedFrames).toBe(expectedFrames);
    },
  );

  it('rejects invalid timestamps without corrupting the next frame', () => {
    const gate = new FrameCadenceGate();

    expect(gate.shouldSubmit(Number.NaN, 20)).toBe(false);
    expect(gate.shouldSubmit(100, 20)).toBe(true);
  });
});
