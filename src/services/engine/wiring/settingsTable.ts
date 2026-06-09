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
 * with the only variation being the path tuple, the callback name, and
 * occasionally a clamp.  The repetition is hard to scan ("did we
 * remember to call requestRender in *all* of them?") and easy to
 * silently regress when a new setting gets added without one of the
 * three steps.
 *
 * Reifying the shape as a descriptor table — name, state path, optional
 * callback key, optional clamp — and emitting the setter functions from
 * a single builder collapses the surface to one tested helper plus a
 * handful of lines per descriptor.  Auditing "every setting wakes the
 * scheduler" is now a one-line read of the builder.
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
 * `key: 'settings.points.sizePx'` shape would force the builder to
 * parse strings at runtime; a typed 3-tuple
 * (`['settings', 'points', 'sizePx']`) lets the descriptor still read
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
import { MAX_PARTICLES, MIN_TRAIL_STEP } from '../../gpu/renderers/flowFieldConstants';

/**
 * 3-tuple path into `EngineState`: `['settings', <cluster>, <leaf>]`.
 *
 * Every current row writes into one of the eight `state.settings`
 * sub-bags.  Widening the union is the way to admit a future setter
 * that touches (say) `state.picking.*` without changing the helper.
 */
type SettingsPath =
  | readonly ['settings', 'points', keyof EngineState['settings']['points']]
  | readonly ['settings', 'tonemap', keyof EngineState['settings']['tonemap']]
  | readonly ['settings', 'camera', keyof EngineState['settings']['camera']]
  | readonly ['settings', 'bias', keyof EngineState['settings']['bias']]
  | readonly ['settings', 'thumbnails', keyof EngineState['settings']['thumbnails']]
  | readonly ['settings', 'milkyWay', keyof EngineState['settings']['milkyWay']]
  | readonly ['settings', 'filaments', keyof EngineState['settings']['filaments']]
  // Flow overlay (singleton-overlay-layer slice — see FlowSettings).
  | readonly ['settings', 'flow', keyof EngineState['settings']['flow']]
  | readonly ['settings', 'volumes', 'enabled']
  | readonly ['settings', 'debug', keyof EngineState['settings']['debug']];

/**
 * Nested callback address: `[cluster, method]`.  The cluster names
 * line up 1:1 with the optional sub-bags on `EngineCallbacks`
 * (`points`, `tonemap`, `camera`, `bias`, `thumbnails`, `milkyWay`,
 * `filaments`, `volumes`, `sources`).  Method names are kept as plain
 * `string` here because they vary per cluster and adding a full nested
 * union would duplicate the EngineCallbacks shape — the runtime
 * optional-chaining safely handles a missing method.
 */
type NestedCallbackKey =
  | readonly ['points', string]
  | readonly ['tonemap', string]
  | readonly ['camera', string]
  | readonly ['bias', string]
  | readonly ['thumbnails', string]
  | readonly ['milkyWay', string]
  | readonly ['filaments', string]
  | readonly ['volumes', string]
  | readonly ['sources', string]
  | readonly ['debug', string];

/**
 * One row of the descriptor table.
 *
 *   - `name` is the table-key identity of this descriptor (used as the
 *     Record key on the builder output so sub-handle forwarders can
 *     resolve a forwarder by name).
 *   - `path` is the 3-tuple state path the value lands in.
 *   - `clamp` (optional) wraps the incoming value before it hits state
 *     AND the callback echo.  Returns the post-clamp number.  Used by
 *     `setExposure` and `setFilamentIntensity`.
 *   - `callback` (optional) is the `[cluster, method]` address fired
 *     after mutation.  Omit when no echo is wired (App.tsx owns the
 *     boolean optimistically — see `setFilamentsEnabled`).
 */
type SettingsDescriptor = {
  name: SettingsTableKey;
  path: SettingsPath;
  clamp?: (value: number) => number;
  callback?: NestedCallbackKey;
};

/**
 * The actual table.  Adding a row here automatically extends the
 * builder output — no manual wiring in `engine.ts` beyond resolving
 * the new forwarder from the `boringSetters` record by name.
 */
export const SETTINGS_TABLE: readonly SettingsDescriptor[] = [
  {
    name: 'setPointSize',
    path: ['settings', 'points', 'sizePx'],
    callback: ['points', 'onSizeChange'],
  },
  {
    name: 'setBrightness',
    path: ['settings', 'points', 'brightness'],
    callback: ['points', 'onBrightnessChange'],
  },
  {
    name: 'setAutoRotate',
    path: ['settings', 'camera', 'autoRotate'],
    callback: ['camera', 'onAutoRotateChange'],
  },
  {
    name: 'setGalaxyTexturesEnabled',
    path: ['settings', 'thumbnails', 'enabled'],
    callback: ['thumbnails', 'onEnabledChange'],
  },
  {
    name: 'setMilkyWayEnabled',
    path: ['settings', 'milkyWay', 'enabled'],
    callback: ['milkyWay', 'onEnabledChange'],
  },
  {
    // App.tsx owns this boolean optimistically; no echo callback wired.
    // Asymmetry vs. galaxyTextures/milkyWay is deliberate — see the
    // long comment in the original `setFilamentsEnabled`.
    name: 'setFilamentsEnabled',
    path: ['settings', 'filaments', 'enabled'],
  },
  {
    // Filament-overlay intensity scale; clamps to [0, 1] same as the
    // hand-rolled setter did.  No callback for the same App-owns-state
    // reason as `setFilamentsEnabled`.
    name: 'setFilamentIntensity',
    path: ['settings', 'filaments', 'intensity'],
    clamp: (v) => Math.max(0, Math.min(1, v)),
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
    // String union; the setter's `value: unknown` carries it through — no clamp.
    name: 'setFlowMode',
    path: ['settings', 'flow', 'mode'],
  },
  {
    name: 'setFlowIntensity',
    path: ['settings', 'flow', 'intensity'],
    clamp: (v) => Math.max(0, Math.min(1, v)),
  },
  {
    // Particle count = buffer capacity ceiling; round + clamp to [0, MAX_PARTICLES]
    // so a fractional or runaway slider can't draw past the allocated buffer.
    name: 'setFlowCount',
    path: ['settings', 'flow', 'count'],
    clamp: (v) => Math.max(0, Math.min(MAX_PARTICLES, Math.round(v))),
  },
  {
    // Floor at MIN_TRAIL_STEP, NOT 0 — a zero trail spacing stalls the advect
    // integrator loop (GPU hang). The UI slider owns the max (single source of
    // truth). The renderer also floors at the GPU boundary (defense in depth).
    name: 'setFlowTrail',
    path: ['settings', 'flow', 'trail'],
    clamp: (v) => Math.max(MIN_TRAIL_STEP, v),
  },
  {
    name: 'setFlowSpeed',
    path: ['settings', 'flow', 'flowSpeed'],
    clamp: (v) => Math.max(0, v),
  },
  {
    name: 'setFlowDensityBias',
    path: ['settings', 'flow', 'densityBias'],
    clamp: (v) => Math.max(0, Math.min(1, v)),
  },
  {
    name: 'setFlowWander',
    path: ['settings', 'flow', 'wander'],
    clamp: (v) => Math.max(0, v),
  },
  {
    // Spherical boundary-fade band width, grid units. Clamp to [0, 0.5]: 0 is a
    // hard sphere clip, 0.5 fades from the cube centre outward.
    name: 'setFlowBoundaryFadeWidth',
    path: ['settings', 'flow', 'boundaryFadeWidth'],
    clamp: (v) => Math.max(0, Math.min(0.5, v)),
  },
  {
    name: 'setHighlightFallback',
    path: ['settings', 'points', 'highlightFallback'],
    callback: ['points', 'onHighlightFallbackChange'],
  },
  {
    name: 'setRealOnlyMode',
    path: ['settings', 'points', 'realOnly'],
    callback: ['points', 'onRealOnlyChange'],
  },
  {
    name: 'setDepthFadeEnabled',
    path: ['settings', 'points', 'depthFade'],
    callback: ['points', 'onDepthFadeChange'],
  },
  {
    name: 'setAbsMagLimit',
    path: ['settings', 'bias', 'absMagLimit'],
    callback: ['bias', 'onAbsMagLimitChange'],
  },
  {
    // Clamps to [0.05, 16] before mutation/echo — a runaway slider or
    // devtools `setExposure(1e9)` must NOT blow out the float buffer
    // (upper) or zero-multiply the HDR signal into a black frame
    // (lower).  The echo fires the *clamped* value so React's slider
    // displays what the shader actually used.
    name: 'setExposure',
    path: ['settings', 'tonemap', 'exposure'],
    clamp: (v) => Math.max(0.05, Math.min(16, v)),
    callback: ['tonemap', 'onExposureChange'],
  },
  {
    name: 'setToneMapCurve',
    path: ['settings', 'tonemap', 'curve'],
    callback: ['tonemap', 'onCurveChange'],
  },
  {
    // Pick-buffer debug overlay master toggle.  Off by default; gated
    // behind the SettingsPanel's Debug section.  Echoes through the
    // 'debug' callback cluster so deep-links or keyboard shortcuts can
    // flip the bit without going through React.
    name: 'setShowPickBuffer',
    path: ['settings', 'debug', 'showPickBuffer'],
    callback: ['debug', 'onShowPickBufferChange'],
  },
  {
    // Disk-radius debug ring master toggle.  Off by default; gated
    // behind the SettingsPanel's Debug section.  Echoes through the
    // 'debug' callback cluster, same shape as the pick-buffer toggle.
    name: 'setShowDiskRadiusRing',
    path: ['settings', 'debug', 'showDiskRadiusRing'],
    callback: ['debug', 'onShowDiskRadiusRingChange'],
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
 * Build the thirteen setters from the descriptor table.  Returns a
 * record keyed by setter name; the consumer (`engine.ts`'s sub-handle
 * wiring) resolves forwarders by name from the result.
 *
 * Each emitted setter:
 *   1. clamps the incoming value (if a clamp is declared);
 *   2. writes the (possibly clamped) value into `state` at `path`;
 *   3. fires the nested echo callback (if declared) with the
 *      post-clamp value;
 *   4. calls `requestRender()` so the next frame picks up the change.
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
): Record<SettingsTableKey, (value: unknown) => void> {
  const out = {} as Record<SettingsTableKey, (value: unknown) => void>;

  for (const descriptor of SETTINGS_TABLE) {
    const { name, path, clamp, callback } = descriptor;

    out[name] = (value: unknown) => {
      // Clamps only ever apply to numeric fields; descriptors that
      // declare a clamp are by definition number-typed.  The cast
      // here mirrors the runtime guarantee.
      const next = clamp !== undefined ? clamp(value as number) : value;

      setByPath(state, path, next);

      // Nested-only callback fire.  Optional-chain shape so a missing
      // cluster or missing method is silently skipped.
      if (callback !== undefined) {
        const [cluster, method] = callback;
        const sub = (cb as unknown as Record<string, Record<string, unknown> | undefined>)[cluster];
        const fn = sub?.[method] as ((v: unknown) => void) | undefined;
        fn?.(next);
      }

      requestRender();
    };
  }

  return out;
}
