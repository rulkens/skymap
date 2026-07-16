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
 * A single shared module keeps them in agreement: duplicating the
 * values by hand at both sites means every default change needs
 * parallel edits, or the panel briefly flashes a stale value before
 * the engine's first echo callback syncs React state.
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
 *   `data/galaxyCatalogFluxLimits.ts`, `data/colourIndex.ts` — domain-specific
 *   data, not user-configurable settings.
 * - Bake-derived per-galaxy weights (Schechter ratio, angular-density
 *   weight).  `biasCorrectionSubsystem` splices these straight into the
 *   per-vertex buffer after each upload bake — they're never settings and
 *   never pass through engine state.
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

import { BiasMode } from './galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../@types/data/galaxyCatalog/BiasMode';
import { ToneMapCurve } from './toneMapCurve';
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';
import type { FlowSettings } from '../@types/settings/FlowSettings';
import { SOURCE_REGISTRY, Source } from './sources';

// ── Rendering knobs ─────────────────────────────────────────────────────────

/**
 * Default billboard pixel radius.  2.5 px is a practical sweet spot:
 * large enough that the Gaussian falloff produces a visible disc on
 * mid-DPI displays, small enough that ~3 M overlapping galaxies don't
 * paint the whole sky white.  Range exposed to the user is 1–8 px.
 */
export const DEFAULT_POINT_SIZE_PX = 2.5;

/**
 * Default star-billboard pixel radius — the star-catalog twin of
 * `DEFAULT_POINT_SIZE_PX`. Seeds `settings.starCatalogs.sizePx`. Same 2.5 px
 * sweet spot and same 1–8 px user range as the galaxy point size; kept a
 * separate constant so the two layers can diverge without one silently
 * dragging the other.
 */
export const DEFAULT_STAR_SIZE_PX = 2.5;

/**
 * Default star-brightness trim — the star-catalog twin of `DEFAULT_BRIGHTNESS`.
 * Seeds `settings.starCatalogs.brightness`. 1.0 = identity: the flux-glow
 * shader's calibrated `STAR_FLUX_EXPOSURE` baseline unchanged. Same 0.2–3.0
 * user range as the galaxy brightness; kept a separate constant so the two
 * layers can diverge without one silently dragging the other.
 */
export const DEFAULT_STAR_BRIGHTNESS = 1.0;

/**
 * Default star glow-overlap — seeds `settings.starCatalogs.glowOverlap`. 1.0 =
 * identity: an aggregate's flux-glow exactly fills its octree-box footprint (no
 * spread). Above it the aggregate radius is multiplied by this factor so far
 * glows overlap their neighbours and the box lattice dissolves; the vertex
 * stage divides the Gaussian peak by the square, so total luminance is
 * conserved (only the spread changes). User range 1.0–2.5. Leaves (point
 * sources) are untouched.
 *
 * 4.7 is eye-tuned, not the 1.0 physical identity: at 1.0 the far field still
 * shows the octree's box lattice as faceted seams between aggregates (see
 * `walkStarOctreeCut`'s `DEFAULT_REFINE_THRESHOLD` header for why a proxy
 * threshold alone can't fully hide it). Spreading each aggregate's glow to
 * 4.7x its box radius overlaps neighbours enough to dissolve the lattice into
 * a continuous far field. Tuned together with `DEFAULT_REFINE_THRESHOLD` — see
 * that constant's comment for how the two compensate.
 */
export const DEFAULT_STAR_GLOW_OVERLAP = 4.7;

/**
 * Default near-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureNearX`. The ABSOLUTE exposure multiplier the
 * scale-dependent `starExposureRamp` targets at solar-system scale (1 pc). 15 is
 * the shipped near anchor that the shader already bakes into STAR_FLUX_EXPOSURE
 * (6000 = 400 × 15), so at this default the CPU ramp returns exactly 1.0 there.
 * Live-tunable (UI range 1–60) so the near end can be re-eye-tuned against the
 * current star bins' local flux without a rebuild.
 */
export const DEFAULT_STAR_EXPOSURE_NEAR_X = 15;

/**
 * Default far-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureFarX`. The ABSOLUTE exposure multiplier
 * `starExposureRamp` targets at whole-galaxy scale (10 kpc), where the star bin
 * reads as the Milky Way's diffuse surface brightness and the un-adapting
 * monitor needs the field lifted. 70 is the shipped far anchor; live-tunable (UI
 * range 5–300) alongside the near anchor.
 */
export const DEFAULT_STAR_EXPOSURE_FAR_X = 70;

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
 * Milky Way overlay default — the star/dust point cloud at the world origin
 * gives a visceral "you are here" sense before the user flies out into the
 * cosmic-web view. Derived from the SOURCE_REGISTRY milkyWay row's `visible`
 * gate, so the registry is the single source of truth; see
 * `services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts` +
 * `services/gpu/galaxy/milkyWayFadeAlpha.ts` for the apparent-size fade band.
 */
export const DEFAULT_MILKY_WAY_ENABLED = SOURCE_REGISTRY[Source.MilkyWay].visible;

/**
 * "You are here" Milky-Way label default — ON.  The label is always available
 * by camera distance, so its toggle defaults on.
 *
 * Unlike `DEFAULT_MILKY_WAY_ENABLED` above, this is a plain `true` literal, NOT
 * registry-derived: the registry row's `visible` field gates the DISK overlay,
 * and the row carries no separate label-visible field.  Inventing a registry
 * column just to source one boolean would be the wrong kind of indirection —
 * the literal is the honest single source of truth for this axis.
 */
export const DEFAULT_MILKY_WAY_LABEL_ENABLED: boolean = true;

// ── HDR tone-mapping ────────────────────────────────────────────────────────

/**
 * Default tone-map curve — Reinhard-extended.  Smooth highlight roll-off,
 * "natural" look.  Asinh is the filament-friendly alternative; user
 * picks via the dropdown.  See `data/toneMapCurve.ts` for the full set.
 */
export const DEFAULT_TONE_MAP_CURVE: ToneMapCurveT = ToneMapCurve.Reinhard;

/**
 * Default exposure multiplier applied before the tone-map curve.  3.0 is
 * a visual judgment: the depth fade dims overall brightness, and lower
 * values read flat at typical zoom levels with the fade on.  Range
 * exposed to the user is 0.1–4.0; bump the slider's `max` if a future
 * default exceeds it.
 */
export const DEFAULT_EXPOSURE = 3.0;

// ── Malmquist-bias correction ────────────────────────────────────────────────

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
 * Default trim (low-end deadband cutoff) for volume fields that don't
 * specify one.  0 = no trim — the neutral identity.
 */
export const DEFAULT_VOLUME_FIELD_TRIM = 0.0;

/**
 * Default per-field contrast (gamma-style LUT-coordinate remap around
 * the 0.5 pivot, see `VolumeFieldSettings.contrast` and the
 * scalar-volume fragment shader).  1.0 is identity — the value at
 * which the slider has no effect.  Cubes are encoded for that
 * baseline; the user dials upward to expose structure or downward
 * to flatten.
 */
export const DEFAULT_VOLUME_FIELD_CONTRAST = 1.0;

/**
 * Neutral-no-tuning default for per-field densityScale.  Every volume
 * carries its own value on its SOURCE_REGISTRY entry; this constant is
 * the safe fallback when something queries before registration.
 *
 * 1.0 corresponds to the shader's identity case: each voxel-step
 * contributes `1 - exp(-sample * step)` to the alpha integral, so the
 * raw cube data drives the overlay's opacity directly.
 */
export const DEFAULT_VOLUME_FIELD_DENSITY_SCALE = 1.0;

/**
 * Default renderer-wide palette LUT for the scalar-volume overlay.
 * 'viridis' is matplotlib's perceptually-uniform default — neutral
 * blue-green-yellow ramp that reads as "scientific" without leaning
 * warm or cool.  Mutated at runtime via `setVolumePalette`; persisted
 * to localStorage by the App shell so reloads keep the user's choice.
 */
export const DEFAULT_VOLUME_PALETTE_ID = 'viridis' as const;

// ── CF4++ flow-field overlay ─────────────────────────────────────────────────

/**
 * Default state of the CF4++ peculiar-velocity flow-field overlay — the
 * shared seed for `settings.flow` (engine) and the SettingsPanel store
 * fallback (App.tsx).
 *
 * Derived from the SOURCE_REGISTRY flow row: `enabled` from its `visible`
 * gate, the eight look/motion knobs from the `FlowFieldDefaults` it carries.
 * The registry row is the single source of truth — to retune the hand-dialled
 * advect look, edit `sources/flow.ts`, not here.
 */
export const DEFAULT_FLOW: FlowSettings = {
  enabled: SOURCE_REGISTRY[Source.Flow].visible,
  mode: SOURCE_REGISTRY[Source.Flow].mode,
  intensity: SOURCE_REGISTRY[Source.Flow].intensity,
  count: SOURCE_REGISTRY[Source.Flow].count,
  trail: SOURCE_REGISTRY[Source.Flow].trail,
  flowSpeed: SOURCE_REGISTRY[Source.Flow].flowSpeed,
  densityBias: SOURCE_REGISTRY[Source.Flow].densityBias,
  wander: SOURCE_REGISTRY[Source.Flow].wander,
  boundaryFadeWidth: SOURCE_REGISTRY[Source.Flow].boundaryFadeWidth,
};

// ── Debug overlays ─────────────────────────────────────────────────────────

/** Pick-buffer debug overlay starts off.  See `EngineSettingsState.debug.showPickBuffer`. */
export const DEFAULT_SHOW_PICK_BUFFER = false;

/** Disk-radius debug ring starts off.  See `EngineSettingsState.debug.showDiskRadiusRing`. */
export const DEFAULT_SHOW_DISK_RADIUS_RING = false;
