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
import type { FlowSettings } from './FlowSettings';
import type { HdrSettings } from './HdrSettings';
import type { LabelSettings } from './LabelSettings';
import type { MilkyWaySettings } from './MilkyWaySettings';
import type { ZoneOfAvoidanceSettings } from './ZoneOfAvoidanceSettings';
import type { SgrAStarLensingTuning } from './SgrAStarLensingTuning';
import type { GalaxyCatalogSettings } from './GalaxyCatalogSettings';
import type { StarCatalogSettings } from './StarCatalogSettings';
import type { StructureSettings } from './StructureSettings';
import type { VolumeSettings } from './VolumeSettings';
import type { BodySettings } from './BodySettings';
import type { EarthSettings } from './EarthSettings';
import type { OrbitTrailsSettings } from './OrbitTrailsSettings';
import type { FilamentsSettings } from './FilamentsSettings';
import type { ConstellationsSettings } from './ConstellationsSettings';
import type { ClipId } from '../animation/ClipId';
import type { SplineMode } from '../animation/SplineMode';
import type { PassByDir } from '../animation/PassByDir';
import type { ClipPathTuningActive } from './ClipPathTuningActive';
import type { RenderStrategy } from '../engine/frame/RenderStrategy';
import type { OrientationFrameId } from '../camera/OrientationFrameId';
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
   * Camera lens control — the vertical field of view in degrees. The engine
   * converts this to radians and writes it onto `cameraRuntime.outputs.projection.fovYRad`
   * once per frame (`runFrame`), which every downstream consumer (view-proj,
   * screen-space pixel math, the WGSL camera uniform) already reads live off
   * the projection Resource. Default `DEFAULT_FOV_DEG` (60°).
   */
  camera: {
    fovDeg: number;
  };

  /**
   * Galaxy catalog point-billboard controls — the shared appearance knobs
   * plus per-galaxy-catalog items. See `GalaxyCatalogSettings`.
   */
  galaxyCatalogs: GalaxyCatalogSettings;

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
   * The Sgr A* lens pass's DebugPanel tuning knobs. See
   * `SgrAStarLensingTuning` for the tier breakdown and what each field owns.
   */
  sgrAStarLensingTuning: SgrAStarLensingTuning;

  /**
   * Filament-skeleton overlay controls. See `FilamentsSettings`.
   */
  filaments: FilamentsSettings;

  /**
   * Constellation stick-figure overlay controls. See `ConstellationsSettings`.
   */
  constellations: ConstellationsSettings;

  /**
   * Orbit-trails singleton overlay — the master gate on the near-field
   * Keplerian orbit trails. See `OrbitTrailsSettings`.
   */
  orbitTrails: OrbitTrailsSettings;

  /** Earth's per-body look dials. See `EarthSettings`. */
  earth: EarthSettings;

  /**
   * Star-catalog master gate and per-catalog items — the FOURTH source-type
   * cluster, symmetric with `galaxyCatalogs` / `structures` / `volumes`. See
   * `StarCatalogSettings`.
   */
  starCatalogs: StarCatalogSettings;

  /**
   * Near-field body gates — the FIFTH source-type cluster. See `BodySettings`.
   */
  bodies: BodySettings;

  /**
   * Scalar-volume overlay master gate and per-item params. See
   * `VolumeSettings`.
   */
  volumes: VolumeSettings;

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
   *     layer name) against the closed-world `CONTENT_PASSES` registry.  A
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
   * Structure-overlay per-category settings. See `StructureSettings`.
   */
  structures: StructureSettings;
};
