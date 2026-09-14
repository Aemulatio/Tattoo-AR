import { describe, expect, it } from 'vitest';
import { createCompactBodyMask } from './BodyMask';

describe('createCompactBodyMask', () => {
  it('downscales a callback-owned float mask to normalized bytes', () => {
    const source = new Float32Array([
      0, 0, 0.25, 0.25, 0, 0, 0.25, 0.25, 0.5, 0.5, 1, 1, 0.5, 0.5, 1, 1,
    ]);

    const mask = createCompactBodyMask(source, 4, 4, 2);

    expect(mask).toEqual({
      width: 2,
      height: 2,
      data: new Uint8Array([0, 64, 128, 255]),
    });
  });

  it('preserves aspect ratio within the transfer budget', () => {
    const source = new Float32Array(400 * 200);
    source.fill(1, 0, source.length / 2);

    const mask = createCompactBodyMask(source, 400, 200);

    expect(mask?.width).toBe(128);
    expect(mask?.height).toBe(64);
    expect(mask?.data).toHaveLength(128 * 64);
  });

  it('rejects malformed, empty, and uninformative full-frame masks', () => {
    expect(createCompactBodyMask(new Float32Array(3), 2, 2)).toBeNull();
    expect(createCompactBodyMask(new Float32Array(16), 4, 4)).toBeNull();
    expect(
      createCompactBodyMask(new Float32Array(16).fill(1), 4, 4),
    ).toBeNull();
  });
});
