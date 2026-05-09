/**
 * EngineSettingsState — the user-facing rendering settings sub-bag of
 * the canonical `EngineState`.
 *
 * ### Why this type lives apart from EngineState
 *
 * Phase 4 of the engine refactor pulled ~30 scattered `let` bindings
 * inside `createEngine`'s closure into a single `state` object grouped
 * by concern.  This sub-bag holds every value the SettingsPanel surfaces
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
 * ### Mutation contract
 *
 * Every field is mutated in place by the public-handle setters at the
 * bottom of `engine.ts` (`setBrightness`, `setPointSize`, etc.) and
 * read inside the per-frame loop and the `renderFrame` dispatch.  The
 * type is intentionally NOT `Readonly<>` — see the smoke tests in
 * `tests/@types/engineState.test.ts` for the contract assertion.
 *
 * ### Initial values
 *
 * Defaults live in `data/defaults.ts` (the single source of truth shared
 * with App.tsx so the SettingsPanel doesn't flash a stale value before
 * the first echo callback fires); the consumer constructs an
 * `EngineSettingsState` value by pulling those constants into each field.
 */

import type { ToneMapCurve } from '../data/toneMapCurve';
import type { ScalarFieldPaletteId } from './ScalarCube';

/**
 * Per-field runtime controls for one registered scalar-volume field.
 *
 * Stored in `EngineSettingsState.volumeFields` keyed by the same handle
 * string passed to `addVolumeField` / `removeVolumeField`.  The engine
 * seeds these at registration time (via `DEFAULT_VOLUME_FIELD_INTENSITY`)
 * and keeps them in sync with every `setVolumeFieldEnabled` /
 * `setVolumeFieldIntensity` call, so the SettingsPanel can read the
 * authoritative per-field state without polling the GPU handle.
 */
export type VolumeFieldSettings = {
  /** When false, `scalarVolumeRenderer.setEnabled(handle, false)` silences this field. */
  enabled: boolean;
  /** Linear mix-in weight in [0, 1].  Seeded from `DEFAULT_VOLUME_FIELD_INTENSITY`. */
  intensity: number;
  /**
   * Palette LUT id for this field.  Each volume field owns its own LUT
   * texture (see `scalarVolumeRenderer.ts`); this value mirrors the
   * renderer's per-field palette so the SettingsPanel dropdown can read
   * authoritative state without going through the GPU handle.  Seeded
   * from `cube.paletteId` at registration time.
   */
  paletteId: ScalarFieldPaletteId;
};

export type EngineSettingsState = {
  pointSizePx: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  /**
   * Whether the cosmic-web filament-skeleton overlay is rendered.  The
   * underlying `filaments.bin` is an optional asset (built by the
   * DisPerSE pipeline via `npm run build-filaments`); when missing,
   * the renderer never receives an upload and toggling this flag is a
   * silent no-op.  Default OFF — see `DEFAULT_FILAMENTS_ENABLED` in
   * `data/defaults.ts` for the rationale.
   */
  filamentsEnabled: boolean;
  /**
   * Whether the 3D scalar-field volume overlay is rendered.  Multiple
   * field types are supported (CF-4 dark-matter, MCPM reionization,
   * synthetic test fixtures, …); this is the master gate — when false,
   * `scalarVolumePass.enabled` short-circuits before consulting the
   * renderer, so all cubes are skipped at zero GPU cost.
   *
   * Default ON.  Individual fields also have per-handle `enabled` and
   * `intensity` controls on `ScalarVolumeRenderer`; this flag is the
   * coarser user-facing toggle ("hide all volumes").
   */
  volumesEnabled: boolean;
  /**
   * Per-handle settings for every registered scalar-volume field.
   *
   * Keys are the handle strings passed to `addVolumeField`; values are
   * `VolumeFieldSettings` objects seeded at registration time and mutated
   * by `setVolumeFieldEnabled` / `setVolumeFieldIntensity`.  Entries are
   * added by `addVolumeField` and removed by `removeVolumeField`, so
   * this Record always mirrors the renderer's active field set.
   *
   * Empty at engine startup (`{}`).  The SettingsPanel reads this bag to
   * render per-field sliders without reaching through to the GPU handle.
   */
  volumeFields: Record<string, VolumeFieldSettings>;
  /**
   * Filament-overlay intensity scale, in [0, 1].  1.0 = unchanged shader
   * output; lower values dim the cosmic-web overlay against the bright
   * HDR catalogue.  See `DEFAULT_FILAMENT_INTENSITY`.
   */
  filamentIntensity: number;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  exposure: number;
  toneMapCurve: ToneMapCurve;
};
