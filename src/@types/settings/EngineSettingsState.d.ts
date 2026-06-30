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
import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';
import type { StructureItemSettings } from './StructureItemSettings';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';
import type { ClipId } from '../animation/ClipId';
import type { SplineMode } from '../animation/SplineMode';
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
   * the other galaxy catalogs carry `labelEnabled` inertly so all three source-type
   * clusters share the one per-item shape (galaxy catalogs / structures / volumes all
   * expose `items[id].enabled`).
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
   * Scalar-volume overlay master gate and per-item params.  When
   * `enabled` is false, `volumeUpsamplePass.enabled` short-circuits
   * before consulting the renderer at zero GPU cost, and `encodeVolumes`
   * never opens its pre-HDR half-res render pass.  Per-field params
   * (enabled / intensity / palette / …) live in `items` — one settings
   * row per registry-known volume field, seeded from `SOURCE_REGISTRY` at
   * construction so the panel can show a field's toggle before its cube
   * lazy-loads.  `items` is the same per-item accessor that galaxy catalogs and
   * structures expose, so all three source-type clusters share one shape.
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
   *   - `disabledPasses` — pass names the developer has manually toggled
   *     off in the renderer-toggle section.  Membership is `[name] === true`;
   *     a name absent from the record (or mapped to `false`) means the pass
   *     is enabled.  The frame encoders consult this record AFTER each pass's
   *     own `enabled()` gate and skip the draw when the name maps to `true`,
   *     so the override is one-way: it can hide a pass that would otherwise
   *     run but never force-enable one whose gate returned false.  An
   *     open-world membership record (any pass name) against the closed-world
   *     `HDR_PASSES` / `UI_PASSES` arrays.  A plain object so the whole
   *     settings state stays JSON-serializable.
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
     * `align` / `rampSec` / `linger` / `spline` / `turnDelay` are the live flyPath
     * pacing + shape knobs the inspector can bake into the clip at Calculate time
     * (via `applyPathTuning`): `align` is the start-aim blend seconds, `rampSec`
     * the seconds of ease ramp each end (0 = use the named `ease`), `linger` the
     * per-target brake depth ∈ [0,1] (0 = cruise straight through each waypoint),
     * `spline` the basis (centripetal Catmull-Rom ↔ causal Hermite), `turnDelay`
     * the causal-Hermite overshoot magnitude (inert in centripetal mode).
     *
     * Each knob is an OVERRIDE that is inactive until the curator touches it:
     * `active[knob]` gates whether that knob is applied at all. While inactive,
     * the clip's own authored value flows through untouched — so Calculating a
     * clip with no slider touched previews its REAL pacing, not the inspector's
     * defaults. Touching a slider/dropdown flips its `active` flag on; the row's
     * checkbox toggles it back off. The values seed from the flyPath defaults so a
     * freshly-activated slider starts somewhere sensible.
     */
    clipPathInspect: {
      clipId: ClipId | null;
      scrub01: number;
      align: number;
      rampSec: number;
      linger: number;
      spline: SplineMode;
      turnDelay: number;
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
   * key.  `items` is the same per-item accessor galaxy catalogs and volumes expose, so
   * all three source-type clusters share one shape.  Defaults to every
   * category fully visible.
   */
  structures: {
    enabled: boolean;
    items: Record<StructureId, StructureItemSettings>;
  };
};
