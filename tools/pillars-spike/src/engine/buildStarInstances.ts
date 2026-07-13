import type { LightStar } from '../../@types/LightStar';

/**
 * Build the star-billboard instance buffer: the 3 light stars first (their
 * billboard params derived from the same power/colour that drives the
 * lighting — one source of truth), then `clusterCount` fainter cluster
 * members scattered deterministically around the cluster centroid, then
 * `pillarCount` embedded stars seeded along the pillar spines.
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

/**
 * The three pillar spines, mirroring generateField.wesl's sdPillar calls
 * (base, tip, rBase). The WESL is the source of truth for the sculpt; this
 * mirror only needs to be close enough that stars seeded along it land
 * inside the dust — the domain warp gnarls the actual columns around these
 * axes anyway, and stars.wesl's vertex-stage transmittance march does the
 * honest work of dimming/reddening whatever ends up embedded.
 */
const PILLAR_SPINES = [
  { base: [-0.62, -1.55, 0.08], tip: [-0.3, 1.02, -0.1], rBase: 0.4 },
  { base: [0.1, -1.55, -0.24], tip: [0.34, 0.4, -0.16], rBase: 0.3 },
  { base: [0.62, -1.55, 0.16], tip: [0.8, 0.02, 0.3], rBase: 0.22 },
] as const;

/**
 * Embedded protostars — one bright young stellar object per pillar head,
 * placed at the dense EGG cocoons studding the tips. Positions MIRROR the
 * primary egg centre of each head in generateField.wesl (the `eggs` array's
 * first entry per pillar). Each star shines from inside its cocoon;
 * stars.wesl's occlusion march reddens it through the surrounding dust,
 * giving the glowing-embedded-protostar look M16 is full of. Fixed like the
 * pillar skeleton — reseeding restyles the noise, not the anatomy.
 */
const PROTOSTARS = [
  [-0.36, 0.9, -0.04],
  [0.28, 0.36, -0.1],
  [0.75, -0.03, 0.25],
] as const;

export function buildStarInstances(
  lightStars: readonly LightStar[],
  clusterCount: number,
  pillarCount: number,
  seed: number,
): Float32Array {
  if (lightStars.length !== 3) {
    throw new Error(
      `expected exactly 3 light stars (WGSL LIGHT_STAR_COUNT), got ${lightStars.length}`,
    );
  }
  const out = new Float32Array(
    (lightStars.length + clusterCount + pillarCount + PROTOSTARS.length) * 8,
  );

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

  // Cluster centroid sits just above the pillar tips, INSIDE the framed
  // scene. The ionizing LIGHT stars deliberately live higher and off-axis
  // (see lightStars.ts — that's what top-lights the sculpt); parking the
  // decorative members up there too made the star field read as a
  // detached second scene at ~2x the nebula's scale, so the visible
  // cluster is scoped to the volume's proportions instead.
  const cx = -0.15;
  const cy = 1.35;
  const cz = 0.0;
  for (let i = 0; i < clusterCount; i++) {
    const o = (lightStars.length + i) * 8;
    // Box-Muller-free gaussian-ish spread: sum of three uniforms, centred.
    const g = (): number => (rand() + rand() + rand()) / 1.5 - 1.0;
    out[o + 0] = cx + g() * 0.65;
    out[o + 1] = cy + g() * 0.4;
    out[o + 2] = cz + g() * 0.55;
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

  // Embedded pillar stars: young stellar objects seeded along the column
  // spines. Positions lerp base→tip and jitter radially within the local
  // taper radius, so most land INSIDE the dust — stars.wesl's per-vertex
  // transmittance march then dims and reddens them by however much column
  // sits in front, which is the whole point: faint warm points glimmering
  // through the dust, not painted on top of it.
  for (let i = 0; i < pillarCount; i++) {
    const o = (lightStars.length + clusterCount + i) * 8;
    // Weight column choice by base radius so the fat left pillar hosts
    // proportionally more stars than the thin right one.
    const pick = rand() * (0.4 + 0.3 + 0.22);
    const spine = pick < 0.4 ? PILLAR_SPINES[0] : pick < 0.7 ? PILLAR_SPINES[1] : PILLAR_SPINES[2];
    const h = rand();
    // Same taper profile as sdPillar, sans the head swell — jitter within
    // ~half the local radius keeps stars in the column body.
    const r = spine.rBase * (1.0 - 0.62 * Math.pow(h, 1.4)) * 0.5;
    const g = (): number => (rand() + rand() + rand()) / 1.5 - 1.0;
    out[o + 0] = spine.base[0] + (spine.tip[0] - spine.base[0]) * h + g() * r;
    out[o + 1] = spine.base[1] + (spine.tip[1] - spine.base[1]) * h + g() * r;
    out[o + 2] = spine.base[2] + (spine.tip[2] - spine.base[2]) * h + g() * r;
    // Fainter than the open cluster, and warm: embedded YSOs, further
    // reddened chromatically by the occlusion march.
    const brightness = 0.3 + Math.pow(rand(), 3.5) * 2.2;
    out[o + 3] = 0.01 + 0.014 * Math.sqrt(brightness / 2.5);
    const heat = 0.4 * rand();
    out[o + 4] = 1.0;
    out[o + 5] = 0.72 + 0.16 * heat;
    out[o + 6] = 0.5 + 0.3 * heat;
    out[o + 7] = brightness;
  }

  // Protostars: bright warm cores at the cocoons. Brighter than the loose
  // cluster (they read as the pillar heads' luminous hearts) but well below
  // the ionizing trio, and deliberately reddened — the occlusion march
  // dims them through their own dense cocoon so they glow rather than glare.
  PROTOSTARS.forEach((pos, i) => {
    const o = (lightStars.length + clusterCount + pillarCount + i) * 8;
    out[o + 0] = pos[0];
    out[o + 1] = pos[1];
    out[o + 2] = pos[2];
    const brightness = 3.0 + rand() * 2.0;
    out[o + 3] = 0.02 + 0.012 * Math.sqrt(brightness / 4.0);
    out[o + 4] = 1.0;
    out[o + 5] = 0.74;
    out[o + 6] = 0.52;
    out[o + 7] = brightness;
  });

  return out;
}
