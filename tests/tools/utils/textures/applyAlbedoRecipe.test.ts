import { describe, expect, it } from 'vitest';

import { applyAlbedoRecipe } from '../../../../tools/utils/textures/applyAlbedoRecipe';
import { linearToSrgb } from '../../../../tools/utils/color/linearToSrgb';
import type { AlbedoApply } from '../../../../tools/textures/AlbedoApply';

const NEUTRAL_APPLY: AlbedoApply = {
  deshade: { strength: 0, minShading: 0.3 },
  knee: { threshold: 1, softness: 1 },
  ice: { minAbsLatDeg: 55, fadeDeg: 8, minWhiteness: 0.6, minLuminance: 0.35 },
  grade: {
    exposureEv: 0,
    gain: [1, 1, 1],
    offset: [0, 0, 0],
    contrast: 1,
    saturation: 1,
    gamma: 1,
  },
};

// Off the equator, but inside every ice gate, so the ice-keep test can flip
// it off purely by moving to a low latitude.
const POLAR_ICE: AlbedoApply['ice'] = {
  minAbsLatDeg: 55,
  fadeDeg: 8,
  minWhiteness: 0.6,
  minLuminance: 0.35,
};

const FLAT_SAMPLE = () => ({ sx: 0, sy: 0, gx: 0, gy: 0, latDeg: 0 });

describe('applyAlbedoRecipe', () => {
  it('returns the input bytes exactly at the neutral recipe (256 grey levels + random RGB)', () => {
    const greys = Array.from({ length: 256 }, (_, byte) => byte);
    const width = greys.length;
    const rgba = new Uint8Array(width * 4);
    for (let i = 0; i < width; i++) {
      rgba[i * 4] = greys[i]!;
      rgba[i * 4 + 1] = greys[i]!;
      rgba[i * 4 + 2] = greys[i]!;
      rgba[i * 4 + 3] = 255;
    }
    const out = applyAlbedoRecipe(rgba, width, 1, FLAT_SAMPLE, NEUTRAL_APPLY);
    expect(out).toEqual(rgba);

    // Fixed, not Math.random(): a failure must reproduce on the next run.
    const rand = Array.from({ length: 300 }, (_, i) => (i * 97 + 53) % 256);
    const randomWidth = rand.length / 3;
    const randomRgba = new Uint8Array(randomWidth * 4);
    for (let i = 0; i < randomWidth; i++) {
      randomRgba[i * 4] = rand[i * 3]!;
      randomRgba[i * 4 + 1] = rand[i * 3 + 1]!;
      randomRgba[i * 4 + 2] = rand[i * 3 + 2]!;
      randomRgba[i * 4 + 3] = 255;
    }
    const randomOut = applyAlbedoRecipe(randomRgba, randomWidth, 1, FLAT_SAMPLE, NEUTRAL_APPLY);
    expect(randomOut).toEqual(randomRgba);
  });

  it('copies alpha-0 pixels untouched', () => {
    const rgba = new Uint8Array([200, 100, 50, 0]);
    const out = applyAlbedoRecipe(rgba, 1, 1, FLAT_SAMPLE, {
      ...NEUTRAL_APPLY,
      deshade: { strength: 1, minShading: 0.3 },
    });
    expect(out).toEqual(rgba);
  });

  it('de-shades a flat-albedo image lit by (1 + g·s) to constant luminance within 1 DN', () => {
    const albedo = 0.3;
    const g: readonly [number, number] = [0.4, -0.2];
    const width = 8;
    const slopes: Array<readonly [number, number]> = Array.from({ length: width }, (_, px) => [
      -0.3 + px * 0.08,
      0.1 - px * 0.03,
    ]);
    const rgba = new Uint8Array(width * 4);
    for (let px = 0; px < width; px++) {
      const [sx, sy] = slopes[px]!;
      const shade = 1 + g[0] * sx + g[1] * sy;
      const byte = Math.round(linearToSrgb(Math.min(1, Math.max(0, albedo * shade))) * 255);
      rgba[px * 4] = byte;
      rgba[px * 4 + 1] = byte;
      rgba[px * 4 + 2] = byte;
      rgba[px * 4 + 3] = 255;
    }

    const apply: AlbedoApply = {
      ...NEUTRAL_APPLY,
      deshade: { strength: 1, minShading: 0.01 },
    };
    const out = applyAlbedoRecipe(
      rgba,
      width,
      1,
      (px) => {
        const [sx, sy] = slopes[px]!;
        return { sx, sy, gx: g[0], gy: g[1], latDeg: 0 };
      },
      apply,
    );

    const expectedByte = Math.round(linearToSrgb(albedo) * 255);
    for (let px = 0; px < width; px++) {
      expect(Math.abs(out[px * 4]! - expectedByte)).toBeLessThanOrEqual(1);
    }
  });

  it('keeps a white, bright pixel at 80°S but corrects the same pixel at 10°N', () => {
    // A shaded (darkened) white pixel, bright enough (0.7, comfortably past
    // minLuminance + ICE_SOFT) that the luminance gate is fully open: de-shade
    // would brighten it back toward white unless ice-keep intervenes.
    const byte = Math.round(linearToSrgb(0.7) * 255);
    const rgba = new Uint8Array([byte, byte, byte, 255]);
    const apply: AlbedoApply = {
      ...NEUTRAL_APPLY,
      deshade: { strength: 1, minShading: 0.1 },
      ice: POLAR_ICE,
    };
    const sample = (latDeg: number) => () => ({ sx: -0.5, sy: 0, gx: 0.6, gy: 0, latDeg });

    const polar = applyAlbedoRecipe(rgba, 1, 1, sample(-80), apply);
    const equatorial = applyAlbedoRecipe(rgba, 1, 1, sample(10), apply);

    expect(polar[0]).toBe(byte);
    expect(equatorial[0]).not.toBe(byte);
  });
});
