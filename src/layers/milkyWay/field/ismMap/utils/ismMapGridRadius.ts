import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyIsmMapGridRadius } from '../@types/GalaxyIsmMapGridRadius';

/** Forcing is zero below `armStartRadius` (this file's own skip), so this margin only lets percolation leak inward instead of hard-stopping there. */
const ISM_MAP_INNER_MARGIN_FRAC = 0.6;

/** Degenerate-galaxy guard: `ismMapRingRadius`'s log spacing needs rMax clear of rMin. */
const ISM_MAP_MIN_SPAN_RATIO = 2;

/**
 * The radius bounds one generated galaxy's log-radial grid spans. The outer
 * edge covers the outermost arm's `fadeRadius`, not `outerRadius`: dust is
 * ISM-map-seeded only where this grid has data, so stopping at
 * `outerRadius` leaves a hard edge mid-arm. Rings are log-spaced over a
 * fixed `ISM_MAP_RINGS`, so widening rMax spends radial resolution on the
 * newly-covered outer arm — raise `ISM_MAP_RINGS` if inner detail suffers.
 */
export function ismMapGridRadius(geometry: GalaxyDescription): GalaxyIsmMapGridRadius {
  const rMin = Math.max(geometry.armStartRadius * ISM_MAP_INNER_MARGIN_FRAC, 1e-3);
  const outerArmRadius =
    geometry.numArms > 0 && geometry.arms.length > 0
      ? Math.max(...geometry.arms.map((arm) => arm.fadeRadius))
      : geometry.outerRadius;
  const rMax = Math.max(outerArmRadius, rMin * ISM_MAP_MIN_SPAN_RATIO);
  return { rMin, rMax };
}
