import { describe, expect, it } from 'vitest';

import type { ColourGrade } from '../../../src/@types/scene/ColourGrade';
import type { AlbedoDelight } from '../../../tools/textures/AlbedoDelight';
import { constantHeightSource } from '../../../tools/textures/constantHeightSource';
import { delightedImagerySource } from '../../../tools/textures/delightedImagerySource';
import type { SurfaceImagerySource } from '../../../tools/textures/SurfaceImagerySource';

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
});
