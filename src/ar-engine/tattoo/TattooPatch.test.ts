import { BufferGeometry, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { ForearmLocalFrame } from '../surfaces/forearm/ForearmFrameEstimator';
import { createTattooAnchor } from './TattooAnchor';
import { TattooPatch } from './TattooPatch';

const frame: ForearmLocalFrame = {
  origin: { x: 0, y: 0, z: 0 },
  axis: { x: 0, y: 1, z: 0 },
  radial: { x: 1, y: 0, z: 0 },
  tangent: { x: 0, y: 0, z: -1 },
  length: 2,
  rollRadians: 0,
  rollConfidence: 1,
  orientationSource: 'hand',
};

describe('TattooPatch', () => {
  it('renders only when texture, anchor, and matching surface are ready', () => {
    const patch = new TattooPatch(new BufferGeometry());
    const asset = {
      sourceUrl: '/fixture.png',
      texture: new Texture(),
      pixelWidth: 100,
      pixelHeight: 200,
      aspectRatio: 0.5,
    };
    const anchor = createTattooAnchor({
      region: 'leftForearm',
      u: 0.5,
      v: 0.75,
      width: 0.2,
      height: 0.4,
      rotation: 0,
    });

    patch.setAsset(asset);
    patch.setAnchor(anchor);
    expect(patch.mesh.visible).toBe(false);

    patch.updateSurface('right', frame, radii());
    expect(patch.mesh.visible).toBe(false);

    patch.updateSurface('left', frame, radii());
    expect(patch.mesh.visible).toBe(true);

    patch.setVisible(false);
    expect(patch.mesh.visible).toBe(false);

    patch.setVisible(true);
    expect(patch.mesh.visible).toBe(true);

    patch.clearSurface();
    expect(patch.mesh.visible).toBe(false);
  });

  it('disposes its shader without owning the externally managed texture', () => {
    const patch = new TattooPatch(new BufferGeometry());
    const materialDispose = vi.spyOn(patch.mesh.material, 'dispose');

    patch.dispose();

    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('reports when the rotated physical patch crosses the UV seam', () => {
    const patch = new TattooPatch(new BufferGeometry());
    patch.updateSurface('left', frame, radii());

    expect(
      patch.crossesSeam(
        createTattooAnchor({
          region: 'leftForearm',
          u: 0.5,
          v: 0.05,
          width: 0.2,
          height: 0.3,
          rotation: 0,
        }),
      ),
    ).toBe(true);
    expect(
      patch.crossesSeam(
        createTattooAnchor({
          region: 'leftForearm',
          u: 0.5,
          v: 0.5,
          width: 0.2,
          height: 0.3,
          rotation: 0,
        }),
      ),
    ).toBe(false);
  });
});

function radii() {
  return {
    wrist: { radial: 0.2, tangent: 0.16 },
    elbow: { radial: 0.3, tangent: 0.24 },
  };
}
