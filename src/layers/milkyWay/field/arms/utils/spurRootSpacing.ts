import type { GalaxyArmSpurTuning } from '../@types/GalaxyArmSpurTuning';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';

/**
 * Root-spacing law: `w/h = FLOOR_H + SLOPE*(R/h)`, the same re-expression
 * idiom `armCrossSigma.ts` uses for Reid et al.'s width
 * law, applied to La Vigne, Vogel & Ostriker (2006)'s measured feather
 * spacing of 300-800 pc (~0.12-0.31 of the Milky Way's 2.605 kpc disc scale
 * length). The floor anchors the inner-disc end of that range; the slope
 * carries it past the upper end at large radius, filling the gap the arm
 * cloud's own contrast law would otherwise leave empty.
 */
const SPUR_SPACING_FLOOR_H = 0.12;

const SPUR_SPACING_SLOPE = 0.03;

/** Physical root-to-root spacing at a radius — read by both the walk below and `deriveArmSpurCloudCount.ts`'s size draw, so a spur's sprites size against the SAME gap its root spacing was drawn from. */
export function spurRootSpacing(
  radius: number,
  geometry: GalaxyDescription,
  tuning: GalaxyArmSpurTuning,
): number {
  return (
    (SPUR_SPACING_FLOOR_H * geometry.diskScaleLen + SPUR_SPACING_SLOPE * radius) *
    Math.max(tuning.spacing, 1e-3)
  );
}
