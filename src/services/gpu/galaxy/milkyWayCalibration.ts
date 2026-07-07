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
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../data/milkyWay/milkyWayGalaxyParams';
import { outerRadiusOf } from './outerRadiusOf';

/**
 * Disk radius in Mpc — a pure unit conversion of the physical fact, which
 * lives in the data layer (`galacticCenter.ts`'s `MILKY_WAY_DISC_RADIUS_KPC`,
 * alongside the Sgr A* centre it is calibrated against). The rendered
 * cloud, the pick billboard, and the selection ring all size from that one
 * number; this module only derives the Mpc form the renderer-side formulas
 * consume. Data must not import from services, so the kpc → Mpc conversion
 * happens here rather than the other way around.
 */
export const MILKY_WAY_RADIUS_MPC = MILKY_WAY_DISC_RADIUS_KPC / 1000;

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
export const MILKY_WAY_STAR_PX_MAX = 48.0;

/**
 * Emission factor into the app's HDR -> tonemap chain. Initial value is the
 * tool's tuned starIntensity default (`createGalaxyEngine.ts`'s render
 * defaults); expect a tuning loop at the visual gate since the app's post
 * chain differs from the tool's.
 */
export const MILKY_WAY_EXPOSURE = 0.11;

/**
 * Dimensionless multiplier on the generated star sprite world size. The
 * generation records carry the tool's own sprite sizes, tuned against the
 * tool's reference gallery; the app renders the same cloud against a busier
 * background (the full point-cloud sky), so sprites read fatter here than
 * they did in the tool. This scale shrinks them at draw time without
 * touching the generated data or the px clamp above. Tuned at the visual
 * gate like its neighbors.
 */
export const MILKY_WAY_STAR_SIZE_SCALE = 0.7;

/**
 * NDC apparent-size scale of the flux-conserving star LOD (0 disables).
 * Each star hashes a stable per-star fraction of this threshold; a star
 * whose projected NDC half-extent is smaller than roughly its hashed
 * fraction is culled in the VERTEX stage (degenerate quad, zero
 * fragments), and the survivors are brightened up to 3x so the total
 * light of the field holds — no popping, no dimming as stars drop out.
 * This is the first perf lever: at mid/far views the full star budget of
 * additive subpixel sprites collapses onto a handful of pixels, and
 * additive blending serializes the blender per pixel. Kept in NDC (not
 * px) because the hash band was tuned in NDC units in the tool. Tuned at
 * the visual gate like its neighbors.
 */
export const MILKY_WAY_LOD_APPARENT = 0.02;

/**
 * Apparent-size fade band, px of on-screen diameter. The cloud fades on how
 * BIG it looks, not how far away it is — a fixed distance band fires too
 * early on a wide fov or a tall window and too late on a narrow one,
 * whereas an apparent-size band adapts to both for free. At or above
 * `FULL_PX` the cloud draws at full strength; at or below `GONE_PX` it is
 * fully gone — below a few px the sprites collapse into an aliased shimmer,
 * and the Milky Way has no catalog row to fade into (it sits at the origin
 * where no survey row exists), so it hands off to nothing. Tuned at the
 * visual gate like its neighbors.
 */
export const MILKY_WAY_FADE_FULL_PX = 12;
export const MILKY_WAY_FADE_GONE_PX = 8;
