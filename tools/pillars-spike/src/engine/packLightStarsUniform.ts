import type { LightStar } from '../../@types/LightStar';

/**
 * Pack the light stars into the WGSL `LightStars` uniform layout
 * (lib/scene.wesl):
 *
 *   floats  0..11  posPower[3] — xyz position, w luminous power
 *   floats 12..23  colorUv[3]  — rgb colour,   w ionizing strength
 *
 * Pure and offset-critical: tests/tools/pillars-spike/engine/
 * packLightStarsUniform.test.ts locks these offsets. A silent mismatch
 * against the WGSL struct lights the nebula from garbage positions with
 * no validation error — the bug class this file exists to contain.
 */
export function packLightStarsUniform(stars: readonly LightStar[]): Float32Array {
  if (stars.length !== 3) {
    throw new Error(`LightStars uniform holds exactly 3 stars, got ${stars.length}`);
  }
  const out = new Float32Array(24);
  for (let i = 0; i < 3; i++) {
    const s = stars[i]!;
    out[i * 4 + 0] = s.position[0];
    out[i * 4 + 1] = s.position[1];
    out[i * 4 + 2] = s.position[2];
    out[i * 4 + 3] = s.power;
    out[12 + i * 4 + 0] = s.color[0];
    out[12 + i * 4 + 1] = s.color[1];
    out[12 + i * 4 + 2] = s.color[2];
    out[12 + i * 4 + 3] = s.uv;
  }
  return out;
}
