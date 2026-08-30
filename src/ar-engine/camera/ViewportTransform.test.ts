import { describe, expect, it } from 'vitest';
import { ViewportTransform } from './ViewportTransform';

const closeTo = (actual: number, expected: number) =>
  expect(actual).toBeCloseTo(expected, 8);

describe('ViewportTransform', () => {
  it('round-trips source pixels through a cropped cover viewport', () => {
    const transform = new ViewportTransform({
      source: { width: 1920, height: 1080 },
      display: { width: 390, height: 844 },
      fit: 'cover',
    });
    const source = { x: 996.25, y: 540.5 };
    const result = transform.displayToSource(transform.sourceToDisplay(source));

    closeTo(result.x, source.x);
    closeTo(result.y, source.y);
  });

  it('round-trips a mirrored display without mirroring source coordinates', () => {
    const transform = new ViewportTransform({
      source: { width: 1280, height: 720 },
      display: { width: 800, height: 600 },
      fit: 'contain',
      mirrored: true,
    });
    const source = { x: 120, y: 390 };
    const displayed = transform.sourceToDisplay(source);
    const result = transform.displayToSource(displayed);

    expect(displayed.x).toBeGreaterThan(600);
    closeTo(result.x, source.x);
    closeTo(result.y, source.y);
  });

  it('round-trips display pixels through NDC', () => {
    const transform = new ViewportTransform({
      source: { width: 640, height: 480 },
      display: { width: 393, height: 852 },
      fit: 'cover',
    });
    const display = { x: 33.25, y: 701.75 };
    const result = transform.ndcToDisplay(transform.displayToNdc(display));

    closeTo(result.x, display.x);
    closeTo(result.y, display.y);
  });
});
