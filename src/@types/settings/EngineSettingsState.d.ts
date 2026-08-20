/**
 * EngineSettingsState — the user-facing rendering settings sub-bag of
 * the canonical `EngineState`.
 *
 * ### Why this type lives apart from EngineState
 *
 * `createEngine` keeps its mutable state in a single `state` object
 * grouped by concern rather than scattered closure `let` bindings.
 * This sub-bag holds every value the SettingsPanel surfaces
 * — point size, brightness, the toggle flags, the tone-map curve / exposure
 * — plus the underlying flags the engine forwards into the per-frame
 * uniform buffer.
 *
 * Splitting it out as its own named type rather than inlining the shape
 * inside `EngineState = { settings: { ... } }` lets the engine's setter
 * functions accept a single bag (`(s: EngineSettingsState) => void`)
 * when their work depends on more than one field, and mirrors the way
 * the seed-callbacks and render-frame helpers already accept named
 * bags rather than the whole engine state.
 *
 * ### Shape
 *
 * Every field lives under exactly one named cluster — no flat root
 * fields (a flat duplicate of a knob with a natural cluster home invites
 * split-brain reads/writes).  The clusters group related knobs; writes
 * flow through dispatched slice actions and are read in the per-frame
 * loop and the `renderFrame` dispatch.
 *
 * ### Mutation contract
 *
 * Every leaf field is written by dispatching the settings slice actions
 * and read inside the per-frame loop and the `renderFrame` dispatch.
 * The type is intentionally NOT `Readonly<>` —
 * see the smoke tests in `tests/@types/engineState.test.ts` for the
 * contract assertion.
 *
 * ### Initial values
 *
 * Defaults live in `data/defaults.ts` (the single source of truth shared
 * with App.tsx so the SettingsPanel doesn't flash a stale value before
 * the first echo callback fires); the consumer constructs an
 * `EngineSettingsState` value by pulling those constants into each field.
 */

import type { BiasMode } from '../data/galaxyCatalog/BiasMode';
import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { StructureId } from '../data/structure/StructureId';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { FlowSettings } from './FlowSettings';
import type { HdrSettings } from './HdrSettings';
import type { LabelSettings } from './LabelSettings';
import type { MilkyWaySettings } from './MilkyWaySettings';
import type { ZoneOfAvoidanceSettings } from './ZoneOfAvoidanceSettings';
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';
import type { StructureItemSettings } from './StructureItemSettings';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';
import type { StarCatalogId } from '../data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from './StarCatalogItemSettings';
import type { BodyId } from '../data/body/BodyId';
import type { BodyItemSettings } from './BodyItemSettings';
import type { ClipId } from '../animation/ClipId';
import type { SplineMode } from '../animation/SplineMode';
import type { PassByDir } from '../animation/PassByDir';
import type { ClipPathTuningActive } from './ClipPathTuningActive';
import type { RenderStrategy } from '../engine/frame/RenderStrategy';
import type { OrientationFrameId } from '../camera/OrientationFrameId';
import type { GalaxyProvenanceSettings } from './GalaxyProvenanceSettings';
import type { DebugOverlayKey } from '../data/debug/DebugOverlayKey';

export type EngineSettingsState = {
  /**
   * Camera orientation frame — which astronomical pole the camera treats as
   * "up" (`OrientationFrameId`). A bare scalar view preference, not a cluster:
   * the world positions never move (they stay equatorial J2000); this only
   * picks which of the four physically meaningful poles the camera aligns its
   * up-vector to. Defaults to `'ecliptic'` (see `DEFAULT_ORIENTATION`).
   */
  orientation: OrientationFrameId;

  /**
   * Galaxy catalog point-billboard controls — the shared appearance knobs that
   * influence every galaxy catalog's `points.wgsl` draw, plus per-galaxy-catalog
   * items. Per-galaxy catalog state lives in `items` — one row per
   * `GalaxyCatalogId`, each carrying the layer-visibility axis (`enabled`) and
   * the text-label axis (`labelEnabled`). Only the famous-galaxy catalog
   * actually renders a label; the other galaxy catalogs carry `labelEnabled`
   * inertly so all five source-type clusters share the one per-item shape
   * (galaxy catalogs / structures / volumes / star catalogs / bodies all
   * expose `items[id].enabled`). Unlike `volumes` / `starCatalogs`, there is no
   * cluster-level master gate: no product decision has made "hide all galaxy
   * catalogs" a control, so the cluster carries no unwritten `enabled` field.
   */
  galaxyCatalogs: {
    sizePx: number;
    brightness: number;
    depthFade: boolean;
    /**
     * Data-quality audit state: per provenance axis (see `PROVENANCE_AXES`), a
     * highlight overlay and a tri-state cull. Debug-panel-only; every axis
     * defaults to "highlight off, show all", which the shader collapses to a
     * no-op.
     */
    provenance: GalaxyProvenanceSettings;
    /**
     * Overall physical-SB → HDR gain — multiplies each galaxy's baked
     * surface-brightness amplitude into the additive HDR field. The live
     * successor to the old hardcoded `GALAXY_SB_SCALE` shader const; rides the
     * points `Uniforms` struct as `galaxySbScale`. Default `DEFAULT_GALAXY_SB_SCALE`.
     */
    sbScale: number;
    /**
     * Bloom ceiling — the maximum baked surface-brightness amplitude a compact
     * galaxy can emit. The vertex stage clamps `sbAmp` to it live (`galaxySbMax`
     * uniform), replacing the old bake-time clamp (now only a float-safety
     * guard). Default `DEFAULT_GALAXY_SB_MAX`.
     */
    sbMax: number;
    /**
     * Readability-falloff exponent `k` on the resolved-fraction falloff
     * `pow(resolvedFrac, k)`, gated by `depthFade`. k = 2 is the full physical
     * inverse-square; lower k keeps the deep field visible. Rides the points
     * uniform as `galaxyFalloffStrength`. Default `DEFAULT_GALAXY_FALLOFF_STRENGTH`.
     */
    falloffStrength: number;
    items: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;
  };

  /**
   * HDR → LDR tone-mapping controls.  Consumed by the post-process pass
   * and not tied to any individual draw call.
   */
  tonemap: {
    exposure: number;
    curve: ToneMapCurve;
  };

  /** HDR opt-in + extended-range headroom knobs — see `HdrSettings`. */
  hdr: HdrSettings;

  /**
   * Screen-space bloom controls.  One global knob set, read live by the bloom
   * pass layers (`strength` / `threshold`) and gated by `enabled` at frame-program
   * build.  Like `tonemap`, this is a post-process cluster not tied to any
   * individual draw call.
   */
  bloom: {
    enabled: boolean;
    strength: number;
    threshold: number;
  };

  /**
   * Luminosity-bias correction inputs — the user-tunable subset.  The
   * bake-derived per-galaxy weights (Schechter ratio, angular-density
   * weight) aren't settings at all: `biasCorrectionSubsystem` splices them
   * straight into the per-vertex buffer (`schechterRatio` / angular slots)
   * after each worker bake, so they never pass through engine state.
   */
  bias: {
    mode: BiasMode;
    absMagLimit: number;
  };

  /**
   * Galaxy-thumbnail overlay master toggle — per-galaxy thumbnail
   * quads on close approach.
   */
  thumbnails: {
    enabled: boolean;
  };

  /**
   * Milky-Way singleton overlay controls — the two independent visibility axes
   * (disk / label) plus the star-cloud look knobs the cloud renderer reads
   * every frame. Shape + per-field docs live on `MilkyWaySettings`; the knobs
   * themselves on `MilkyWayTuning`.
   */
  milkyWay: MilkyWaySettings;

  /**
   * Zone-of-Avoidance singleton overlay controls — one visibility toggle
   * (`enabled` gates the band and its lettering together) plus the band's
   * look knobs. Shape + per-field docs live on `ZoneOfAvoidanceSettings`; the
   * knobs themselves on `ZoneOfAvoidanceTuning`.
   */
  zoneOfAvoidance: ZoneOfAvoidanceSettings;

  /**
   * Filament-skeleton overlay controls.  Master toggle + intensity scale
   * paired because the intensity slider is meaningless when the master
   * toggle is off.
   */
  filaments: {
    enabled: boolean;
    intensity: number;
  };

  /**
   * Constellation stick-figure overlay controls. A singleton overlay like
   * `filaments` / `milkyWay` / `flow`: master toggle + intensity scale.
   * `enabled` + `intensity` seed from the `SOURCE_REGISTRY` constellations row so
   * that entry stays the single source of truth for those defaults. The one
   * `enabled` toggle governs BOTH the stick figures and their name captions —
   * the captions ride the same layer fade the lines do, so there is no separate
   * names gate. `intensity` has no panel control; it is a store-only dial the
   * line-brightness math reads.
   */
  constellations: {
    enabled: boolean;
    intensity: number;
  };

  /**
   * Orbit-trails singleton overlay — the master gate on the near-field Keplerian
   * orbit trails (Earth / Jupiter / Moon …). A flat `enabled` field, mirroring
   * the `milkyWay` / `filaments` / `flow` singleton overlays rather than the
   * per-record source-type clusters: the trails are one compile-time conic table,
   * not a per-catalog fan-out. Read by `orbitTrailsLayer`, whose per-orbit
   * apparent-size fade is multiplied by this gate's fade opacity so the whole
   * layer dissolves on toggle rather than popping. Defaults on — the trails are
   * part of the baseline solar-system scene.
   */
  orbitTrails: {
    enabled: boolean;
  };

  /**
   * Earth's per-body look dials. Three fields today:
   *   - `atmosphereExposure`, the exposure scale on the in-scatter atmosphere
   *     shell's HDR output. Seeded from `ATMOSPHERE_PARAMS.earth.exposure` and
   *     read live by `atmosphereShellLayer` each frame.
   *   - `ambientLight`, the night-side ambient floor lifting Earth's unlit
   *     hemisphere off pure black (earthshine / moonlight, physically). Seeded
   *     from `EARTH_SURFACE_PARAMS.ambientLight` — the SAME value as the shared
   *     `AMBIENT` const in `bodyLighting.wesl`, but Earth-scoped: that const
   *     stays the floor for every OTHER lit body, this overrides it for Earth
   *     alone. Read live by `earthLayer` + `cloudShellLayer` each frame.
   *   - `oceanRoughness`, the GGX perceptual roughness the material mask selects
   *     wholesale for open water — the dial that sets how broad the ocean sun
   *     glint reads. Seeded from `EARTH_SURFACE_PARAMS.oceanRoughness` — the SAME
   *     value as the `OCEAN_ROUGHNESS` const in `lib/pbr.wesl`, but Earth-scoped:
   *     that const stays the seed / documentation home (and any future non-Earth
   *     water), this overrides it for Earth alone. Read live by `earthLayer` each
   *     frame.
   * Each stays the data file's single source of truth for its default (the same
   * relationship the tonemap exposure default has to `DEFAULT_EXPOSURE`).
   */
  earth: {
    atmosphereExposure: number;
    ambientLight: number;
    oceanRoughness: number;
  };

  /**
   * Star-catalog master gate and per-catalog items — the FOURTH source-type
   * cluster, symmetric with `galaxyCatalogs` / `structures` / `volumes`.
   * `enabled` is the coarse "hide all star catalogs" gate; per-catalog state
   * lives in `items` — one row per `StarCatalogId`, each carrying the
   * layer-visibility axis (`enabled`) and the text-label axis (`labelEnabled`).
   *
   * Two rows today: the survey-wide Gaia bin (`gaiaStars`), which carries
   * `labelEnabled` inertly because the star renderer draws no per-star names,
   * and the curated famous-star map (`famousStar`), whose `labelEnabled` gates
   * its captions on the final descent. `famousStar.enabled` gates the SEEDED
   * MAP, not the solar system: with it off the star layers draw the Sun alone
   * (see `visibleStars`).
   *
   * `enabled` is TOTAL over the cluster — it governs every row, not just the
   * survey one. Each consumer therefore reads the pair: the asset-demand
   * predicate, the survey draw path (`starCatalogLayer`), the seeded map's
   * drawn set (`visibleStars`) and its captions (`foregroundLabelsLayer`) all
   * require the master before consulting `items[id].enabled`. A master that
   * governed only some of its rows would put a checkbox on the Stars panel
   * header claiming authority over rows it could not hide.
   *
   * Singleton-overlay convention still holds per row: a star catalog's "loaded"
   * status is its asset slot's own readiness, NOT a bit on a store. The renderer
   * reads this slice each frame.
   *
   * `sizePx` is the star-billboard pixel radius — the star-catalog twin of
   * `galaxyCatalogs.sizePx`. It rides on the cluster (a shared appearance knob
   * across every star catalog, like the galaxy size knob) rather than per-item,
   * and the star renderer reads it into its size uniform each frame.
   *
   * `brightness` is the user's exposure trim on the starfield — the star-catalog
   * twin of `galaxyCatalogs.brightness`. 1.0 is identity (the shader's calibrated
   * `STAR_FLUX_EXPOSURE` baseline unchanged); the renderer multiplies the
   * flux-glow peak by it, so it rides the same shared uniform as `sizePx`.
   *
   * `refineThreshold` is the "Detail" knob — the CPU octree-cut refine gate
   * (`walkStarOctreeCut`'s `DEFAULT_REFINE_THRESHOLD`). Unlike `sizePx` /
   * `brightness` it is NOT a GPU uniform: the layer reads it once per frame and
   * feeds it to the walk. Lower ⇒ far boxes split earlier ⇒ fewer visible
   * lattice cells at the cost of more drawn nodes.
   *
   * `glowOverlap` is the "Glow overlap" knob — an AGGREGATE-only radius spread.
   * 1.0 is identity; above it a far aggregate's glow grows past its octree-box
   * footprint so neighbours overlap and the box lattice dissolves. The vertex
   * stage divides the Gaussian peak by the same factor (flux-conserving), so it
   * softens the seam without changing total luminance. Rides the shared GPU
   * uniform beside `sizePx` / `brightness`.
   *
   * `exposureNearX` / `exposureMidX` / `exposureFarX` are the three ABSOLUTE
   * display exposures the scale-dependent `starExposureRamp` targets at its
   * distance anchors (1 pc, 3 kpc, 10 kpc). Unlike `brightness` (a flat trim),
   * these shape the cross-scale ramp: the layer feeds all three to
   * `starExposureRamp` per frame. Live so the ramp can be re-eye-tuned against
   * the current star bins' local flux; defaults 6 / 23 / 28. 6 is also baked
   * into the shader's STAR_FLUX_EXPOSURE, so the ramp returns 1.0 at the near
   * anchor there; the 23 mid anchor sits on the old near→far continuation, so the
   * defaults reproduce the two-anchor look and pulling `exposureMidX` down bends
   * only the intermediate few-kpc segment.
   *
   * `aggregateIntensityCap` is the "Fog cap" knob — a ceiling on the per-pixel
   * PEAK intensity of AGGREGATE (octree flux-mip) records only; leaves stay
   * uncapped. It exists to tame the box-filling glow a near sub-threshold
   * aggregate deposits as luminous fog around the Sun. Unlike `glowOverlap`
   * (flux-conserving) it is DELIBERATELY non-physical: light above the ceiling is
   * discarded. Rides the shared GPU uniform beside `sizePx` / `brightness` /
   * `glowOverlap`; default 0.06.
   */
  starCatalogs: {
    enabled: boolean;
    sizePx: number;
    brightness: number;
    refineThreshold: number;
    glowOverlap: number;
    exposureNearX: number;
    exposureMidX: number;
    exposureFarX: number;
    aggregateIntensityCap: number;
    items: Record<StarCatalogId, StarCatalogItemSettings>;
  };

  /**
   * Near-field body gates — the FIFTH source-type cluster, one `items` row per
   * `BodyId` (earth, planet, sun), each carrying the visibility axis
   * (`enabled`) and the caption axis (`labelEnabled`).
   *
   * `enabled` is genuinely live for the Sun — `visibleStars` gates its dot on
   * `bodies.items.sun.enabled`, and the foreground-caption layer gates the
   * Sun's caption on the same flag so neither can outlive the other — but
   * unlike that pair of readers, the axis is unwritten: no product decision
   * has been made to expose a "hide this body" control, so the settings slice
   * ships no setter for it. Earth's and the planet's `enabled` have no reader
   * at all today. The axis exists on every row regardless, so the cluster
   * keeps ONE per-item shape rather than the Sun alone carrying an extra field.
   *
   * No cluster-level `enabled`: unlike the four data clusters there is no
   * "hide all bodies" intent — the bodies ARE the destination of the descent,
   * and a master gate over them would have no caller. Adding one when a caller
   * appears is a one-line change; inventing it now would be a knob nothing
   * turns. Should one arrive it must be TOTAL over the rows, like
   * `starCatalogs.enabled` and `volumes.enabled` — a master governing only
   * part of its own cluster is a checkbox claiming authority it lacks.
   */
  bodies: {
    items: Record<BodyId, BodyItemSettings>;
  };

  /**
   * Scalar-volume overlay master gate and per-item params.  When
   * `enabled` is false, `volumeUpsampleLayer.enabled` short-circuits
   * before consulting the renderer at zero GPU cost, and `scalarVolumeLayer`
   * never opens its half-res render pass.  Per-field params
   * (enabled / intensity / palette / …) live in `items` — one settings
   * row per registry-known volume field, seeded from `SOURCE_REGISTRY` at
   * construction so the panel can show a field's toggle before its cube
   * lazy-loads.  `items` is the same per-item accessor that galaxy catalogs,
   * structures, star catalogs, and bodies expose, so all five source-type
   * clusters share one shape.
   */
  volumes: {
    enabled: boolean;
    items: Partial<Record<VolumeFieldId, VolumeFieldSettings>>;
  };

  /**
   * CF4++ peculiar-velocity flow-field overlay controls.
   *
   * Flow is a singleton overlay layer (see
   * `docs/superpowers/conventions/singleton-overlay-layers.md`): all of its
   * user-facing state — the master `enabled` gate plus the look/motion knobs —
   * lives here in `settings`, exactly as `filaments` and `milkyWay` do. The
   * flow layer has no data-layer store: its "loaded" status is the asset slot's
   * own `ready` state (`slotReady(assetSlots.flow)`), and it carries no user
   * knobs here. The asset-demand predicate reads `settings.flow.enabled`, and the
   * renderer reads the rest of this slice each frame. Shape + per-field docs
   * live on `FlowSettings`.
   */
  flow: FlowSettings;

  /**
   * Cross-cutting label-presentation knobs — apply across every label
   * producer at once, multiplying on top of the per-layer label gates.
   * See `LabelSettings` for the per-field docs.
   */
  labels: LabelSettings;

  /**
   * Developer-oriented debug overlays.  Diagnostic lenses on top of
   * the rendered scene rather than knobs on the scene itself — kept
   * in their own cluster so the per-cluster mental model (one cluster
   * = one chunk of the renderer) stays clean.
   *
   *   - `overlays` — one toggle per `DEBUG_OVERLAY_ROWS` row (roster + labels
   *     live there, not here). All gated behind the DebugPanel.
   *   - `disabledPasses` — content-layer names the developer has manually
   *     toggled off in the renderer-toggle section.  Membership is
   *     `[name] === true`; a name absent from the record (or mapped to
   *     `false`) means the layer is enabled.  `executeFrame` consults this
   *     record AFTER each layer's own `enabled()` gate and skips the draw
   *     when the name maps to `true`, so the override is one-way: it can
   *     hide a layer that would otherwise run but never force-enable one
   *     whose gate returned false.  An open-world membership record (any
   *     layer name) against the closed-world `CONTENT_LAYERS` registry.  A
   *     plain object so the whole settings state stays JSON-serializable.
   *     Trap: `'disk-radius-ring'` names a row in BOTH this record and
   *     `overlays` above, with opposite defaults and opposite polarity —
   *     absent-means-shown here, `false`-means-hidden there.
   */
  debug: {
    overlays: Record<DebugOverlayKey, boolean>;
    disabledPasses: Record<string, boolean>;
    /**
     * Render-strategy override — decouples the frame's pass SHAPE from whether
     * GPU timing is collected (see `resolveStrategy` for the Joint-1 rationale).
     * `'auto'` (the default) reproduces the old timing-derived choice —
     * `'perLayerTimed'` when timing is on, `'merged'` otherwise — so production
     * and `?gpuTimings` stay byte-identical. An explicit `RenderStrategy` pins
     * the shape regardless of timing (e.g. `'merged'` WITH timing on, the
     * harness's production-true timed mode).
     */
    renderStrategy: RenderStrategy | 'auto';
    /**
     * Clip-path inspector — the debug overlay that draws a selected clip's
     * camera route (speed-coloured) plus a scrub gizmo. Only the two scalars
     * the UI owns live here; the sampled geometry is held off-store in the
     * `clipPathInspector` subsystem (see its .d.ts for why geometry stays out
     * of Redux). `clipId` is which clip the held snapshot was computed from
     * (null = nothing computed); `scrub01` is the scrubber position as a
     * normalised `[0,1]` fraction (NOT seconds — the UI has no access to the
     * clip duration, so the scrubber is a pure position).
     *
     * `align` / `rampSec` / `linger` / `spline` / `turnDelay` / `lookAhead` are the
     * live flyPath pacing + shape knobs the inspector can bake into the clip at
     * Calculate time (via `applyPathTuning`): `align` is the start-aim blend
     * seconds, `rampSec` the seconds of ease ramp each end (0 = use the named
     * `ease`), `linger` the per-target dwell depth ∈ [0,1] (0 = cruise straight
     * through) and `lingerSec` the dwell window width in seconds (both ride the
     * one `linger` gate), `spline` the basis (centripetal Catmull-Rom ↔ causal
     * Hermite), `turnDelay` the causal-Hermite overshoot magnitude, `lookAhead` the
     * seconds the look leads the eye. The last two are scratch scalars the causal
     * sub-sliders bind to; the saga only reads them when `spline` is causal,
     * folding them into the one `SplineConfig` override (see `SplineConfig`).
     *
     * `active` gates which knobs are baked — align / rampSec / linger / spline.
     * There is no separate turnDelay/lookAhead gate: they ride the single `spline`
     * override, so they can't be applied onto a centripetal basis that ignores
     * them. While a gate is inactive the clip's own authored value flows through
     * untouched — so Calculating a clip with no slider touched previews its REAL
     * pacing, not the inspector's defaults. Touching a slider/dropdown flips its
     * `active` flag on (the causal sub-sliders flip the `spline` gate); the row's
     * checkbox toggles it back off. The values seed from the flyPath defaults so a
     * freshly-activated slider starts somewhere sensible.
     */
    clipPathInspect: {
      clipId: ClipId | null;
      scrub01: number;
      align: number;
      rampSec: number;
      linger: number;
      lingerSec: number;
      spline: SplineMode;
      turnDelay: number;
      lookAhead: number;
      // Fly-past scratch scalars: `passByOffset` in subject-radius units (0 =
      // through centre) and `passByDir` the offset direction. Both ride the single
      // `passBy` override gate; the saga folds them into one `PassByConfig` (see
      // `PassByConfig`).
      passByOffset: number;
      passByDir: PassByDir;
      /** Per-knob override gate — only an active knob is baked into the clip. */
      active: ClipPathTuningActive;
    };
  };

  /**
   * Structure-overlay per-category settings.  State lives in `items` — one
   * row per `StructureId`, each carrying the ring/marker axis (`enabled`) and
   * the text-label axis (`labelEnabled`).  Co-locating both axes on one row
   * replaces the two parallel root records that previously held the same
   * booleans in different shapes: a reader walks one `items[cat]` entry to
   * learn everything about a category's visibility instead of cross-indexing
   * two records by the same key.  `items` is the same per-item accessor
   * galaxy catalogs, volumes, star catalogs, and bodies expose, so all five
   * source-type clusters share one shape.  No cluster-level master gate —
   * like `galaxyCatalogs`, nothing turns a "hide all structures" knob.
   * Defaults to every category fully visible.
   */
  structures: {
    items: Record<StructureId, StructureItemSettings>;
  };
};
