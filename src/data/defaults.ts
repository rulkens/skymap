/**
 * Renderer / engine default settings — single source of truth.
 *
 * ### Why this module exists
 *
 * The engine (in `services/engine/engine.ts`) and the React shell (in
 * `App.tsx`) each carry their own copy of every user-controllable
 * setting: the engine as a closure variable that flows into per-frame
 * uniforms, React as a `useState` initial value that drives the
 * SettingsPanel.  Both copies must agree on the *initial* value so the
 * first paint isn't visibly out of sync with the panel's controls.
 *
 * Before this module existed, those initial values were duplicated by
 * hand at two sites — every time a default changed (e.g., the recent
 * `exposure: 1.0 → 1.5` bump after the depth-fade landed), both files
 * needed parallel edits or the panel would briefly flash the old value
 * before the engine's first echo callback synced React state.  This
 * module collapses both to one.
 *
 * ### What's in scope
 *
 * Only user-facing initial values that ship in both files:
 *   - sliders (point size, brightness, exposure, abs-mag limit, ...)
 *   - toggles (auto-rotate, galaxy textures, highlight fallback, depth
 *     fade, etc.)
 *   - mode selectors (bias mode, tone-map curve, LOD mode)
 *   - the visible-source bitmask
 *
 * ### What's deliberately NOT in scope
 *
 * - Per-source astrophysics constants (Schechter triples, flux limits,
 *   colour ramps).  Those live in `data/sources.ts`,
 *   `data/surveyFluxLimits.ts`, `data/colourIndex.ts` — domain-specific
 *   data, not user-configurable settings.
 * - Internal sentinel values that get overwritten before any frame
 *   renders (`apparentMagLimit`, `schechterMStar`, `schechterAlpha`
 *   start at 0 and are overwritten per-source by the upload bake).
 *   No external caller should read those zero defaults.
 * - GPU-pipeline constants (uniform layout offsets, vertex stride,
 *   texture atlas dimensions).  Those live with their consumers in
 *   `services/gpu/`.
 *
 * ### Consumers
 *
 * - `services/engine/engine.ts` — closure variables seeded from these.
 * - `src/App.tsx` — `useState` initial values seeded from these.
 *
 * Both consumers import this module's constants by name; nothing here
 * is mutable.  If a consumer needs to derive a value (e.g., compute a
 * point-size range from `DEFAULT_POINT_SIZE_PX`), do that at the call
 * site — keep this file flat.
 */

import { BiasMode } from './biasMode';
import { ToneMapCurve } from './toneMapCurve';
import { ALL_VISIBLE_MASK } from './sources';
import type { LodMode } from '../@types/LodMode';

// ── Rendering knobs ─────────────────────────────────────────────────────────

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

/** Auto-rotate (yaw drift) defaults OFF — most users want a static frame to explore. */
export const DEFAULT_AUTO_ROTATE = false;

// ── Galaxy thumbnails / orientation toggles ─────────────────────────────────

/**
 * Galaxy thumbnails default ON — the close-up DSS / SDSS quad textures
 * are the visual payoff of zooming in on a galaxy.  Off mode is mostly
 * a debug/perf escape hatch.
 */
export const DEFAULT_GALAXY_TEXTURES_ENABLED = true;

/** "Highlight fallback orientation" magenta tint defaults OFF (debug-tinged). */
export const DEFAULT_HIGHLIGHT_FALLBACK = false;

/** "Show only galaxies with real (b/a, PA) photometry" defaults OFF. */
export const DEFAULT_REAL_ONLY_MODE = false;

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
 * Procedural Milky Way impostor defaults ON.  The single screen-aligned
 * quad at the world origin gives the user a visceral "you are here"
 * sense before they fly out into the cosmic-web view.  See
 * `services/gpu/renderers/milkyWayRenderer.ts` and `utils/math/milkyWayFade.ts`
 * for the rendering rationale and the distance-fade band.
 */
export const DEFAULT_MILKY_WAY_ENABLED = true;

/**
 * Cosmic-web filament-skeleton overlay defaults ON.  The deployed build
 * always ships a `filaments.bin` (~24 MB on the canonical 2MRS+GLADE
 * merged skeleton), so the file is reliably present and the overlay is
 * one of the most striking visual features of the explorer — keeping
 * it gated behind a "discover this toggle to see the cosmic web" UX
 * was costing first-time visitors most of the wow factor.
 *
 * The toggle still exists for users who want a cleaner point-only view
 * (or for screenshots of raw catalog density), but the affordance is
 * now "switch off if you don't want it" rather than "find the toggle
 * and turn it on".
 *
 * For local-dev clones without the offline DisPerSE pipeline run, the
 * file is missing → `loadFilaments` returns null silently → the
 * renderer skips the overlay regardless of this default.  No regression
 * for that path.  See `services/gpu/renderers/filamentRenderer.ts`.
 */
export const DEFAULT_FILAMENTS_ENABLED = true;

/**
 * Default filament-overlay intensity scale, in [0, 1].  1.0 = full strength
 * (the per-frame fragment alpha is unchanged from the shader's intrinsic
 * density-modulated value).  Sliding lower dims the cosmic-web skeleton —
 * useful when high-σ datasets (longer, denser ridges) saturate to flat
 * white under the tone-map pass.  Defaulting to 1.0 means new visitors
 * see the overlay at the brightness the shader was originally tuned for.
 */
export const DEFAULT_FILAMENT_INTENSITY = 1.0;

// ── HDR tone-mapping ────────────────────────────────────────────────────────

/**
 * Default tone-map curve — Reinhard-extended.  Smooth highlight roll-off,
 * "natural" look.  Asinh is the filament-friendly alternative; user
 * picks via the dropdown.  See `data/toneMapCurve.ts` for the full set.
 */
export const DEFAULT_TONE_MAP_CURVE: ToneMapCurve = ToneMapCurve.Reinhard;

/**
 * Default exposure multiplier applied before the tone-map curve.  Iterated
 * upward over time as the rendering stack matured:
 *   - 1.0  initial.
 *   - 1.5  after the depth fade landed (fade dims overall brightness; this
 *          compensated so the un-faded foreground looked right).
 *   - 3.0  current.  Visual judgment after the user reported 1.5 still felt
 *          flat with the depth fade on at typical zoom levels.
 * Range exposed to the user is 0.1–4.0; bump the slider's `max` if a future
 * default exceeds it.
 */
export const DEFAULT_EXPOSURE = 3.0;

// ── Malmquist-bias correction ────────────────────────────────────────────────

/**
 * Default density-correction mode — `AngularReweight` (per-survey HEALPix).
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
 * survey-isolation rationale.
 *
 * Off-mode (`None`) is still the right choice for screenshots that need
 * to show raw catalogue density, or when comparing against a reference
 * paper that uses no correction.  `VolumeLimited`, `VMax`, and `Schechter`
 * remain available in the dropdown — they correct different aspects of
 * the survey selection function (radial completeness vs. angular
 * completeness) and aren't mutually exclusive in principle, but the UI
 * exposes them as one-of-five for simplicity.
 */
export const DEFAULT_BIAS_MODE: BiasMode = BiasMode.AngularReweight;

/**
 * Default absolute-magnitude threshold for `BiasMode.VolumeLimited`.
 * −19 mag is a common SDSS spec-sample cut (~M*+1) — galaxies fainter
 * than this are discarded.  Range exposed to the user is roughly
 * −24 (cD-galaxy regime) to −15 (dwarf territory).
 */
export const DEFAULT_ABS_MAG_LIMIT = -19;

// ── Survey visibility / LOD ──────────────────────────────────────────────────

/**
 * Default visible-source bitmask — every survey enabled.  See
 * `data/sources.ts` for the bit layout.
 */
export const DEFAULT_VISIBLE_SOURCE_MASK = ALL_VISIBLE_MASK;

/**
 * Default LOD mode — `'manual'` so a user with multiple surveys loaded
 * sees them all on first paint, regardless of camera distance.  Auto
 * mode (`'auto'`) gates surveys by zoom: at far distances, only the
 * deepest catalogue is drawn; close-in, all of them are.  Useful but
 * surprising on the first frame.
 */
export const DEFAULT_LOD_MODE: LodMode = 'manual';

// ── Scalar-volume overlay ────────────────────────────────────────────────────

/**
 * Master toggle for the 3D scalar-field volume overlay defaults ON.
 *
 * The overlay renders additively into the same HDR offscreen target as the
 * galaxy points pass.  At startup no fields are registered yet (the caller
 * must call `addVolumeField` to load a cube), so this default has no visual
 * effect until the first field arrives.  Defaulting to `true` means the
 * overlay is ready to render as soon as the first field is added — the user
 * doesn't have to hunt for a master toggle to see anything.
 *
 * Per-field `enabled` and `intensity` controls are the fine-grained knobs;
 * this flag is the coarser user-facing "hide all volumes" emergency off.
 */
export const DEFAULT_VOLUMES_ENABLED = true;

/**
 * Default per-field intensity scale, in [0, 1].  0.5 is a practical
 * starting point: strong enough to see the overlay, dim enough that it
 * doesn't completely wash out the galaxy-point layer underneath.  The
 * SettingsPanel slider lets the user tune per field.
 */
export const DEFAULT_VOLUME_FIELD_INTENSITY = 0.5;

/**
 * Default per-field contrast (gamma-style LUT-coordinate remap around
 * the 0.5 pivot, see `VolumeFieldSettings.contrast` and the
 * scalar-volume fragment shader).  1.0 is identity — the value at
 * which the slider has no effect, matching the user's intuition that
 * "default" should produce the same visual as before the slider
 * existed.  Cubes are encoded for that baseline; the user dials
 * upward to expose structure or downward to flatten.
 */
export const DEFAULT_VOLUME_FIELD_CONTRAST = 1.0;

/**
 * Default renderer-wide palette LUT for the scalar-volume overlay.
 * 'viridis' is matplotlib's perceptually-uniform default — neutral
 * blue-green-yellow ramp that reads as "scientific" without leaning
 * warm or cool.  Mutated at runtime via `setVolumePalette`; persisted
 * to localStorage by the App shell so reloads keep the user's choice.
 */
export const DEFAULT_VOLUME_PALETTE_ID = 'viridis' as const;

/**
 * Per-field default for the CF-4 DM density volume.  False on first
 * load so users discover the field in the Volumes panel and opt in,
 * rather than being surprised by a translucent fog they didn't ask for.
 * Once the visual is dialed in we may flip this to `true` in a follow-up;
 * the field is always wired (the SCFD is fetched at boot regardless).
 */
export const DEFAULT_CF4_DENSITY_ENABLED = false;

// ── SpaceMouse ─────────────────────────────────────────────────────────────

/**
 * Default SpaceMouse global sensitivity multiplier.  1.0 = unscaled.
 * Range typically 0.25–4.0.  Only meaningful when a 3DConnexion device
 * is paired; the WebHID glue ignores this constant if no device is
 * present.
 */
export const DEFAULT_SPACE_MOUSE_SENSITIVITY = 1.0;
