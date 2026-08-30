import { describe, expect, it } from 'vitest';
import { StaleResultGate } from './StaleResultGate';

describe('StaleResultGate', () => {
  it('rejects out-of-order and duplicate tracker results', () => {
    const gate = new StaleResultGate();
    expect(gate.accept(100)).toBe(true);
    expect(gate.accept(100)).toBe(false);
    expect(gate.accept(99)).toBe(false);
    expect(gate.accept(101)).toBe(true);
  });

  it('accepts a new timeline after reset', () => {
    const gate = new StaleResultGate();
    gate.accept(100);
    gate.reset();
    expect(gate.accept(10)).toBe(true);
  });
});
