import { describe, expect, it } from 'vitest';

import { matchEoxSeaColour } from '../../../tools/textures/matchEoxSeaColour';

const SIZE = 32;

function uniformRgba(r: number, g: number, b: number, a = 255): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

describe('matchEoxSeaColour', () => {
  it('pushes EOX-navy deep water toward BMNG sea blue', async () => {
    const water = uniformRgba(18, 49, 82);
    const out = await matchEoxSeaColour(water, SIZE, SIZE);

    // Blue-dominant, dark input scores as water everywhere (uniform image, so
    // the blur used for the mask leaves it unchanged) — every pixel should
    // move toward BMNG's brighter, more saturated sea blue.
    expect(out[2]).toBeGreaterThan(110);
    expect(out[0]).not.toBe(18);
    expect(out[1]).not.toBe(49);
  });

  it('leaves land untouched', async () => {
    const land = uniformRgba(40, 70, 45);
    const out = await matchEoxSeaColour(land, SIZE, SIZE);

    expect(out).toEqual(land);
  });
});
