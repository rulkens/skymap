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
