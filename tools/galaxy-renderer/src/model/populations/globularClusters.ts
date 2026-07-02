/**
 * buildGlobularClusters — tight balls of old stars scattered through the
 * halo, each with its own base hue and per-star colour spread. Ported from
 * galaxy-model.js:453-471.
 *
 * Cluster count comes straight from `params.globularCount` (floored, default
 * 0) — unlike bulge/disk/arm/halo it isn't part of `StarBudget`'s split,
 * since globular clusters are an *addition* on top of the four structural
 * populations, not a share of the same total. Every cluster writes exactly
 * `STARS_PER_CLUSTER` (90, model.js:119) records: no rejection, no gap
 * `continue` anywhere in this builder, so the final count is always
 * `clusterCount * STARS_PER_CLUSTER`.
 */
import { tempColor } from '../tempColor';
import type { GalaxyBuildContext } from '../../../@types/model/GalaxyBuildContext';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const STARS_PER_CLUSTER = 90;

export function buildGlobularClusters(ctx: GalaxyBuildContext): void {
  const { rand, params, outerRadius, starSize, addStar } = ctx;
  const gSize = params.globularSize ?? 1;
  const gBright = params.globularBright ?? 0.6;
  const clusterCount = Math.floor(params.globularCount || 0);
  const rgb: Vec3 = [0, 0, 0];

  for (let c = 0; c < clusterCount; c++) {
    const dist = outerRadius * (0.35 + 1.0 * Math.pow(rand(), 0.5));
    const cosLat = 2 * rand() - 1;
    const sinLat = Math.sqrt(1 - cosLat * cosLat);
    const lon = 2 * Math.PI * rand();
    const centerX = dist * sinLat * Math.cos(lon);
    const centerZ = dist * sinLat * Math.sin(lon);
    const centerY = dist * cosLat * 0.85;
    // Real GCs are compact and span a wide range: a few rich/bright, many
    // small/faint. 'richness' is skewed toward the low end (product of two
    // uniforms).
    const richness = 0.3 + 0.9 * rand() * rand();
    const clusterRadius =
      outerRadius * (0.003 + 0.01 * Math.pow(rand(), 1.8)) * gSize * (0.7 + 0.6 * richness);
    const clusterHue = 0.26 + 0.2 * rand();

    for (let j = 0; j < STARS_PER_CLUSTER; j++) {
      const d = clusterRadius * Math.pow(rand(), 0.7); // concentrated core
      const cl = 2 * rand() - 1;
      const sl = Math.sqrt(1 - cl * cl);
      const ln = 2 * Math.PI * rand();
      tempColor(clusterHue + (rand() - 0.5) * 0.16, rgb);
      addStar(
        centerX + d * sl * Math.cos(ln),
        centerY + d * cl,
        centerZ + d * sl * Math.sin(ln),
        rgb[0],
        rgb[1],
        rgb[2],
        starSize * (0.5 + 0.22 * rand()),
        (0.18 + 0.32 * rand()) * gBright * richness,
      );
    }
  }
}
