import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './OneEuroFilter';

describe('OneEuroFilter', () => {
  it('returns the first sample unchanged', () => {
    const filter = new OneEuroFilter();

    expect(filter.filter(0.42, 100)).toBe(0.42);
  });

  it('reduces stationary sample variation', () => {
    const filter = new OneEuroFilter({ minCutoff: 1, beta: 0 });
    const samples = [1, 1.04, 0.96, 1.03, 0.97, 1.02, 0.98];
    const filtered = samples.map((value, index) =>
      filter.filter(value, index * 50),
    );

    expect(totalVariation(filtered)).toBeLessThan(totalVariation(samples));
  });

  it('responds faster when velocity increases', () => {
    const staticFilter = new OneEuroFilter({ minCutoff: 0.1, beta: 0 });
    const adaptiveFilter = new OneEuroFilter({ minCutoff: 0.1, beta: 2 });
    for (const filter of [staticFilter, adaptiveFilter]) {
      filter.filter(0, 0);
      filter.filter(0, 50);
    }

    const staticValue = staticFilter.filter(1, 100);
    const adaptiveValue = adaptiveFilter.filter(1, 100);

    expect(adaptiveValue).toBeGreaterThan(staticValue);
    expect(adaptiveValue).toBeLessThan(1);
  });

  it('ignores non-monotonic samples', () => {
    const filter = new OneEuroFilter();
    filter.filter(1, 100);

    expect(filter.filter(2, 100)).toBe(1);
    expect(filter.filter(2, 90)).toBe(1);
    expect(filter.filter(2, 200)).toBeGreaterThan(1);
  });
});

function totalVariation(values: ReadonlyArray<number>): number {
  return values.slice(1).reduce((total, value, index) => {
    return total + Math.abs(value - values[index]);
  }, 0);
}
