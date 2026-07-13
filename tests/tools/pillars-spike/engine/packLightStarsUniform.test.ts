import { describe, expect, it } from 'vitest';

import { packLightStarsUniform } from '../../../../tools/pillars-spike/src/engine/packLightStarsUniform';
import type { LightStar } from '../../../../tools/pillars-spike/@types/LightStar';

// Offset-lock for the WGSL LightStars struct (lib/scene.wesl): posPower[3]
// then colorUv[3]. The bake, the raymarcher and the billboards all light
// from this buffer — a packing slip moves every shadow in the scene.

const STARS: readonly LightStar[] = [
  { position: [1, 2, 3], power: 10, color: [0.1, 0.2, 0.3], uv: 5 },
  { position: [4, 5, 6], power: 20, color: [0.4, 0.5, 0.6], uv: 6 },
  { position: [7, 8, 9], power: 30, color: [0.7, 0.8, 0.9], uv: 7 },
];

describe('packLightStarsUniform', () => {
  it('packs posPower[3] then colorUv[3]', () => {
    const out = packLightStarsUniform(STARS);
    expect(out.length).toBe(24);
    expect(Array.from(out.slice(0, 12))).toEqual([1, 2, 3, 10, 4, 5, 6, 20, 7, 8, 9, 30]);
    const colors = Array.from(out.slice(12, 24)).map((v) => Math.round(v * 10) / 10);
    expect(colors).toEqual([0.1, 0.2, 0.3, 5, 0.4, 0.5, 0.6, 6, 0.7, 0.8, 0.9, 7]);
  });

  it('rejects a star count that disagrees with WGSL LIGHT_STAR_COUNT', () => {
    expect(() => packLightStarsUniform(STARS.slice(0, 2))).toThrow(/exactly 3/);
  });
});
