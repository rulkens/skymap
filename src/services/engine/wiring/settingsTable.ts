/**
 * settingsTable — declarative table-driven builder for the engine's
 * "boring" public-handle setters.
 *
 * ### Why a table?
 *
 * Thirteen of the setters on `EngineHandle` (`setPointSize`,
 * `setBrightness`, `setExposure`, …) all share the same three-step shape:
 *
 *   1. mutate one field in `state.settings.<cluster>.<leaf>`,
 *   2. fire an optional nested echo callback so subscribed React state
 *      mirrors the engine truth,
 *   3. call `requestRender()` to wake the render-on-demand scheduler.
 *
 * Spelled out one-by-one in `engine.ts`'s public-handle object literal,
 * those thirteen setters consumed ~180 lines of nearly-identical code
 * with the only variation being the path tuple and the callback name.
 * The repetition is hard to scan ("did we remember to call requestRender
 * in *all* of them?") and easy to silently regress when a new setting
 * gets added without one of the three steps.
 *
 * Reifying the shape as a descriptor table — name, state path, optional
 * callback key — and emitting the setter functions from a single builder
 * collapses the surface to one tested helper plus a handful of lines per
 * descriptor.  Auditing "every setting wakes the scheduler" is now a
 * one-line read of the builder.
 *
 * ### Why bespoke setters stay inline
 *
 * Five setters do NOT slot into the table:
 *
 *   - `setBiasMode` — kicks an async per-galaxy bake on the renderer
 *     and chains a follow-up `requestRender` to the resolve handler.
 *     The descriptor's `state[path] = v; cb?.(v); requestRender()`
 *     shape can't express that.
 *   - `setTier` — orchestrates per-source asset-slot reloads via
 *     `cloudLoader.reloadSource`, with abort-controller plumbing.
 *   - `setSourceVisible` — touches the visible-source mask with a
 *     fade animation, not just one boolean.
 *   - `setSpaceMouseSensitivity` — forwards into the SpaceMouse
 *     subsystem rather than mutating engine state directly.
 *
 * Each does work that goes beyond "mutate + echo + render".  Trying to
 * express them through the table would either bloat the descriptor
 * (subsystem refs, async hooks, follow-up actions) until the table is
 * really a switch statement in disguise, or split their logic across
 * the descriptor and a custom path until neither half is readable.
 * Bespoke stays bespoke; the table only owns the simple cases.
 *
 * ### Why nested `path` tuples
 *
 * Every descriptor writes to `state.settings.<cluster>.<leaf>`.  A flat
 * `key: 'settings.surveys.sizePx'` shape would force the builder to
 * parse strings at runtime; a typed 3-tuple
 * (`['settings', 'surveys', 'sizePx']`) lets the descriptor still read
 * like a path while leaving runtime traversal as three indexed reads.
 * The tuple shape also leaves the door open for a future setter that
 * touches a non-`settings` sub-bag without changing the descriptor
 * type — just widen the union.
 *
 * ### Type-narrowness tradeoff
 *
 * The builder returns `Record<TableKey, (value: unknown) => void>`
 * because preserving per-method narrow types
 * (`setPointSize: (n: number) => void`, `setAutoRotate:
 * (b: boolean) => void`, …) would require thirteen conditional
 * branches in the return type.  Production callers go through
 * `EngineHandle`'s declared signatures (and the sub-handle forwarders
 * inside `engine.ts`), so the narrowness loss inside the builder is
 * invisible at the API edge.
 */

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { SettingsTableKey } from '../../../@types/settings/SettingsTableKey';
import type { SettingsStore } from '../settingsStore/createSettingsStore';
import { setSurveySizeAction } from '../settingsStore/actions/setSurveySizeAction';
import { setBrightnessAction } from '../settingsStore/actions/setBrightnessAction';
import { setDepthFadeAction } from '../settingsStore/actions/setDepthFadeAction';
import { setHighlightFallbackAction } from '../settingsStore/actions/setHighlightFallbackAction';
import { setRealOnlyAction } from '../settingsStore/actions/setRealOnlyAction';
import { setExposureAction } from '../settingsStore/actions/setExposureAction';
import { setToneMapCurveAction } from '../settingsStore/actions/setToneMapCurveAction';
import { setAutoRotateAction } from '../settingsStore/actions/setAutoRotateAction';
import { setAbsMagLimitAction } from '../settingsStore/actions/setAbsMagLimitAction';
import { setThumbnailsEnabledAction } from '../settingsStore/actions/setThumbnailsEnabledAction';
import { setMilkyWayEnabledAction } from '../settingsStore/actions/setMilkyWayEnabledAction';
import { setFilamentsEnabledAction } from '../settingsStore/actions/setFilamentsEnabledAction';
import { setFilamentIntensityAction } from '../settingsStore/actions/setFilamentIntensityAction';
import { setShowPickBufferAction } from '../settingsStore/actions/setShowPickBufferAction';
import { setShowDiskRadiusRingAction } from '../settingsStore/actions/setShowDiskRadiusRingAction';

/**
 * 3-tuple path into `EngineState`: `['settings', <cluster>, <leaf>]`.
 *
 * Every current row writes into one of the `state.settings` sub-bags
 * still on this legacy in-place path.  Widening the union is the way to
 * admit a future setter that touches (say) `state.picking.*` without
 * changing the helper.
 */
type SettingsPath =
  | readonly ['settings', 'surveys', keyof EngineState['settings']['surveys']]
  | readonly ['settings', 'tonemap', keyof EngineState['settings']['tonemap']]
  // Flow overlay (singleton-overlay-layer slice — see FlowSettings).
  | readonly ['settings', 'flow', keyof EngineState['settings']['flow']]
  | readonly ['settings', 'volumes', 'enabled'];

/**
 * Nested callback address: `[cluster, method]`.  The cluster names
 * line up 1:1 with the optional sub-bags on `EngineCallbacks`
 * (`surveys`, `tonemap`, `volumes`, `sources`).  Method
 * names are kept as plain `string` here because they vary per cluster
 * and adding a full nested union would duplicate the EngineCallbacks
 * shape — the runtime optional-chaining safely handles a missing method.
 */
type NestedCallbackKey =
  | readonly ['surveys', string]
  | readonly ['tonemap', string]
  | readonly ['volumes', string]
  | readonly ['sources', string];

/**
 * A store-action write: `(store, value) => void`.  Used by descriptors whose
 * cluster has migrated to the engine-owned settings store — the row dispatches
 * a pure copy-on-write action instead of mutating `state.settings` in place +
 * firing an echo.  The wrapper still calls `requestRender()` (the store action
 * does NOT wake the scheduler), so the "every setter wakes the loop" audit
 * stays in one place.  `value: unknown` matches the builder's widened setter
 * signature; the action's own typed reducer is the runtime guarantor.
 */
type SettingsAction = (store: SettingsStore, value: never) => void;

/**
 * One row of the descriptor table.  A row is EITHER store-backed (`action`) or
 * legacy echo-mirror (`path` + optional `callback`) — never both:
 *
 *   - `name` is the table-key identity of this descriptor (used as the
 *     Record key on the builder output so sub-handle forwarders can
 *     resolve a forwarder by name).
 *   - `action` (migrated clusters) dispatches a store action; the row carries
 *     no `path`/`callback` because the action owns the (copy-on-write) write
 *     and React reads via a selector rather than an echo.
 *   - `path` (un-migrated clusters) is the 3-tuple state path the value lands
 *     in via in-place mutation.
 *   - `callback` (optional, un-migrated only) is the `[cluster, method]`
 *     address fired after mutation.  Omit when no echo is wired (App.tsx owns
 *     the value optimistically — see the flow-overlay rows).
 */
type SettingsDescriptor =
  | { name: SettingsTableKey; action: SettingsAction; path?: undefined; callback?: undefined }
  | {
      name: SettingsTableKey;
      path: SettingsPath;
      callback?: NestedCallbackKey;
      action?: undefined;
    };

/**
 * The actual table.  Adding a row here automatically extends the
 * builder output — no manual wiring in `engine.ts` beyond resolving
 * the new forwarder from the `boringSetters` record by name.
 */
export const SETTINGS_TABLE: readonly SettingsDescriptor[] = [
  // ── Surveys cluster (migrated to the engine-owned store) ───────────
  // These five rows dispatch store actions (copy-on-write reducers) rather
  // than mutating `state.settings.surveys` in place + echoing. React reads
  // each via a `useStore` selector (`selectSurveySize`, `selectBrightness`,
  // `selectDepthFade`, `selectHighlightFallback`, `selectRealOnly`), so no
  // echo is wired. The wrapper still calls `requestRender`.
  {
    name: 'setPointSize',
    action: setSurveySizeAction,
  },
  {
    name: 'setBrightness',
    action: setBrightnessAction,
  },
  {
    // Camera cluster (migrated to the engine-owned store). Dispatches the
    // copy-on-write action; React reads via `selectAutoRotate`, so no echo is
    // wired. The wrapper still calls `requestRender`.
    name: 'setAutoRotate',
    action: setAutoRotateAction,
  },
  {
    // Thumbnails cluster (migrated to the engine-owned store). Dispatches the
    // copy-on-write action; the value has no React mirror (the panel toggle was
    // evicted — the engine reads it each frame via `state.settings.thumbnails`),
    // so no echo is wired. The wrapper still calls `requestRender`.
    name: 'setGalaxyTexturesEnabled',
    action: setThumbnailsEnabledAction,
  },
  {
    // milkyWay cluster (migrated to the engine-owned store). Dispatches the
    // copy-on-write action; React reads via `selectMilkyWayEnabled`, so no echo
    // is wired. The cosmetic fade ramp stays in the handle setter alongside this
    // action (see the `milkyWay.setEnabled` wrapper in engine.ts). The wrapper
    // still calls `requestRender`.
    name: 'setMilkyWayEnabled',
    action: setMilkyWayEnabledAction,
  },
  {
    // filaments cluster (migrated to the engine-owned store). Dispatches the
    // copy-on-write action; React reads via `selectFilamentsEnabled`, so no echo
    // is wired. The cosmetic fade ramp stays in the handle setter alongside this
    // action (see the `filaments.setEnabled` wrapper in engine.ts). The wrapper
    // still calls `requestRender`.
    name: 'setFilamentsEnabled',
    action: setFilamentsEnabledAction,
  },
  {
    // filaments cluster (migrated to the engine-owned store). Dispatches the
    // copy-on-write action; React reads via `selectFilamentIntensity`, so no
    // echo is wired. Stores raw intent — the filament renderer clamps to [0, 1]
    // at point of use (clampFilamentIntensity). The wrapper still calls
    // `requestRender`.
    name: 'setFilamentIntensity',
    action: setFilamentIntensityAction,
  },
  // ── Flow overlay (singleton-overlay-layer slice) ───────────────────
  // App.tsx owns these optimistically, like the filament rows — no echo
  // callbacks. The handle wraps setFlowEnabled/setFlowMode/setFlowCount
  // with side effects (demand re-eval, fade, reseed); the rest forward bare.
  {
    name: 'setFlowEnabled',
    path: ['settings', 'flow', 'enabled'],
  },
  {
    // String union; the setter's `value: unknown` carries it through.
    name: 'setFlowMode',
    path: ['settings', 'flow', 'mode'],
  },
  {
    // Look/motion knobs store raw intent; the flow renderer clamps each to its
    // GPU-safe bound at point of use (clampFlowParams) — including the
    // load-bearing count (buffer capacity) and trail (compute-loop) guards.
    name: 'setFlowIntensity',
    path: ['settings', 'flow', 'intensity'],
  },
  {
    name: 'setFlowCount',
    path: ['settings', 'flow', 'count'],
  },
  {
    name: 'setFlowTrail',
    path: ['settings', 'flow', 'trail'],
  },
  {
    name: 'setFlowSpeed',
    path: ['settings', 'flow', 'flowSpeed'],
  },
  {
    name: 'setFlowDensityBias',
    path: ['settings', 'flow', 'densityBias'],
  },
  {
    name: 'setFlowWander',
    path: ['settings', 'flow', 'wander'],
  },
  {
    name: 'setFlowBoundaryFadeWidth',
    path: ['settings', 'flow', 'boundaryFadeWidth'],
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
    // Bias cluster (migrated to the engine-owned store). Dispatches the
    // copy-on-write action; React reads via `selectAbsMagLimit`, so no echo is
    // wired. The wrapper still calls `requestRender`.
    name: 'setAbsMagLimit',
    action: setAbsMagLimitAction,
  },
  // ── Tonemap cluster (migrated to the engine-owned store) ───────────
  // Both rows dispatch store actions (copy-on-write reducers) rather than
  // mutating `state.settings.tonemap` in place + echoing. React reads each
  // via a `useStore` selector (`selectExposure`, `selectToneMapCurve`), so
  // no echo is wired. Exposure stores raw intent — the post-process pass
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
    // Debug cluster (migrated to the engine-owned store). Pick-buffer overlay
    // master toggle, off by default and gated behind the DebugPanel. Dispatches
    // the copy-on-write action; React reads via `selectShowPickBuffer`, so no
    // echo is wired. The wrapper still calls `requestRender`.
    name: 'setShowPickBuffer',
    action: setShowPickBufferAction,
  },
  {
    // Debug cluster (migrated to the engine-owned store). Disk-radius debug-ring
    // master toggle, off by default and gated behind the DebugPanel. Dispatches
    // the copy-on-write action; React reads via `selectShowDiskRadiusRing`, so
    // no echo is wired. The wrapper still calls `requestRender`.
    name: 'setShowDiskRadiusRing',
    action: setShowDiskRadiusRingAction,
  },
];

/**
 * Apply a value to `state` at the given 3-tuple path.  Kept as a
 * standalone helper rather than inlined in the builder so the
 * unsafe-but-bounded cast lives in one place.
 *
 * The casts are needed because the union over `SettingsPath` means
 * TypeScript can't statically prove that `value` matches the leaf
 * type at the chosen path; the descriptor table is the runtime
 * guarantor instead.  See the module-level note on type narrowness.
 */
function setByPath(state: EngineState, path: SettingsPath, value: unknown): void {
  const [bag, sub, leaf] = path;
  const target = (state[bag] as unknown as Record<string, Record<string, unknown>>)[sub as string]!;
  target[leaf as string] = value;
}

/**
 * Build the setters from the descriptor table.  Returns a record keyed by
 * setter name; the consumer (`engine.ts`'s sub-handle wiring) resolves
 * forwarders by name from the result.
 *
 * Each emitted setter wakes the scheduler via `requestRender()` — the single
 * audit point the table exists for — and writes its value one of two ways
 * depending on the descriptor:
 *
 *   - **store-backed** (`action`): dispatch the cluster's copy-on-write store
 *     action.  No echo — React reads via a `useStore` selector.
 *   - **legacy echo-mirror** (`path` + optional `callback`): mutate
 *     `state.settings` in place, then fire the nested echo callback (if
 *     declared) so the React mirror tracks the engine value.
 *
 * The return type is widened to `(value: unknown) => void` per
 * descriptor; the EngineHandle public-API surface is the place where
 * the narrow per-method types live.  See the module-level note on the
 * type-narrowness tradeoff for why we don't try to preserve those
 * here.
 */
export function buildSettersFromTable(
  state: EngineState,
  cb: EngineCallbacks,
  requestRender: () => void,
  store: SettingsStore,
): Record<SettingsTableKey, (value: unknown) => void> {
  const out = {} as Record<SettingsTableKey, (value: unknown) => void>;

  for (const descriptor of SETTINGS_TABLE) {
    // Store-backed rows: dispatch the action, then wake. The action owns the
    // (copy-on-write) write; React reads the value through a selector.
    if (descriptor.action !== undefined) {
      const { name, action } = descriptor;
      out[name] = (value: unknown) => {
        action(store, value as never);
        requestRender();
      };
      continue;
    }

    const { name, path, callback } = descriptor;

    out[name] = (value: unknown) => {
      setByPath(state, path, value);

      // Nested-only callback fire.  Optional-chain shape so a missing
      // cluster or missing method is silently skipped.
      if (callback !== undefined) {
        const [cluster, method] = callback;
        const sub = (cb as unknown as Record<string, Record<string, unknown> | undefined>)[cluster];
        const fn = sub?.[method] as ((v: unknown) => void) | undefined;
        fn?.(value);
      }

      requestRender();
    };
  }

  return out;
}
