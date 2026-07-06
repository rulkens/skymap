/**
 * milkyWayCalibration — every hand-tuned constant the Milky Way point-cloud
 * renderer needs, in one file. The generation preset (`MILKY_WAY_GALAXY_PARAMS`)
 * decides what the galaxy *looks like* (arm count, bar, warp, ...); this module
 * decides how that generated cloud gets placed and lit in the app's scene
 * (its physical size, its per-tier star budget, its on-screen sprite size, its
 * brightness). Splitting the two means a visual-gate tuning pass touches only
 * this file, never the shared preset the tool's reference gallery also reads.
 */
import type { Tier } from '../../../@types/data/Tier';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../data/milkyWay/milkyWayGalaxyParams';
import { outerRadiusOf } from './outerRadiusOf';

/**
 * Disk radius in Mpc — the impostor's value (the impostor's fragment shader
 * carried this as a WESL const; this is the canonical home now that the
 * point cloud replaces it).
 */
export const MILKY_WAY_RADIUS_MPC = 0.03;

/**
 * Per-tier star budgets. `medium` IS the preset's `starCount` — the tier the
 * preset was tuned against — so it's asserted equal rather than duplicated;
 * `small`/`large` derive from it by half/double rather than carrying three
 * independently-tunable numbers that could quietly drift apart.
 *
 * `GalaxyParams.starCount` is optional on the type (every field but `type`
 * is), even though this particular preset always sets it — the `|| 0`
 * satisfies the type checker the same way `outerRadiusOf` falls back on
 * `params.radius || 1`; it never actually applies at runtime.
 */
const presetStarCount = MILKY_WAY_GALAXY_PARAMS.starCount || 0;

export const MILKY_WAY_STARS_PER_TIER: Record<Tier, number> = {
  small: presetStarCount * 0.5,
  medium: presetStarCount,
  large: presetStarCount * 2,
};

/**
 * Local-galaxy-units -> Mpc. The generator works in the units `outerRadiusOf`
 * returns (roughly tens of "local" units); this scale is the one number that
 * reconciles those units with the app's Mpc-scaled scene, derived rather than
 * hand-picked so it always matches whatever `MILKY_WAY_GALAXY_PARAMS.radius`
 * currently is.
 */
export const MILKY_WAY_MODEL_SCALE = MILKY_WAY_RADIUS_MPC / outerRadiusOf(MILKY_WAY_GALAXY_PARAMS);

/**
 * Star sprite screen-size clamp, px. Initial values are starting points —
 * tuned at the visual gate (the px floor is the first anti-sparkle lever:
 * raising it keeps distant/faint stars from vanishing to sub-pixel specks).
 */
export const MILKY_WAY_STAR_PX_MIN = 1.0;
export const MILKY_WAY_STAR_PX_MAX = 64.0;

/**
 * Emission factor into the app's HDR -> tonemap chain. Initial value is the
 * tool's tuned starIntensity default (`createGalaxyEngine.ts`'s render
 * defaults); expect a tuning loop at the visual gate since the app's post
 * chain differs from the tool's.
 */
export const MILKY_WAY_EXPOSURE = 0.11;
