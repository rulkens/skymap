/**
 * galaxyCatalog — the Layer's user-settable defaults, seeding `galaxyCatalogsSlice`,
 * `thumbnailsSlice` and `biasSlice`. Several are eye-tuned against the running
 * renderer; each constant's comment carries its own derivation.
 */

import { BiasMode } from '../../../data/galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../../../@types/data/galaxyCatalog/BiasMode';
import type { GalaxyProvenanceSettings } from '../../../@types/settings/GalaxyProvenanceSettings';

/**
 * Default billboard pixel radius.  2.5 px is a practical sweet spot:
 * large enough that the Gaussian falloff produces a visible disc on
 * mid-DPI displays, small enough that ~3 M overlapping galaxies don't
 * paint the whole sky white.  Range exposed to the user is 1–8 px.
 */
export const DEFAULT_POINT_SIZE_PX = 2.5;

/**
 * Default global brightness multiplier.  1.0 = "intensity exactly as the
 * shader computes it from the apparent magnitude".  Range 0.2–3.0.
 */
export const DEFAULT_BRIGHTNESS = 1.0;

/**
 * Default overall physical-SB → HDR gain for galaxy point billboards — seeds
 * `settings.galaxyCatalogs.sbScale`. Multiplies each galaxy's baked
 * surface-brightness amplitude (`sbAmp`) into the additive HDR field; 5.0
 * places the per-catalog mean galaxy's resolved core relative to the 2.0
 * bloom threshold. Live-tunable (UI range 0.5–30) so the galaxy look can be
 * re-eye-tuned without a rebuild.
 */
export const DEFAULT_GALAXY_SB_SCALE = 5.0;

/**
 * Default bloom ceiling for galaxy point billboards — seeds
 * `settings.galaxyCatalogs.sbMax`. The maximum baked surface-brightness
 * amplitude a compact galaxy can emit; the vertex stage clamps `sbAmp` to it
 * live, so this ceiling is a live knob rather than a bake-time clamp. UI
 * range 1–100.
 */
export const DEFAULT_GALAXY_SB_MAX = 30.0;

/**
 * Default readability-falloff exponent for galaxy point billboards — seeds
 * `settings.galaxyCatalogs.falloffStrength`. The exponent `k` on the
 * resolved-fraction falloff `pow(resolvedFrac, k)`: k = 2 is the full physical
 * inverse-square (unresolved galaxies dim as (angular / floor)²), lower k keeps
 * the deep field visible. 0.7 is eye-tuned; UI range 0–2. Gated by the
 * depth-fade toggle (off holds flat constant surface brightness).
 */
export const DEFAULT_GALAXY_FALLOFF_STRENGTH = 0.7;

/**
 * Galaxy thumbnails default ON — the close-up DSS / SDSS quad textures
 * are the visual payoff of zooming in on a galaxy.  Off mode is mostly
 * a debug/perf escape hatch.
 */
export const DEFAULT_GALAXY_TEXTURES_ENABLED = true;

/**
 * Default provenance-axis settings — one row per `PROVENANCE_AXES` entry.
 * Every axis starts at the no-op state (no highlight tint, filter `'all'`):
 * these are debug-panel data-quality diagnostics for auditing which galaxies
 * have measured vs. estimated orientation/size, not a default look, so the
 * unaudited scene renders exactly as the catalogs describe it.
 */
export const DEFAULT_GALAXY_PROVENANCE: GalaxyProvenanceSettings = {
  orientation: { highlight: false, filter: 'all' },
  size: { highlight: false, filter: 'all' },
};

/**
 * Camera-distance depth fade defaults ON.  Without it, additive billboards
 * stack hundreds of overlapping galaxies into the depth column through
 * the catalog origin and the centre of the visible volume saturates to
 * white regardless of HDR + tone-mapping.  The fade attenuates by
 * `1/(1 + (camDist/1000Mpc)²)` so the back half contributes less.
 *
 * Cosmetic — additive emission shouldn't physically care about depth —
 * but the alternative is letting the centre obliterate all visible
 * structure inside ~half the catalog volume.
 */
export const DEFAULT_DEPTH_FADE_ENABLED = true;

/**
 * Default density-correction mode — `AngularReweight` (per-galaxy-catalog HEALPix).
 *
 * Why on by default:  GLADE's parent-catalogue coverage is non-uniform on
 * the sky, which produces visible "pencil-beam jets" radiating from
 * over-detected sky cells in the raw render.  The HEALPix re-weight bins
 * each cloud's galaxies into (HEALPix cell, log-distance shell) pairs and
 * modulates per-vertex alpha by the ratio of median-cell density to the
 * local cell density.  Net effect: bright sky patches are dimmed and dim
 * patches are brightened, so the visible density on first paint reads as
 * "structure" rather than "where the parent surveys looked harder."  The
 * weight is baked into the vertex buffer at startup (lazy, mirrors the
 * Schechter pattern) so this default has zero per-frame cost.
 *
 * Per-cloud, never global, so SDSS's wedge footprint can't contaminate
 * GLADE's correction (and vice-versa).  See
 * `services/engine/computeAngularWeights.ts` for the algorithm and the
 * galaxy-catalog-isolation rationale.
 *
 * Off-mode (`None`) is still the right choice for screenshots that need
 * to show raw catalogue density, or when comparing against a reference
 * paper that uses no correction.  `VolumeLimited`, `VMax`, and `Schechter`
 * remain available in the dropdown — they correct different aspects of
 * the galaxy catalog selection function (radial completeness vs. angular
 * completeness) and aren't mutually exclusive in principle, but the UI
 * exposes them as one-of-five for simplicity.
 */
export const DEFAULT_BIAS_MODE: BiasModeT = BiasMode.AngularReweight;

/**
 * Default absolute-magnitude threshold for `BiasMode.VolumeLimited`.
 * −19 mag is a common SDSS spec-sample cut (~M*+1) — galaxies fainter
 * than this are discarded.  Range exposed to the user is roughly
 * −24 (cD-galaxy regime) to −15 (dwarf territory).
 */
export const DEFAULT_ABS_MAG_LIMIT = -19;
