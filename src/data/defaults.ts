/**
 * Renderer / engine default settings — the single source of truth for every
 * user-controllable setting's INITIAL value (sliders, toggles, mode
 * selectors, the visible-source bitmask).
 *
 * `buildInitialSettings` (`state/settings/initialState.ts`) assembles these
 * into the Redux `EngineSettingsState` the settings slice seeds; a handful of
 * other sites import a constant directly when they need the same default
 * outside the store. Out of scope: per-source astrophysics constants
 * (`data/sources.ts` et al. — domain data, not settings) and GPU-pipeline
 * constants, which live with their consumers in `services/gpu/`.
 */

import { BiasMode } from './galaxyCatalog/biasMode';
import type { BiasMode as BiasModeT } from '../@types/data/galaxyCatalog/BiasMode';
import { ToneMapCurve, toneMapCurveSaturation } from './toneMapCurve';
import type { ToneMapCurve as ToneMapCurveT } from '../@types/data/ToneMapCurve';
import type { FlowSettings } from '../@types/settings/FlowSettings';
import type { ZoneOfAvoidanceTuning } from '../@types/settings/ZoneOfAvoidanceTuning';
import type { OrientationFrameId } from '../@types/camera/OrientationFrameId';
import type { GalaxyProvenanceSettings } from '../@types/settings/GalaxyProvenanceSettings';
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
 * `DEFAULT_POINT_SIZE_PX`. Seeds `settings.starCatalogs.sizePx`. 4.7 px within
 * the shared 1–8 px user range, diverged larger than the 2.5 px galaxy point
 * size; kept a separate constant so the two layers can diverge without one
 * silently dragging the other.
 */
export const DEFAULT_STAR_SIZE_PX = 4.7;

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
 * 3.0 is eye-tuned, not the 1.0 physical identity: at 1.0 the far field still
 * shows the octree's box lattice as faceted seams between aggregates (see
 * `walkStarOctreeCut`'s `DEFAULT_REFINE_THRESHOLD` header for why a proxy
 * threshold alone can't fully hide it). Spreading each aggregate's glow to
 * 3.0x its box radius overlaps neighbours enough to dissolve the lattice into
 * a continuous far field. Tuned together with `DEFAULT_REFINE_THRESHOLD` — see
 * that constant's comment for how the two compensate.
 */
export const DEFAULT_STAR_GLOW_OVERLAP = 3.0;

/**
 * Default near-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureNearX`. The ABSOLUTE exposure multiplier the
 * scale-dependent `starExposureRamp` targets at solar-system scale (1 pc). 6 is
 * the shipped near anchor that the shader already bakes into STAR_FLUX_EXPOSURE
 * (2400 = 400 × 6), so at this default the CPU ramp returns exactly 1.0 there.
 * Live-tunable (UI range 1–60) so the near end can be re-eye-tuned against the
 * current star bins' local flux without a rebuild.
 */
export const DEFAULT_STAR_EXPOSURE_NEAR_X = 6;

/**
 * Default middle-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureMidX`. The ABSOLUTE exposure multiplier the
 * scale-dependent `starExposureRamp` targets at the intermediate few-kpc scale
 * (3 kpc), the knot that splits the ramp so the dense central clump can be
 * darkened without touching either end.
 *
 * 23 sits on the log-interpolated line between the near (6) and far (28)
 * anchors at 3 kpc: 6·(28/6)^(log₁₀(3000)/4) = 22.9 (3 kpc sits at
 * log-fraction log₁₀(3000)/4 ≈ 0.869 of the way from 1 pc to 10 kpc). A knot
 * on that line doesn't bend the three-anchor ramp at the defaults; 23 vs the
 * exact 22.9 is visually indistinguishable. Live-tunable (UI range 5–150) so
 * the middle can be pulled down against the running renderer.
 */
export const DEFAULT_STAR_EXPOSURE_MID_X = 23;

/**
 * Default far-anchor star display exposure — seeds
 * `settings.starCatalogs.exposureFarX`. The ABSOLUTE exposure multiplier
 * `starExposureRamp` targets at whole-galaxy scale (10 kpc), where the star bin
 * reads as the Milky Way's diffuse surface brightness and the un-adapting
 * monitor needs the field lifted. 28 is the shipped far anchor; live-tunable (UI
 * range 5–300) alongside the near anchor.
 */
export const DEFAULT_STAR_EXPOSURE_FAR_X = 28;

/**
 * Default aggregate surface-brightness cap — seeds
 * `settings.starCatalogs.aggregateIntensityCap`, the "Fog cap" slider. A ceiling
 * on the per-pixel PEAK intensity of survey-star AGGREGATE records (octree
 * flux-mip glows) only; leaf (resolved-star) records stay uncapped so bright
 * stars still bloom.
 *
 * Why a cap at all: an octree aggregate deposits its whole subtree's honestly
 * summed light spread across its box footprint. A near, sub-refinement-threshold
 * aggregate at ~0.5–1.3 kpc camera distance therefore paints a large,
 * box-filling glow that reads as jarring luminous fog around the Sun. The cap
 * clips the peak so those near aggregates can't over-fill the frame.
 *
 * Deliberately NON-physical: light above the ceiling is DISCARDED, not
 * conserved (the flux-conserving alternative — spreading the excess into a wider
 * dot, the way `glowOverlap` conserves — is exactly what produces the fog, since
 * the offending glow is already box-sized). 0.06 is eye-tuned against the
 * running renderer; live-tunable (UI range 0.01–0.5) so the ceiling can be
 * re-dialled without a rebuild.
 */
export const DEFAULT_STAR_AGGREGATE_INTENSITY_CAP = 0.06;

/**
 * Default global brightness multiplier.  1.0 = "intensity exactly as the
 * shader computes it from the apparent magnitude".  Range 0.2–3.0.
 */
export const DEFAULT_BRIGHTNESS = 1.0;

/** Auto-rotate (yaw drift) defaults OFF — most users want a static frame to explore. */
export const DEFAULT_AUTO_ROTATE = false;

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

// ── Galaxy thumbnails / orientation toggles ─────────────────────────────────

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
 * Milky Way overlay default — the star/dust point cloud at the world origin
 * gives a visceral "you are here" sense before the user flies out into the
 * cosmic-web view. Derived from the SOURCE_REGISTRY milkyWay row's `visible`
 * gate, so the registry is the single source of truth; see
 * `services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts` +
 * `services/engine/galaxyGenerator/v1/milkyWayFadeAlpha.ts` for the apparent-size fade band.
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

/**
 * Orbit-trails overlay default — ON.  The near-field Keplerian orbit trails
 * (Earth / Jupiter / Moon …) are part of the baseline solar-system scene, so the
 * master gate defaults on.  A plain `true` literal like
 * `DEFAULT_MILKY_WAY_LABEL_ENABLED`: the trails are a compile-time conic table
 * (`ORBITAL_ELEMENTS`), not a registry source with its own `visible` gate, so the
 * literal is the honest single source of truth for this axis.
 */
export const DEFAULT_ORBIT_TRAILS_ENABLED: boolean = true;

/**
 * Zone-of-Avoidance overlay default — ON.  The galactic-plane dust band is
 * meant to be visible from first paint, explaining the catalog thin-out near
 * b=0 rather than leaving it looking like a data gap.  A plain `true` literal
 * like `DEFAULT_ORBIT_TRAILS_ENABLED`, not registry-derived like
 * `DEFAULT_MILKY_WAY_ENABLED`: `ZONE_OF_AVOIDANCE_ENTRY.visible` exists for
 * internal registry consistency but is not itself this default's source.
 */
export const DEFAULT_ZONE_OF_AVOIDANCE_ENABLED: boolean = true;

/**
 * Zone-of-Avoidance look-knob starting values, tuned live via the
 * DebugPanel's tuning section — a dim pale lavender-blue veil (blue-heavy
 * linear RGB below), not a warm interstellar-dust extinction color.
 *
 * `radialFalloff` is a normalised [0, 1] fraction of the shell's radial span
 * (`outerRadiusMpc - innerRadiusMpc`, currently ~377 Mpc for the shell's
 * radii) — the renderer converts it to an absolute Mpc e-folding length
 * before it reaches the shader, which decays density from the inner rim
 * outward (`exp(-(r - inner) / radialFalloffMpc)`). 0.1 (~38 Mpc) collapses
 * the veil to a puff hugging the inner rim; the shipped default, 0.46
 * (~173 Mpc), keeps haze visible across the catalog volume while still
 * clearly fading toward the outer radius.
 */
export const DEFAULT_ZONE_OF_AVOIDANCE_TUNING: ZoneOfAvoidanceTuning = {
  intensity: 0.37,
  radialFalloff: 0.46,
  edgeSharpness: 5,
  color: [0.5333, 0.5089, 1],
  labelColor: [0.2307, 0.2502, 0.6795],
};

// ── HDR tone-mapping ────────────────────────────────────────────────────────

/**
 * Default state of the viewer's HDR display opt-in — seeds
 * `settings.hdr.enabled`. `false` even when `GpuContext.hdrCapable` is true:
 * extended-range output is a choice the viewer makes about how they want the
 * scene rendered, not a consequence of what their monitor happens to permit,
 * so boot never turns it on for them.
 */
export const DEFAULT_HDR_ENABLED = false;

/**
 * Default tone-map curve — Reinhard-extended.  Smooth highlight roll-off,
 * "natural" look.  Asinh is the filament-friendly alternative; user
 * picks via the dropdown.  See `data/toneMapCurve.ts` for the full set.
 */
export const DEFAULT_TONE_MAP_CURVE: ToneMapCurveT = ToneMapCurve.Reinhard;

/**
 * Default exposure multiplier applied before the tone-map curve.  3.0 is
 * a visual judgment: the depth fade dims overall brightness, and lower
 * values read flat at typical zoom levels with the fade on.  Stored as the
 * linear gain the shader applies, but presented as ±4 EV (0.0625×–16×) — a
 * range chosen to sit inside `clampExposure`'s GPU-safety window, so the UI
 * cannot reach a value the clamp would have to rescue.
 */
export const DEFAULT_EXPOSURE = 3.0;

/**
 * Default HDR headroom knee — the brightness above which a pixel's over-white
 * energy spills past paper-white into an extended-range swap chain. Seeds
 * `settings.hdr.knee`.
 *
 * Measured in the SAME post-exposure units the tone curve works in, and derived
 * from the default curve's saturation point, because the knee's job is to pick up
 * exactly where the curve runs out of range: a pixel at the knee is precisely one
 * the curve can no longer separate from a brighter one. Sharing the curve's units
 * keeps the two aligned as the exposure slider moves — raising exposure makes a
 * dimmer pixel saturate, and the knee follows without re-tuning. (Bloom's threshold
 * is pre-exposure instead, because bloom reads the raw buffer before the tone map;
 * the spill runs after it.)
 *
 * The five curves saturate anywhere from 1.0 to 7.24, so this default only holds
 * while the curve does — switching curve wants a nudge on the slider. Inert unless
 * the swap chain is the extended-range surface (`hdrActiveOf`).
 */
export const DEFAULT_HDR_KNEE = toneMapCurveSaturation(DEFAULT_TONE_MAP_CURVE);

/**
 * Default multiplier on the over-knee energy spilled into display headroom.
 * Seeds `settings.hdr.headroom`. 0 is exactly the SDR result — the tone
 * curve's compressed output, nothing added — so the knob spans "no headroom" to
 * "aggressive headroom" with no discontinuity at either end. 0.25 is deliberately
 * conservative: available headroom varies per display and with screen brightness,
 * so the honest default under-uses it rather than clipping on a modest panel.
 */
export const DEFAULT_HDR_HEADROOM = 0.25;

// ── Screen-space bloom ───────────────────────────────────────────────────────

/**
 * Screen-space bloom defaults ON — the mip-pyramid glow around near-saturated
 * highlights (the Sun's core, bright star bins) is part of the baseline HDR
 * look, so the effect is live from first paint. Off is a debug/perf escape
 * hatch. Seeds `settings.bloom.enabled`.
 */
export const DEFAULT_BLOOM_ENABLED = true;

/**
 * Default bloom strength — the scale on the blurred mip pyramid composited back
 * over the HDR frame. Seeds `settings.bloom.strength`. 0.8 is an eye-tuned
 * starting point: strong enough to read as a soft halo around saturated cores,
 * shy of a full 1.0 that would smear the whole highlight field. A post-build
 * tuning target (spec §4/§6).
 */
export const DEFAULT_BLOOM_STRENGTH = 0.8;

/**
 * Default bloom threshold — the HDR luminance above which a pixel contributes to
 * the bloom pyramid. Seeds `settings.bloom.threshold`. 2.0 sits well under
 * `STAR_KNEE`, holding the bloom-seeding ordering invariant
 * `DEFAULT_BLOOM_THRESHOLD < STAR_KNEE <= STAR_EMISSIVE` (see
 * `starRenderConstants.ts` for the single statement of it) with margin to spare:
 * a broad swath of the bright field, not only near-saturated cores, now seeds
 * the glow. A post-build tuning target (spec §4/§6).
 */
export const DEFAULT_BLOOM_THRESHOLD = 2.0;

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

/** Orbit-trail impostor overlay starts off.  See `EngineSettingsState.debug.showOrbitTrailImpostor`. */
export const DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR = false;

// ── Camera orientation frame ─────────────────────────────────────────────────

/**
 * Default orientation frame — which astronomical pole the camera treats as "up".
 *
 * Ecliptic, not equatorial: the descent lands in the solar system, and the
 * ecliptic frame puts Earth's orbital plane flat so the planets read as a disk
 * and Earth's 23.44° obliquity is *desired* — the tilt between the equatorial
 * and ecliptic poles is exactly what makes the seasons legible in that view.
 * Booting equatorial would instead flatten Earth's equator and rake the orbital
 * plane at that same 23.44°, which is the wrong "up" for the arrival scene.
 */
export const DEFAULT_ORIENTATION: OrientationFrameId = 'ecliptic';
