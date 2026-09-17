import { describe, expect, it } from 'vitest';

import type { ColourGrade } from '../../../src/@types/scene/ColourGrade';
import type { AlbedoDelight } from '../../../tools/textures/AlbedoDelight';
import { constantHeightSource } from '../../../tools/textures/constantHeightSource';
import { delightedImagerySource } from '../../../tools/textures/delightedImagerySource';
import type { HeightSource } from '../../../tools/textures/HeightSource';
import type { SurfaceImagerySource } from '../../../tools/textures/SurfaceImagerySource';
import { heightLatticeStepDeg } from '../../../tools/utils/textures/heightLatticeStepDeg';

const IDENTITY_GRADE: ColourGrade = {
  ev: 0,
  contrast: 1,
  gamma: 1,
  saturation: 1,
  gain: [1, 1, 1],
  offset: [0, 0, 0],
};

const NO_DELIGHT: AlbedoDelight = {
  reliefShade: 0,
  photoSunAzDeg: 64,
  photoSunElDeg: 28,
  reliefExaggeration: 6,
  flatten: 0,
  flattenRadiusDeg: 1.2,
  knee: 0.7,
  tame: 0,
  keepIce: 0.7,
};

function fixedRaster(bytes: readonly number[]): SurfaceImagerySource {
  return {
    id: 'test-source',
    attribution: 'test',
    maxLevel: 7,
    coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
    provenance: { sourceId: 'test-source', attribution: 'test', vintage: 'n/a' },
    async readBox() {
      return new Uint8Array(bytes);
    },
  };
}

/** A globally uniform north-south slope — height rises by `gradientMPerDeg`
 *  per degree of latitude. Constant in longitude, so its normal (and the
 *  relief-shading ratio it produces) is the SAME everywhere: one scalar tilt
 *  to compare a "faces the sun" case against a "faces away" one. */
function tiltedHeightSource(gradientMPerDeg: number): HeightSource {
  const attribution = 'synthetic tilted plane (test only)';
  return {
    id: 'tilted-plane',
    attribution,
    maxLevel: Number.POSITIVE_INFINITY,
    coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
    provenance: { sourceId: 'tilted-plane', attribution, vintage: 'n/a' },
    async readGrid(z, _i0, j0, nx, ny) {
      const step = heightLatticeStepDeg(z);
      const out = new Float32Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        const lat = 90 - (j0 + j) * step;
        out.fill(gradientMPerDeg * lat, j * nx, (j + 1) * nx);
      }
      return out;
    },
    async boundsInBox() {
      return [-Math.abs(gradientMPerDeg) * 90, Math.abs(gradientMPerDeg) * 90];
    },
  };
}

describe('delightedImagerySource', () => {
  it('returns the input bytes when every delighting knob is off, under an identity grade', async () => {
    const pixels = [10, 20, 30, 255, 200, 150, 100, 128, 0, 0, 0, 0];
    const wrapped = delightedImagerySource(
      fixedRaster(pixels),
      constantHeightSource(0),
      NO_DELIGHT,
      IDENTITY_GRADE,
    );
    const out = await wrapped.readBox({ west: 0, east: 1, south: 0, north: 1 }, 3, 1);
    expect(Array.from(out!)).toEqual(pixels);
  });

  it('brightens the slope facing away from the sun relative to the one facing it', async () => {
    // Sun due north (az 0) at 45° elevation. A slope that rises NORTHWARD
    // (gradient > 0) tilts its outward normal SOUTH — away from that sun, so
    // the baked photo reads dark there and de-lighting must brighten it. A
    // slope that rises SOUTHWARD (gradient < 0) faces the sun and must darken.
    // This is `gy`'s sign end to end: flip it in `buildReliefShadeField` and
    // the two cases swap, or collapse to the same value (mutation-verified).
    const DELIGHT: AlbedoDelight = {
      reliefShade: 0.8,
      photoSunAzDeg: 0,
      photoSunElDeg: 45,
      reliefExaggeration: 1,
      flatten: 0,
      flattenRadiusDeg: 1.2,
      knee: 0.7,
      tame: 0,
      keepIce: 0,
    };
    const GREY = [128, 128, 128, 255];
    const GRADIENT_M_PER_DEG = 2000;
    const box = { west: 0, east: 1, south: 9, north: 10 };

    const awayFromSun = delightedImagerySource(
      fixedRaster(GREY),
      tiltedHeightSource(GRADIENT_M_PER_DEG),
      DELIGHT,
      IDENTITY_GRADE,
    );
    const facingSun = delightedImagerySource(
      fixedRaster(GREY),
      tiltedHeightSource(-GRADIENT_M_PER_DEG),
      DELIGHT,
      IDENTITY_GRADE,
    );

    const awayOut = await awayFromSun.readBox(box, 1, 1);
    const facingOut = await facingSun.readBox(box, 1, 1);

    expect(awayOut![0]).toBeGreaterThan(GREY[0]!);
    expect(facingOut![0]).toBeLessThan(GREY[0]!);
  });
});
