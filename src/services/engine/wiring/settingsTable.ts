/**
 * settingsTable — declarative table-driven builder for the engine's
 * "boring" public-handle setters.
 *
 * ### Why a table?
 *
 * Many of the setters on `EngineHandle` (`setPointSize`, `setBrightness`,
 * `setExposure`, …) all share the same two-step shape:
 *
 *   1. dispatch the cluster's slice action, then
 *   2. call `requestRender()` to wake the render-on-demand scheduler.
 *
 * Spelled out one-by-one in `engine.ts`'s public-handle object literal,
 * those setters consumed ~180 lines of nearly-identical code with the only
 * variation being which action to dispatch.  The repetition is hard to scan
 * ("did we remember to call requestRender in *all* of them?") and easy to
 * silently regress when a new setting gets added without the wake.
 *
 * Reifying the shape as a descriptor table — name + action — and emitting the
 * setter functions from a single builder collapses the surface to one tested
 * helper plus one line per descriptor.  Auditing "every setting wakes the
 * scheduler" is now a one-line read of the builder.
 *
 * ### Why bespoke setters stay inline
 *
 * Several setters do NOT slot into the table:
 *
 *   - `setBiasMode` — kicks an async per-galaxy bake on the renderer
 *     and chains a follow-up `requestRender` to the resolve handler.
 *     The descriptor's `dispatch(action(v)); requestRender()` shape can't
 *     express that.
 *   - `setSourceVisible` — touches the visible-source mask with a
 *     fade animation, not just one boolean.
 *   - `flow.set` — dispatches the whole-patch `setFlow` slice action then runs
 *     per-leaf demand/fade/reseed side effects keyed off which keys the
 *     patch carried.
 *
 * Each does work that goes beyond "dispatch + render".  Trying to express
 * them through the table would either bloat the descriptor (subsystem refs,
 * async hooks, follow-up actions) until the table is really a switch
 * statement in disguise, or split their logic across the descriptor and a
 * custom path until neither half is readable.  Bespoke stays bespoke; the
 * table only owns the simple cases.
 *
 * ### Type-narrowness tradeoff
 *
 * The builder returns `Record<TableKey, (value: unknown) => void>`
 * because preserving per-method narrow types
 * (`setPointSize: (n: number) => void`, `setAutoRotate:
 * (b: boolean) => void`, …) would require one conditional branch per row
 * in the return type.  Production callers go through `EngineHandle`'s
 * declared signatures (and the sub-handle forwarders inside `engine.ts`),
 * so the narrowness loss inside the builder is invisible at the API edge.
 */

import type { UnknownAction } from '@reduxjs/toolkit';
import type { SettingsTableKey } from '../../../@types/settings/SettingsTableKey';
import type { AppStore } from '../../../store/types';
import {
  setGalaxyCatalogSize as setGalaxyCatalogSizeAction,
  setBrightness as setBrightnessAction,
  setDepthFade as setDepthFadeAction,
  setHighlightFallback as setHighlightFallbackAction,
  setRealOnly as setRealOnlyAction,
  setExposure as setExposureAction,
  setToneMapCurve as setToneMapCurveAction,
  setAutoRotate as setAutoRotateAction,
  setAbsMagLimit as setAbsMagLimitAction,
  setThumbnailsEnabled as setThumbnailsEnabledAction,
  setFilamentIntensity as setFilamentIntensityAction,
  setShowPickBuffer as setShowPickBufferAction,
  setShowDiskRadiusRing as setShowDiskRadiusRingAction,
} from '../../../state/settings/settingsSlice';

/**
 * A slice action creator: `(value) => UnknownAction`.  Every descriptor's
 * cluster has migrated to the app-injected RTK store, so a row carries a pure
 * action creator that the builder dispatches.  The builder still calls
 * `requestRender()` (dispatch alone does NOT wake the scheduler), so the "every
 * setter wakes the loop" audit stays in one place.  `value: never` matches the
 * builder's widened setter signature; the slice's own typed reducer is the
 * runtime guarantor.
 */
type SettingsAction = (value: never) => UnknownAction;

/**
 * One row of the descriptor table:
 *
 *   - `name` is the table-key identity of this descriptor (used as the
 *     Record key on the builder output so sub-handle forwarders can
 *     resolve a forwarder by name).
 *   - `action` is the cluster's slice action creator that the builder
 *     dispatches; React reads the value back via a `useAppSelector` rather than
 *     an echo.
 */
type SettingsDescriptor = { name: SettingsTableKey; action: SettingsAction };

/**
 * The actual table.  Adding a row here automatically extends the
 * builder output — no manual wiring in `engine.ts` beyond resolving
 * the new forwarder from the `boringSetters` record by name.
 */
export const SETTINGS_TABLE: readonly SettingsDescriptor[] = [
  // ── Galaxy catalogs cluster ────────────────────────────────────────────────
  // These five rows dispatch slice actions rather than mutating
  // `state.settings.galaxyCatalogs` in place + echoing. React reads each via a
  // `useAppSelector` (`selectGalaxyCatalogSize`, `selectBrightness`,
  // `selectDepthFade`, `selectHighlightFallback`, `selectRealOnly`), so no
  // echo is wired. The builder still calls `requestRender`.
  {
    name: 'setPointSize',
    action: setGalaxyCatalogSizeAction,
  },
  {
    name: 'setBrightness',
    action: setBrightnessAction,
  },
  {
    // Camera cluster. Dispatches the slice action; React reads via
    // `selectAutoRotate`, so no echo is wired. The builder still calls
    // `requestRender`.
    name: 'setAutoRotate',
    action: setAutoRotateAction,
  },
  {
    // Thumbnails cluster. Dispatches the slice action; the value has no React
    // mirror (the panel toggle was evicted — the engine reads it each frame via
    // `state.settings.thumbnails`), so no echo is wired. The builder still calls
    // `requestRender`.
    name: 'setGalaxyTexturesEnabled',
    action: setThumbnailsEnabledAction,
  },
  {
    // filaments cluster. Dispatches the slice action; React reads via
    // `selectFilamentIntensity`, so no echo is wired. Stores raw intent — the
    // filament renderer clamps to [0, 1] at point of use
    // (clampFilamentIntensity). The builder still calls `requestRender`.
    //
    // Filament/milkyWay *visibility* is NOT in this table: those setters also
    // drive a fade, so they live as bespoke `handles/` functions
    // (`setFilamentsEnabled`, `setMilkyWayEnabled`) that call the action +
    // `requestRender` + the fade bridge directly. Only the boring intensity knob
    // is table-driven.
    name: 'setFilamentIntensity',
    action: setFilamentIntensityAction,
  },
  {
    name: 'setHighlightFallback',
    action: setHighlightFallbackAction,
  },
  {
    name: 'setRealOnlyMode',
    action: setRealOnlyAction,
  },
  {
    name: 'setDepthFadeEnabled',
    action: setDepthFadeAction,
  },
  {
    // Bias cluster. Dispatches the slice action; React reads via
    // `selectAbsMagLimit`, so no echo is wired. The builder still calls
    // `requestRender`.
    name: 'setAbsMagLimit',
    action: setAbsMagLimitAction,
  },
  // ── Tonemap cluster ─────────────────────────────────────────────────────────
  // Both rows dispatch slice actions rather than mutating
  // `state.settings.tonemap` in place + echoing. React reads each via a
  // `useAppSelector` (`selectExposure`, `selectToneMapCurve`), so no echo is
  // wired. Exposure stores raw intent — the post-process pass
  // clamps to its HDR-safe range at point of use (clampExposure).
  {
    name: 'setExposure',
    action: setExposureAction,
  },
  {
    name: 'setToneMapCurve',
    action: setToneMapCurveAction,
  },
  {
    // Debug cluster. Pick-buffer overlay master toggle, off by default and gated
    // behind the DebugPanel. Dispatches the slice action; React reads via
    // `selectShowPickBuffer`, so no echo is wired. The builder still calls
    // `requestRender`.
    name: 'setShowPickBuffer',
    action: setShowPickBufferAction,
  },
  {
    // Debug cluster. Disk-radius debug-ring master toggle, off by default and
    // gated behind the DebugPanel. Dispatches the slice action; React reads via
    // `selectShowDiskRadiusRing`, so no echo is wired. The builder still calls
    // `requestRender`.
    name: 'setShowDiskRadiusRing',
    action: setShowDiskRadiusRingAction,
  },
];

/**
 * Build the setters from the descriptor table.  Returns a record keyed by
 * setter name; the consumer (`engine.ts`'s sub-handle wiring) resolves
 * forwarders by name from the result.
 *
 * Each emitted setter dispatches its cluster's slice action, then wakes the
 * scheduler via `requestRender()` — the single audit point the table exists for
 * (dispatch does NOT wake on its own).  React reads each value back through a
 * `useAppSelector`.
 *
 * The return type is widened to `(value: unknown) => void` per
 * descriptor; the EngineHandle public-API surface is the place where
 * the narrow per-method types live.  See the module-level note on the
 * type-narrowness tradeoff for why we don't try to preserve those
 * here.
 */
export function buildSettersFromTable(
  requestRender: () => void,
  store: AppStore,
): Record<SettingsTableKey, (value: unknown) => void> {
  const out = {} as Record<SettingsTableKey, (value: unknown) => void>;

  for (const { name, action } of SETTINGS_TABLE) {
    out[name] = (value: unknown) => {
      store.dispatch(action(value as never));
      requestRender();
    };
  }

  return out;
}
