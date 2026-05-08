/**
 * settingsTable — declarative table-driven builder for the engine's
 * "boring" public-handle setters.
 *
 * ### Why a table?
 *
 * Thirteen of the setters on `EngineHandle` (`setPointSize`,
 * `setBrightness`, `setExposure`, …) all share the same three-step shape:
 *
 *   1. mutate one field in `state.settings.*` (or `state.bias.*`),
 *   2. fire an optional echo callback so subscribed React state mirrors
 *      the engine truth,
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
 *   - `setLodMode` — flips the auto-LOD predicate AND fires an echo
 *     that observers (App.tsx) react to by re-driving source masks.
 *   - `setSourceVisible` — implicitly switches LOD mode to manual and
 *     touches the visible-source mask, not just one boolean.
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
 * ### Why nested `path` tuples instead of a flat key
 *
 * Twelve of the thirteen setters write to `state.settings.X`; the
 * thirteenth (`setAbsMagLimit`) writes to `state.bias.absMagLimit`.
 * A flat `key: 'settings.brightness'` shape would force the builder
 * to parse strings at runtime; a typed nested tuple
 * (`['settings', 'brightness']`) lets the descriptor still read like
 * a path while leaving runtime traversal as two indexed reads.  The
 * tuple shape also leaves the door open for a future setter that
 * touches a third sub-bag (e.g. `picking.*`) without changing the
 * descriptor type — just add another tuple entry.
 *
 * ### Type-narrowness tradeoff
 *
 * The builder returns `Record<TableKey, (value: unknown) => void>`
 * because preserving per-method narrow types
 * (`setPointSize: (n: number) => void`, `setAutoRotate:
 * (b: boolean) => void`, …) would require thirteen conditional
 * branches in the return type.  Production callers go through
 * `EngineHandle`'s declared signatures, so the narrowness loss inside
 * the builder is invisible at the API edge.  We assert the spread is
 * compatible with the relevant slice of `EngineHandle` via a
 * `satisfies` clause in `engine.ts`.
 */

import type { EngineCallbacks, EngineHandle, EngineState } from '../../../@types';

/**
 * The thirteen names this table owns.  Frozen in tests so a future
 * accidental drift (boring setter promoted to bespoke, or vice versa)
 * fails loudly rather than silently.
 */
export type SettingsTableKey =
  | 'setPointSize'
  | 'setBrightness'
  | 'setAutoRotate'
  | 'setGalaxyTexturesEnabled'
  | 'setMilkyWayEnabled'
  | 'setFilamentsEnabled'
  | 'setFilamentIntensity'
  | 'setHighlightFallback'
  | 'setRealOnlyMode'
  | 'setDepthFadeEnabled'
  | 'setAbsMagLimit'
  | 'setExposure'
  | 'setToneMapCurve';

/**
 * Path into `EngineState`.  Two-element tuple: a sub-bag key followed
 * by a leaf field.  Always indexes into `state.settings` or
 * `state.bias` for the current thirteen — but the type leaves room for
 * other sub-bags to join.
 */
type SettingsPath =
  | readonly ['settings', keyof EngineState['settings']]
  | readonly ['bias', keyof EngineState['bias']];

/**
 * One row of the descriptor table.
 *
 *   - `name` is the EngineHandle method to emit.
 *   - `path` is the two-step state path the value lands in.
 *   - `callback` (optional) is the EngineCallbacks key to fire after
 *      mutation.  Omit when no echo is wired (App.tsx owns the
 *      boolean optimistically — see `setFilamentsEnabled`).
 *   - `clamp` (optional) wraps the incoming value before it hits
 *      state AND the callback echo.  Returns the post-clamp number.
 *      Used by `setExposure` and `setFilamentIntensity`.
 */
type SettingsDescriptor = {
  name: SettingsTableKey;
  path: SettingsPath;
  callback?: keyof EngineCallbacks;
  clamp?: (value: number) => number;
};

/**
 * The actual table.  Adding a row here automatically extends the
 * builder output — no manual wiring in `engine.ts` beyond the existing
 * spread.  Removing a row from here without re-implementing the setter
 * inline will fail typecheck wherever `EngineHandle.setX` is required.
 */
export const SETTINGS_TABLE: readonly SettingsDescriptor[] = [
  {
    name: 'setPointSize',
    path: ['settings', 'pointSizePx'],
    callback: 'onPointSizeChange',
  },
  {
    name: 'setBrightness',
    path: ['settings', 'brightness'],
    callback: 'onBrightnessChange',
  },
  {
    name: 'setAutoRotate',
    path: ['settings', 'autoRotate'],
    callback: 'onAutoRotateChange',
  },
  {
    name: 'setGalaxyTexturesEnabled',
    path: ['settings', 'galaxyTexturesEnabled'],
    callback: 'onGalaxyTexturesEnabledChange',
  },
  {
    name: 'setMilkyWayEnabled',
    path: ['settings', 'milkyWayEnabled'],
    callback: 'onMilkyWayEnabledChange',
  },
  {
    // App.tsx owns this boolean optimistically; no echo callback wired.
    // Asymmetry vs. galaxyTextures/milkyWay is deliberate — see the
    // long comment in the original `setFilamentsEnabled`.
    name: 'setFilamentsEnabled',
    path: ['settings', 'filamentsEnabled'],
  },
  {
    // Filament-overlay intensity scale; clamps to [0, 1] same as the
    // hand-rolled setter did.  No callback for the same App-owns-state
    // reason as `setFilamentsEnabled`.
    name: 'setFilamentIntensity',
    path: ['settings', 'filamentIntensity'],
    clamp: (v) => Math.max(0, Math.min(1, v)),
  },
  {
    name: 'setHighlightFallback',
    path: ['settings', 'highlightFallback'],
    callback: 'onHighlightFallbackChange',
  },
  {
    name: 'setRealOnlyMode',
    path: ['settings', 'realOnlyMode'],
    callback: 'onRealOnlyModeChange',
  },
  {
    name: 'setDepthFadeEnabled',
    path: ['settings', 'depthFadeEnabled'],
    callback: 'onDepthFadeEnabledChange',
  },
  {
    // Note the path: `state.bias.absMagLimit`, not settings.  The only
    // current row that doesn't live under `state.settings`.
    name: 'setAbsMagLimit',
    path: ['bias', 'absMagLimit'],
    callback: 'onAbsMagLimitChange',
  },
  {
    // Clamps to [0.05, 16] before mutation/echo — a runaway slider or
    // devtools `setExposure(1e9)` must NOT blow out the float buffer
    // (upper) or zero-multiply the HDR signal into a black frame
    // (lower).  The echo fires the *clamped* value so React's slider
    // displays what the shader actually used.
    name: 'setExposure',
    path: ['settings', 'exposure'],
    callback: 'onExposureChange',
    clamp: (v) => Math.max(0.05, Math.min(16, v)),
  },
  {
    name: 'setToneMapCurve',
    path: ['settings', 'toneMapCurve'],
    callback: 'onToneMapCurveChange',
  },
];

/**
 * Apply a value to `state` at the given two-step path.  Kept as a
 * standalone helper rather than inlined in the builder so the
 * unsafe-but-bounded cast lives in one place — every other consumer
 * of the table calls this.
 *
 * The `as never` cast is needed because the union over `SettingsPath`
 * means TypeScript can't statically prove that `value` matches the
 * leaf type at the chosen path; the descriptor table is the runtime
 * guarantor instead.  See the module-level note on type narrowness.
 */
function setByPath(
  state: EngineState,
  path: SettingsPath,
  value: unknown,
): void {
  const [bag, leaf] = path;
  // The two branches are structurally identical but split so the
  // `bag` discriminant narrows correctly inside each — saves one
  // additional cast on the bag lookup.
  if (bag === 'settings') {
    (state.settings as Record<string, unknown>)[leaf as string] = value;
  } else {
    (state.bias as Record<string, unknown>)[leaf as string] = value;
  }
}

/**
 * Build the thirteen setters from the descriptor table.  Returns a
 * record keyed by setter name; the consumer (`engine.ts`'s public
 * handle) spreads it into the handle literal.
 *
 * Each emitted setter:
 *   1. clamps the incoming value (if a clamp is declared);
 *   2. writes the (possibly clamped) value into `state` at `path`;
 *   3. fires `cb[descriptor.callback]?.(post-clamp value)` if the
 *      descriptor declares a callback;
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
    const { name, path, callback, clamp } = descriptor;

    out[name] = (value: unknown) => {
      // Clamps only ever apply to numeric fields; descriptors that
      // declare a clamp are by definition number-typed.  The cast
      // here mirrors the runtime guarantee.
      const next =
        clamp !== undefined ? clamp(value as number) : value;

      setByPath(state, path, next);

      if (callback !== undefined) {
        // Optional-chaining mirrors the hand-rolled setters' shape:
        // a missing callback is silently skipped, never throws.
        // Indexing through `unknown` because `EngineCallbacks` keys
        // each carry their own narrow signature; the descriptor
        // table is the runtime guarantor that `next` matches.
        const fn = cb[callback] as ((v: unknown) => void) | undefined;
        fn?.(next);
      }

      requestRender();
    };
  }

  return out;
}

/**
 * Compile-time check that every setter we emit corresponds to a real
 * key on `EngineHandle`.  Removing or renaming an EngineHandle setter
 * without updating the table will trip this assertion.
 *
 * (Runtime cost: zero — `satisfies` is erased.)
 */
const _enginehandleKeyCheck: SettingsTableKey extends keyof EngineHandle
  ? true
  : false = true;
void _enginehandleKeyCheck;
