/**
 * milkyWayCalibration — every hand-tuned constant the Milky Way point-cloud
 * renderer needs, in one file. The generation preset (`MILKY_WAY_GALAXY_PARAMS`)
 * decides what the galaxy *looks like* (arm count, bar, warp, ...); this module
 * decides how that generated cloud gets placed and lit in the app's scene
 * (its physical size, its per-tier star budget, its on-screen sprite size, its
 * brightness). Splitting the two means a visual-gate tuning pass touches only
 * this file, never the shared preset the tool's reference gallery also reads.
 *
 * The look knobs are the exception to "constants the renderer needs": they are
 * BOOT values (`MILKY_WAY_TUNING_DEFAULTS`) that `settings.milkyWay` spreads in
 * at startup, and the renderer reads the live settings copy instead. That is
 * what lets the DebugPanel's "Milky Way tuning" sliders move them without a
 * reload; this module stays their single source of truth for where they start.
 */
import type { Tier } from '../../../@types/data/Tier';
import type { MilkyWayTuning } from '../../../@types/settings/MilkyWayTuning';
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
 * Boot values of the star-cloud look knobs — the seed `settings.milkyWay`
 * spreads in, and from there the only home of these numbers. Each is a
 * starting point rather than a settled fact, which is why the live values ride
 * settings (the DebugPanel's "Milky Way tuning" sliders write them) instead of
 * being read straight from this module by the renderer. The knobs' semantics
 * live on `MilkyWayTuning`; the notes here are why each number is what it is.
 *
 * One object rather than six exported scalars because every one of them has
 * exactly one consumer — the settings seed. Separate constants would only add
 * a hop between the number and the field it seeds.
 */
export const MILKY_WAY_TUNING_DEFAULTS: MilkyWayTuning = {
  // The generation records carry the galaxy-renderer tool's own sprite sizes,
  // tuned against that tool's reference gallery; the app draws the same cloud
  // against a busier background (the full point-cloud sky), so sprites read
  // fatter here. 0.7 shrinks them back without touching the generated data.
  starSizeScale: 0.7,
  // The tool's tuned starIntensity default (`createGalaxyEngine.ts`'s render
  // defaults). The app's post chain differs from the tool's, so this is the
  // knob a visual-gate pass moves first.
  exposure: 0.11,
  // A 1 px floor is the mildest anti-sparkle setting that still stops a
  // distant star from vanishing entirely between frames.
  starPxMin: 1.0,
  // 48 target px (96 screen px through the half-res aggregate) bounds the
  // foreground swell on a close flythrough without visibly flattening the
  // near disc into equal-sized discs.
  starPxMax: 48.0,
  // Off by default: the tight core+glow profile is what the generation preset
  // was tuned against. Raising it is the "few large soft splats" experiment.
  softness: 0,
  // The first perf lever. At mid/far views the full star budget of additive
  // subpixel sprites collapses onto a handful of pixels, and additive
  // blending serializes the blender per pixel. In NDC (not px) because the
  // hash band was tuned in NDC units in the tool.
  lodApparent: 0.02,
};

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
