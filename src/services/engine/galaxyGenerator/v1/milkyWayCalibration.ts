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
import type { Tier } from '../../../../@types/data/Tier';
import type { MilkyWayTuning } from '../../../../@types/settings/MilkyWayTuning';
import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../data/milkyWay/galacticCenter';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../data/milkyWay/milkyWayGalaxyParams';
import { outerRadiusOf } from '../shared/outerRadiusOf';

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
 * Per-tier star-count SEEDS. `medium` IS the preset's `starCount` — the tier
 * the preset was tuned against — so it's asserted equal rather than
 * duplicated; `small`/`large` derive from it by half/double rather than
 * carrying three independently-tunable numbers that could quietly drift
 * apart.
 *
 * Not read by `milkyWayCloud.generate` — the live `settings.milkyWay.starCount`
 * is an absolute count, not a per-tier multiplier, so generation never
 * indexes this table directly. It is read by `watchTierSaga`, which re-seeds
 * `starCount` from here on every explicit tier change (see `MilkyWayTuning`'s
 * docblock for why: an absolute count would otherwise decouple the cloud from
 * tier LOD entirely) and by `MILKY_WAY_TUNING_DEFAULTS` below for the boot
 * value.
 *
 * `GalaxyLegacyParams.starCount` is optional on the type, even though this
 * particular preset always sets it — the `|| 0` satisfies the type checker
 * the same way `outerRadiusOf` falls back on `params.shared.radius || 1`; it
 * never actually applies at runtime.
 */
const presetStarCount = MILKY_WAY_GALAXY_PARAMS.legacy?.starCount || 0;

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
 * One object rather than a scalar per knob because every one of them has
 * exactly one consumer — the settings seed. Separate constants would only add
 * a hop between the number and the field it seeds.
 */
export const MILKY_WAY_TUNING_DEFAULTS: MilkyWayTuning = {
  // starSizeScale / exposure / softness / starPxMax below were dialled as ONE
  // visual-gate pass toward the smooth-field end of the count/size trade (the
  // "Celestia end" note in `MILKY_WAY_SLIDER_FIELDS`): half the star budget,
  // fatter and softer splats, exposure cut to hold total light. Under additive
  // blending that light goes as roughly count * exposure * size^2, so moving
  // any one of them alone changes brightness rather than only shape.
  starSizeScale: 1.85,
  exposure: 0.0385,
  // A 1 px floor is the mildest anti-sparkle setting that still stops a
  // distant star from vanishing entirely between frames.
  starPxMin: 1.0,
  // 119 target px — 357 screen px at the divisor below — bounds the foreground
  // swell on a close flythrough without visibly flattening the near disc into
  // equal-sized discs.
  starPxMax: 119.0,
  // Full broad Gaussian. At this sprite size the tight core+glow profile the
  // generation preset was tuned against reads as visible particles; the
  // Gaussian carries the same integral, so this is shape only.
  softness: 1,
  // The first perf lever. At mid/far views the full star budget of additive
  // subpixel sprites collapses onto a handful of pixels, and additive
  // blending serializes the blender per pixel. In NDC (not px) because the
  // hash band was tuned in NDC units in the tool.
  lodApparent: 0.02,
  // Third resolution for the `mw-aggregate` offscreen: 1/9th of the star
  // pass's fragments, at a reconstruction blur the broad Gaussian profile
  // above hides completely (the survey's `star-aggregates` row only halves,
  // because its sprites stay tight). `starPxMin` / `starPxMax` above are
  // stated in pixels OF THAT TARGET, so this number and those two are one
  // trade — change it and they move with it.
  aggregateDivisor: 3,
  // By reference to `MILKY_WAY_STARS_PER_TIER.medium`, never a copied
  // literal: medium IS the tier the preset was tuned against, and the tier
  // slice always boots at 'medium' (see `tierSlice.ts`), so this reproduces
  // exactly what shipped before this knob existed. Moving it live is a
  // count/size trade-off exploration, not a steady-state look — see
  // `MILKY_WAY_SLIDER_FIELDS`'s `starCount` row.
  starCount: MILKY_WAY_STARS_PER_TIER.medium,
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
