/**
 * StarCatalogSettings — star-catalog master gate, shared appearance knobs and
 * per-catalog `items`.
 */

import type { StarCatalogId } from '../data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from './StarCatalogItemSettings';

export type StarCatalogSettings = {
  /** TOTAL over the cluster: consumers read this before `items[id].enabled`. */
  enabled: boolean;
  /** Star-billboard radius in PIXELS, shared across catalogs. */
  sizePx: number;
  /** Exposure trim on the starfield; 1.0 is identity (shader baseline). */
  brightness: number;
  /**
   * The "Detail" knob: the CPU octree-cut refine gate, NOT a GPU uniform. Lower
   * ⇒ far boxes split earlier ⇒ fewer lattice cells, more drawn nodes.
   */
  refineThreshold: number;
  /**
   * The "Glow overlap" knob, AGGREGATE-only; 1.0 is identity. Flux-conserving
   * (the peak is divided by the same factor), so it dissolves the box lattice
   * without changing total luminance.
   */
  glowOverlap: number;
  /**
   * ABSOLUTE exposures `starExposureRamp` targets at 1 pc / 3 kpc / 10 kpc,
   * defaults 6 / 23 / 28. 6 is also baked into the shader's
   * `STAR_FLUX_EXPOSURE` (the ramp returns 1.0 at the near anchor); 23 sits on
   * the old near→far continuation, so lowering it bends only the mid segment.
   */
  exposureNearX: number;
  exposureMidX: number;
  exposureFarX: number;
  /**
   * The "Fog cap": a ceiling on AGGREGATE peak intensity only, DELIBERATELY
   * non-physical — light above it is discarded. Default 0.06.
   */
  aggregateIntensityCap: number;
  /**
   * `famousStar.enabled` gates the SEEDED MAP, not the solar system: with it off
   * the star layers draw the Sun alone. `gaiaStars.labelEnabled` is inert.
   * A catalog's "loaded" status is its asset slot's own readiness, never a
   * store bit (the singleton-overlay convention).
   */
  items: Record<StarCatalogId, StarCatalogItemSettings>;
};
