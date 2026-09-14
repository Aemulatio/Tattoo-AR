import { describe, expect, it } from 'vitest';
import {
  createTattooMaterial,
  defaultTattooAppearance,
  normalizeTattooAppearance,
} from './tattoo-shader';

describe('tattoo shader controls', () => {
  it('keeps tracking fade separate from user-selected ink strength', () => {
    const { material, controls } = createTattooMaterial();

    controls.setTrackingOpacity(0.4);
    controls.setAppearance({
      ...defaultTattooAppearance,
      opacity: 0.62,
    });

    expect(material.uniforms.trackingOpacity.value).toBe(0.4);
    expect(material.uniforms.userOpacity.value).toBe(0.62);
  });

  it('maps paper removal and inversion to shader switches', () => {
    const { material, controls } = createTattooMaterial();

    controls.setAppearance({
      opacity: 0.75,
      removeWhiteBackground: true,
      backgroundThreshold: 0.7,
      backgroundFeather: 0.12,
      invert: true,
    });

    expect(material.uniforms.removeWhiteBackground.value).toBe(1);
    expect(material.uniforms.backgroundThreshold.value).toBe(0.7);
    expect(material.uniforms.backgroundFeather.value).toBe(0.12);
    expect(material.uniforms.invertArtwork.value).toBe(1);
  });

  it('clamps appearance values to safe shader ranges', () => {
    expect(
      normalizeTattooAppearance({
        opacity: 2,
        removeWhiteBackground: true,
        backgroundThreshold: -1,
        backgroundFeather: 1,
        invert: false,
      }),
    ).toEqual({
      opacity: 1,
      removeWhiteBackground: true,
      backgroundThreshold: 0,
      backgroundFeather: 0.49,
      invert: false,
    });
  });
});
