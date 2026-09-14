import { Texture } from 'three';
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
      inkBlend: 0.7,
      edgeFeather: 0.06,
      removeWhiteBackground: true,
      backgroundThreshold: 0.7,
      backgroundFeather: 0.12,
      invert: true,
    });

    expect(material.uniforms.removeWhiteBackground.value).toBe(1);
    expect(material.uniforms.inkBlend.value).toBe(0.7);
    expect(material.uniforms.edgeFeather.value).toBe(0.06);
    expect(material.uniforms.backgroundThreshold.value).toBe(0.7);
    expect(material.uniforms.backgroundFeather.value).toBe(0.12);
    expect(material.uniforms.invertArtwork.value).toBe(1);
  });

  it('clamps appearance values to safe shader ranges', () => {
    expect(
      normalizeTattooAppearance({
        opacity: 2,
        inkBlend: -1,
        edgeFeather: 1,
        removeWhiteBackground: true,
        backgroundThreshold: -1,
        backgroundFeather: 1,
        invert: false,
      }),
    ).toEqual({
      opacity: 1,
      inkBlend: 0,
      edgeFeather: 0.2,
      removeWhiteBackground: true,
      backgroundThreshold: 0,
      backgroundFeather: 0.49,
      invert: false,
    });
  });

  it('uses the blend control to preserve color or approach absorbed ink', () => {
    const { material, controls } = createTattooMaterial();

    controls.setAppearance({
      ...defaultTattooAppearance,
      inkBlend: 0.35,
      edgeFeather: 0.08,
    });

    expect(material.uniforms.inkBlend.value).toBe(0.35);
    expect(material.uniforms.edgeFeather.value).toBe(0.08);
    expect(material.fragmentShader).toContain(
      'mix(artworkColor, absorbedInk, inkBlend)',
    );
  });

  it('enables body clipping only while a mask texture is available', () => {
    const { material, controls } = createTattooMaterial();
    const bodyMask = new Texture();

    controls.setBodyMask(bodyMask);
    expect(material.uniforms.bodyMask.value).toBe(bodyMask);
    expect(material.uniforms.bodyMaskEnabled.value).toBe(1);
    expect(material.fragmentShader).toContain(
      'smoothstep(0.35, 0.65, bodyConfidence)',
    );

    controls.setBodyMask(null);
    expect(material.uniforms.bodyMaskEnabled.value).toBe(0);
  });
});
