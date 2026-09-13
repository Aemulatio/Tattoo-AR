import { describe, expect, it } from 'vitest';
import { TrackingStateMachine } from './TrackingStateMachine';

const options = {
  goodFramesToTrack: 3,
  badFramesToLose: 2,
  goodFramesToRecover: 2,
  recoveryTimeoutMs: 500,
};

describe('TrackingStateMachine', () => {
  it('requires consecutive good frames before tracking', () => {
    const machine = new TrackingStateMachine(options);

    expect(machine.update(0.8, 0)).toBe('acquiring');
    expect(machine.update(0.5, 10)).toBe('acquiring');
    expect(machine.update(0.8, 20)).toBe('acquiring');
    expect(machine.update(0.8, 30)).toBe('acquiring');
    expect(machine.update(0.8, 40)).toBe('tracking');
  });

  it('uses a lower threshold and consecutive frames before loss', () => {
    const machine = trackedMachine();

    expect(machine.update(0.5, 50)).toBe('tracking');
    expect(machine.update(0.2, 60)).toBe('tracking');
    expect(machine.update(0.5, 70)).toBe('tracking');
    expect(machine.update(0.2, 80)).toBe('tracking');
    expect(machine.update(0.2, 90)).toBe('trackingLost');
    expect(machine.lostSinceMs).toBe(90);
  });

  it('recovers only after consecutive good frames', () => {
    const machine = lostMachine();

    expect(machine.update(0.8, 100)).toBe('trackingLost');
    expect(machine.update(0.8, 110)).toBe('tracking');
  });

  it('returns to acquiring after the recovery timeout', () => {
    const machine = lostMachine();

    expect(machine.update(0, 590)).toBe('acquiring');
  });
});

function trackedMachine(): TrackingStateMachine {
  const machine = new TrackingStateMachine(options);
  machine.update(0.8, 0);
  machine.update(0.8, 10);
  machine.update(0.8, 20);
  return machine;
}

function lostMachine(): TrackingStateMachine {
  const machine = trackedMachine();
  machine.update(0.2, 80);
  machine.update(0.2, 90);
  return machine;
}
