import { describe, expect, it } from 'vitest';
import { createSessionFailure } from './session-errors';

describe('session errors', () => {
  it('turns denied camera permission into actionable recovery copy', () => {
    const failure = createSessionFailure('camera', {
      name: 'NotAllowedError',
    });

    expect(failure).toMatchObject({
      kind: 'camera',
      title: 'Camera permission is blocked',
      retryLabel: 'Retry camera',
      technicalDetail: 'NotAllowedError',
    });
    expect(failure.guidance).toMatch(/site settings/i);
  });

  it('distinguishes rendering and tracking failures from camera errors', () => {
    expect(
      createSessionFailure('renderer', new Error('WebGL unavailable')),
    ).toMatchObject({
      category: 'Rendering',
      title: 'The AR renderer could not start',
      technicalDetail: 'WebGL unavailable',
    });
    expect(
      createSessionFailure('tracker', new Error('model failed')),
    ).toMatchObject({
      category: 'Tracking',
      title: 'Pose tracking could not start',
      technicalDetail: 'model failed',
    });
  });

  it('keeps technical details compact for the accessible panel', () => {
    const failure = createSessionFailure(
      'tracker',
      new Error(`graph   failed\n${'x'.repeat(300)}`),
    );

    expect(failure.technicalDetail).not.toMatch(/\s{2,}|\n/);
    expect(failure.technicalDetail?.length).toBeLessThanOrEqual(180);
  });

  it('offers a compatibility recheck without inventing technical detail', () => {
    expect(createSessionFailure('compatibility')).toMatchObject({
      category: 'Compatibility',
      technicalDetail: null,
      retryLabel: 'Check again',
    });
  });

  it('turns the combined worker resource failure into useful recovery copy', () => {
    const failure = createSessionFailure(
      'tracker',
      new Error(
        'Worker tracker failed (Pose worker failed to load); main-thread fallback failed ([object Event])',
      ),
    );

    expect(failure).toMatchObject({
      title: 'Pose tracking files could not load',
      retryLabel: 'Retry tracking',
      technicalDetail:
        'The pose model or WebAssembly runtime was unavailable to the browser.',
    });
    expect(failure.guidance).toMatch(/connection/i);
    expect(failure.technicalDetail).not.toContain('[object Event]');
  });
});
