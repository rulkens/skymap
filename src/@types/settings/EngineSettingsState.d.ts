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
 * Every settings field lives under exactly one named cluster — no flat
 * root fields (a flat duplicate invites split-brain reads/writes).  The
 * clusters mirror EngineHandle's sub-handle namespaces 1:1 — a setter
 * on `handle.surveys` writes into `state.settings.surveys`, a setter on
 * `handle.tonemap` writes into `state.settings.tonemap`, etc.  This
 * shape makes the engine's per-frame snapshot and the React-facing
 * setters trivially derivable from each other.
 *
 * ### Mutation contract
 *
 * Every leaf field is mutated in place by the public-handle setters in
 * `engine.ts` (forwarded via `boringSetters` constructed from
 * `settingsTable.ts`) and read inside the per-frame loop and the
 * `renderFrame` dispatch.  The type is intentionally NOT `Readonly<>` —
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

import type { BiasMode } from '../data/BiasMode';
import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { StructureCategory } from '../engine/data/StructureCategory';
import type { SurveyId } from '../engine/data/SurveyId';
import type { FlowSettings } from './FlowSettings';
import type { VolumeFieldId } from '../data/VolumeFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';
import type { StructureItemSettings } from './StructureItemSettings';
import type { SurveyItemSettings } from './SurveyItemSettings';

export type EngineSettingsState = {
  /**
   * Survey point-billboard controls — the shared appearance knobs that
   * influence every survey's `points.wgsl` draw — plus the survey-layer
   * master gate and per-survey items. `enabled` is the coarse "hide all
   * surveys" gate (symmetric with `volumes.enabled` / `structures.enabled`).
   * Per-survey state lives in `items` — one row per `SurveyId`, each carrying
   * the layer-visibility axis (`enabled`) and the text-label axis
   * (`labelEnabled`). Only the famous-galaxy survey actually renders a label;
   * the other surveys carry `labelEnabled` inertly so all three source-type
   * clusters share the one per-item shape (surveys / structures / volumes all
   * expose `items[id].enabled`).
   */
  surveys: {
    enabled: boolean;
    sizePx: number;
    brightness: number;
    depthFade: boolean;
    highlightFallback: boolean;
    realOnly: boolean;
    items: Record<SurveyId, SurveyItemSettings>;
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
   * Camera-orbit behaviour controls.  Currently just `autoRotate`;
   * future tween / damping knobs would also live here.
   */
  camera: {
    autoRotate: boolean;
  };

  /**
   * Luminosity-bias correction inputs — the user-tunable subset.  The
   * bake-derived fields (`apparentMagLimit`, `schechterMStar`,
   * `schechterAlpha`) stay on `state.bias` — they're outputs of the
   * worker bake, not user-facing settings, so they don't belong in
   * the SettingsPanel's mental model.
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
   * Milky-Way disk overlay master toggle.
   */
  milkyWay: {
    enabled: boolean;
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
   * lazy-loads.  `items` is the same per-item accessor that surveys and
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
   */
  debug: {
    showPickBuffer: boolean;
    showDiskRadiusRing: boolean;
  };

  /**
   * Structure-overlay master gate and per-category settings.  `enabled` is
   * the coarse "hide all structures" gate (symmetric with `volumes.enabled`).
   * Per-category state lives in `items` — one row per `StructureCategory`,
   * each carrying the ring/marker axis (`enabled`) and the text-label axis
   * (`labelEnabled`).  Co-locating both axes on one row replaces the two
   * parallel root records that previously held the same booleans in different
   * shapes: a reader walks one `items[cat]` entry to learn everything about a
   * category's visibility instead of cross-indexing two records by the same
   * key.  `items` is the same per-item accessor surveys and volumes expose, so
   * all three source-type clusters share one shape.  Defaults to every
   * category fully visible.
   */
  structures: {
    enabled: boolean;
    items: Record<StructureCategory, StructureItemSettings>;
  };
};
