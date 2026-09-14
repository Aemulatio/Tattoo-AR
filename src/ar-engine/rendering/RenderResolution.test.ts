import { describe, expect, it } from 'vitest';
import {
  renderPixelRatioCap,
  resolveRenderPixelRatio,
} from './RenderResolution';

describe('render resolution', () => {
  it('lets auto mode follow adaptive tracking pressure', () => {
    expect(renderPixelRatioCap('auto', 'quality')).toBe(2);
    expect(renderPixelRatioCap('auto', 'balanced')).toBe(1.5);
    expect(renderPixelRatioCap('auto', 'reduced')).toBe(1);
  });

  it('honors explicit sharp and efficient choices', () => {
    expect(renderPixelRatioCap('sharp', 'reduced')).toBe(2);
    expect(renderPixelRatioCap('efficient', 'quality')).toBe(1);
  });

  it('clamps device density to a safe renderer range', () => {
    expect(resolveRenderPixelRatio(3, 1.5)).toBe(1.5);
    expect(resolveRenderPixelRatio(1, 2)).toBe(1);
    expect(resolveRenderPixelRatio(Number.NaN, Number.NaN)).toBe(1);
  });
});
