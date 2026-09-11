/**
 * StarCatalogSettings — star-catalog master gate and per-catalog `items`, the
 * FOURTH source-type cluster (symmetric with `galaxyCatalogs` / `structures` /
 * `volumes`).
 */

import type { StarCatalogId } from '../data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from './StarCatalogItemSettings';

export type StarCatalogSettings = {
  /**
   * TOTAL over the cluster — governs every row, not just the survey one.
   * Every consumer (asset-demand, `starCatalogPass`, `visibleStars`,
   * `foregroundLabelsPass`) reads the pair: the master before
   * `items[id].enabled`. A master governing only some rows would claim
   * authority the Stars panel header couldn't back up.
   */
  enabled: boolean;
  /**
   * Star-billboard pixel radius — the star-catalog twin of
   * `galaxyCatalogs.sizePx`. A shared appearance knob across every star
   * catalog (not per-item); rides the star renderer's size uniform each frame.
   */
  sizePx: number;
  /**
   * User's exposure trim on the starfield — the star-catalog twin of
   * `galaxyCatalogs.brightness`. 1.0 is identity (the shader's calibrated
   * `STAR_FLUX_EXPOSURE` baseline unchanged); multiplies the flux-glow peak,
   * riding the same shared uniform as `sizePx`.
   */
  brightness: number;
  /**
   * The "Detail" knob — the CPU octree-cut refine gate
   * (`walkStarOctreeCut`'s `DEFAULT_REFINE_THRESHOLD`). NOT a GPU uniform:
   * read once per frame and fed to the walk. Lower ⇒ far boxes split
   * earlier ⇒ fewer visible lattice cells at the cost of more drawn nodes.
   */
  refineThreshold: number;
  /**
   * The "Glow overlap" knob — an AGGREGATE-only radius spread. 1.0 is
   * identity; above it a far aggregate's glow grows past its octree-box
   * footprint so neighbours overlap and the box lattice dissolves. The
   * vertex stage divides the Gaussian peak by the same factor
   * (flux-conserving), so it softens the seam without changing total
   * luminance. Rides the shared GPU uniform beside `sizePx` / `brightness`.
   */
  glowOverlap: number;
  /**
   * The three ABSOLUTE display exposures the scale-dependent
   * `starExposureRamp` targets at its distance anchors (1 pc, 3 kpc, 10 kpc).
   * Unlike `brightness` (a flat trim) these shape the cross-scale ramp: fed
   * to `starExposureRamp` per frame. Live so the ramp can be re-eye-tuned
   * against the current star bins' local flux; defaults 6 / 23 / 28 — 6 is
   * also baked into the shader's `STAR_FLUX_EXPOSURE` (the ramp returns 1.0
   * at the near anchor), and the 23 mid anchor sits on the old near→far
   * continuation, so pulling `exposureMidX` down bends only the
   * intermediate few-kpc segment.
   */
  exposureNearX: number;
  exposureMidX: number;
  exposureFarX: number;
  /**
   * The "Fog cap" knob — a ceiling on the per-pixel PEAK intensity of
   * AGGREGATE (octree flux-mip) records only; leaves stay uncapped. Tames
   * the box-filling glow a near sub-threshold aggregate deposits as
   * luminous fog around the Sun. Unlike `glowOverlap` (flux-conserving) it
   * is DELIBERATELY non-physical: light above the ceiling is discarded.
   * Rides the shared GPU uniform beside `sizePx` / `brightness` /
   * `glowOverlap`; default 0.06.
   */
  aggregateIntensityCap: number;
  /**
   * One row per `StarCatalogId`. Two today: the survey-wide Gaia bin
   * (`gaiaStars`), which carries `labelEnabled` inertly because the star
   * renderer draws no per-star names, and the curated famous-star map
   * (`famousStar`), whose `labelEnabled` gates its captions on the final
   * descent. `famousStar.enabled` gates the SEEDED MAP, not the solar
   * system: with it off the star layers draw the Sun alone (see
   * `visibleStars`). Singleton-overlay convention holds per row: a star
   * catalog's "loaded" status is its asset slot's own readiness, NOT a bit
   * on a store.
   */
  items: Record<StarCatalogId, StarCatalogItemSettings>;
};
