import type { LightStar } from '../../@types/LightStar';

/**
 * The three ionizing stars — the spike's stand-in for the NGC 6611 cluster
 * that sculpts and lights the real M16 pillars.
 *
 * This array is the SINGLE source of truth for star data: it feeds the
 * LightStars uniform (bake + raymarch + in-scatter, via
 * packLightStarsUniform) and seeds the billboard instance buffer (via
 * buildStarInstances), so the light that carves the shadows and the bright
 * point you see are always the same star. WGSL's LIGHT_STAR_COUNT (= 3, in
 * lib/scene.wesl) must match this length — buildStarInstances asserts it.
 *
 * Placement notes (world units; the volume box spans ±1.2 × ±1.5 × ±1.2):
 * all three sit OUTSIDE the box, up and off-axis, as the real cluster sits
 * northwest of the pillars — so the illumination gradient runs top-lit,
 * the pillar tips catch the hardest rim light, and each column shadows
 * the gas below it (the very mechanism that forms pillars).
 */
export const LIGHT_STARS: readonly LightStar[] = [
  // The O-star protagonist: hot, blue-white, dominant ionizer.
  { position: [-1.5, 2.3, 0.9], power: 30, color: [0.72, 0.82, 1.0], uv: 5.0 },
  // Second cluster member, slightly behind the columns for silhouetting.
  { position: [0.7, 2.6, -0.5], power: 18, color: [0.78, 0.85, 1.0], uv: 3.0 },
  // Cooler foreground fill star to the side — softens the shadowed faces.
  { position: [2.0, 0.6, 1.6], power: 8, color: [1.0, 0.9, 0.78], uv: 1.2 },
];
