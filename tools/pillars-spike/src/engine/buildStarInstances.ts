import type { LightStar } from '../../@types/LightStar';

/**
 * Build the star-billboard instance buffer: the 3 light stars first (their
 * billboard params derived from the same power/colour that drives the
 * lighting — one source of truth), then `clusterCount` fainter cluster
 * members scattered deterministically around the cluster centroid.
 *
 * Instance layout, 8 floats (32 bytes) per star, matching stars.wesl's
 * vertex attributes:
 *
 *   [0..2] position   [3] billboard half-size (world units)
 *   [4..6] colour     [7] intensity (HDR)
 *
 * Determinism: a seeded LCG, not Math.random, so a given seed always
 * yields the same cluster — reload-stable framing while iterating, and a
 * testable contract (tests/tools/pillars-spike/engine/
 * buildStarInstances.test.ts locks stride, hero-star fidelity, and
 * determinism).
 *
 * Billboard size grows sub-linearly with power (∝ ⁴√power) while INTENSITY
 * carries the brightness: point sources stay point-like and the bloom
 * pyramid renders the glow — see stars.wesl's header for that division of
 * labour.
 */
export function buildStarInstances(
  lightStars: readonly LightStar[],
  clusterCount: number,
  seed: number,
): Float32Array {
  if (lightStars.length !== 3) {
    throw new Error(
      `expected exactly 3 light stars (WGSL LIGHT_STAR_COUNT), got ${lightStars.length}`,
    );
  }
  const out = new Float32Array((lightStars.length + clusterCount) * 8);

  lightStars.forEach((s, i) => {
    const o = i * 8;
    out[o + 0] = s.position[0];
    out[o + 1] = s.position[1];
    out[o + 2] = s.position[2];
    out[o + 3] = 0.035 * Math.pow(s.power, 0.25);
    out[o + 4] = s.color[0];
    out[o + 5] = s.color[1];
    out[o + 6] = s.color[2];
    out[o + 7] = s.power * 0.9;
  });

  // Park-Miller-ish LCG on 32-bit state; [0,1) per draw.
  let state = seed >>> 0 || 1;
  const rand = (): number => {
    state = (Math.imul(state, 48271) + 1) >>> 0;
    return state / 4294967296;
  };

  // Cluster centroid sits between the two main ionizers, above the box.
  const cx = -0.3;
  const cy = 2.35;
  const cz = 0.2;
  for (let i = 0; i < clusterCount; i++) {
    const o = (lightStars.length + i) * 8;
    // Box-Muller-free gaussian-ish spread: sum of three uniforms, centred.
    const g = (): number => (rand() + rand() + rand()) / 1.5 - 1.0;
    out[o + 0] = cx + g() * 1.05;
    out[o + 1] = cy + g() * 0.55;
    out[o + 2] = cz + g() * 0.9;
    // Steep power law again: mostly faint members, occasionally a standout.
    const brightness = 0.4 + Math.pow(rand(), 4.0) * 5.0;
    out[o + 3] = 0.012 + 0.02 * Math.pow(brightness / 5.0, 0.5);
    // Cool-to-hot colour ramp, biased hot (it's a young open cluster).
    const heat = 0.35 + 0.65 * rand();
    out[o + 4] = 1.0 - 0.28 * heat;
    out[o + 5] = 0.86;
    out[o + 6] = 0.72 + 0.28 * heat;
    out[o + 7] = brightness;
  }
  return out;
}
