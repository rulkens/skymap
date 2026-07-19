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
import type { LabelSettings } from './LabelSettings';
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';
import type { StructureItemSettings } from './StructureItemSettings';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';
import type { StarCatalogId } from '../data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from './StarCatalogItemSettings';
import type { ClipId } from '../animation/ClipId';
import type { SplineMode } from '../animation/SplineMode';
import type { PassByDir } from '../animation/PassByDir';
import type { ClipPathTuningActive } from './ClipPathTuningActive';

export type EngineSettingsState = {
  /**
   * Galaxy catalog point-billboard controls — the shared appearance knobs that
   * influence every galaxy catalog's `points.wgsl` draw — plus the galaxy-catalog-layer
   * master gate and per-galaxy-catalog items. `enabled` is the coarse "hide all
   * galaxy catalogs" gate (symmetric with `volumes.enabled` / `structures.enabled`).
   * Per-galaxy catalog state lives in `items` — one row per `GalaxyCatalogId`, each carrying
   * the layer-visibility axis (`enabled`) and the text-label axis
   * (`labelEnabled`). Only the famous-galaxy catalog actually renders a label;
   * the other galaxy catalogs carry `labelEnabled` inertly so all four source-type
   * clusters share the one per-item shape (galaxy catalogs / structures / volumes /
   * star catalogs all expose `items[id].enabled`).
   */
  galaxyCatalogs: {
    enabled: boolean;
    sizePx: number;
    brightness: number;
    depthFade: boolean;
    highlightFallback: boolean;
    realOnly: boolean;
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
   * Milky-Way singleton overlay — two independent visibility axes, mirroring
   * how the `structures` cluster separates ring/marker from label:
   *   - `enabled` — the screen-aligned disk overlay at the world origin.
   *   - `labelEnabled` — the "You are here" text label.
   * The two are fully independent: the label can show with the disk hidden and
   * vice-versa.  (Unlike `structures`, milkyWay is a singleton overlay rather
   * than a per-record catalog, so both axes are flat fields here — there is no
   * `items` row.)
   */
  milkyWay: {
    enabled: boolean;
    labelEnabled: boolean;
  };

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
   * Earth's per-body look dials. Three fields today:
   *   - `atmosphereExposure`, the exposure scale on the in-scatter atmosphere
   *     shell's HDR output. Seeded from `ATMOSPHERE_SHELL_PARAMS.exposure` and
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
   * Today the sole row is the survey-wide Gaia bin (`gaiaStars`), which carries
   * `labelEnabled` inertly (the star renderer draws no per-star names); the
   * curated famous-star map will add a label-bearing row later, so all four
   * source-type clusters expose the same per-item shape.
   *
   * Singleton-overlay convention still holds per row: a star catalog's "loaded"
   * status is its asset slot's own readiness (Tasks 5–6 wire the slot), NOT a
   * bit on a store. The asset-demand predicate reads
   * `settings.starCatalogs.items[id].enabled`, and the renderer reads this slice
   * each frame.
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
   * the current star bins' local flux; defaults 15 / 57 / 70. 15 is also baked
   * into the shader's STAR_FLUX_EXPOSURE, so the ramp returns 1.0 at the near
   * anchor there; the 57 mid anchor sits on the old near→far continuation, so the
   * defaults reproduce the two-anchor look and pulling `exposureMidX` down bends
   * only the intermediate few-kpc segment.
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
    items: Record<StarCatalogId, StarCatalogItemSettings>;
  };

  /**
   * Famous-stars singleton overlay — the master gate on the SEEDED near-field
   * star map (the Sun plus its ~130 named neighbours drawn by the star
   * point/sphere layers and captioned by `foregroundLabelsLayer`). A flat
   * `enabled` field, mirroring the `milkyWay` / `filaments` / `flow` singleton
   * overlays rather than the per-record source-type clusters — there is no
   * `items` row because the seed is one static set, not a per-catalog fan-out.
   *
   * This is DISTINCT from `starCatalogs.enabled`: that gates the survey-wide
   * Gaia bin, this gates the curated famous-star scene bodies. When it is off
   * the star layers fall back to drawing the Sun ALONE — the Sun anchors the
   * final descent and Earth/planets ride their own layers, so muting the map
   * never hides the solar system (see the star layers' `visibleStars`
   * derivation). The star-map captions zero to 0 in lockstep (the Sun caption
   * excepted), fading rather than popping via the caption envelope.
   */
  famousStars: {
    enabled: boolean;
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
   * structures, and star catalogs expose, so all four source-type clusters share one shape.
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
   *   - `showPickBuffer` — colour-maps the r32uint pick texture and
   *     composites it over the tone-mapped frame.  Lets a developer
   *     see which billboard the hover/click resolver actually claims
   *     at each pixel.  Point billboards show a `pointSizePx`-clamped
   *     dot; resolved galaxy disks are picked by the procedural-disk
   *     pass at the disk edge.  Gated behind the DebugPanel.
   *   - `showDiskRadiusRing` — outlines each famous-galaxy thumbnail's
   *     disk-radius footprint so the developer can calibrate the
   *     placement against the underlying billboard.  Gated behind the
   *     DebugPanel.
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
   */
  debug: {
    showPickBuffer: boolean;
    showDiskRadiusRing: boolean;
    disabledPasses: Record<string, boolean>;
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
   * Structure-overlay master gate and per-category settings.  `enabled` is
   * the coarse "hide all structures" gate (symmetric with `volumes.enabled`).
   * Per-category state lives in `items` — one row per `StructureId`,
   * each carrying the ring/marker axis (`enabled`) and the text-label axis
   * (`labelEnabled`).  Co-locating both axes on one row replaces the two
   * parallel root records that previously held the same booleans in different
   * shapes: a reader walks one `items[cat]` entry to learn everything about a
   * category's visibility instead of cross-indexing two records by the same
   * key.  `items` is the same per-item accessor galaxy catalogs, volumes, and star
   * catalogs expose, so all four source-type clusters share one shape.  Defaults to every
   * category fully visible.
   */
  structures: {
    enabled: boolean;
    items: Record<StructureId, StructureItemSettings>;
  };
};
