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
 *
 * The 3-tuple form (`['settings', 'bias', 'absMagLimit']`) is included
 * for completeness of the union but `setAbsMagLimit` currently uses the
 * 2-tuple `['bias', 'absMagLimit']` flat path.  The 3-tuple slot in the
 * union keeps the door open for a future flat-write to the nested
 * sub-bag root without needing a new helper.
 */
type SettingsPath =
  | readonly ['settings', keyof EngineState['settings']]
  | readonly ['bias', keyof EngineState['bias']]
  | readonly ['settings', 'bias', 'absMagLimit'];

/**
 * Nested form used by descriptors during the H5 dual-write phase.
 *
 * Each entry references the new sub-bag fields that Task 2 introduced
 * alongside the flat ones; dual-writing keeps the flat and nested
 * shapes in sync so consumers can migrate one at a time without seeing
 * stale state.  Once the consumer migration completes (Task 12), the
 * flat paths and the entire dual-write branch get deleted and this
 * union becomes the only state path.
 */
type NestedSettingsPath =
  | readonly ['settings', 'points', keyof EngineState['settings']['points']]
  | readonly ['settings', 'tonemap', keyof EngineState['settings']['tonemap']]
  | readonly ['settings', 'camera', keyof EngineState['settings']['camera']]
  | readonly ['settings', 'bias', keyof EngineState['settings']['bias']]
  | readonly [
      'settings',
      'thumbnails',
      keyof EngineState['settings']['thumbnails'],
    ]
  | readonly ['settings', 'milkyWay', keyof EngineState['settings']['milkyWay']]
  | readonly [
      'settings',
      'filaments',
      keyof EngineState['settings']['filaments'],
    ]
  | readonly ['settings', 'volumes', 'masterEnabled'];

/**
 * Nested callback address: `[cluster, method]`.  The cluster names line
 * up 1:1 with the optional sub-bags Task 3 added to `EngineCallbacks`
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
  | readonly ['sources', string];

/**
 * One row of the descriptor table.
 *
 *   - `name` is the EngineHandle method to emit.
 *   - `path` is the two-step state path the value lands in.
 *   - `clamp` (optional) wraps the incoming value before it hits
 *      state AND the callback echo.  Returns the post-clamp number.
 *      Used by `setExposure` and `setFilamentIntensity`.
 *   - `nestedPath` (optional) is the 3-tuple sub-bag path written
 *      ALONGSIDE `path` during the H5 dual-write phase.  Kept optional
 *      because the field is only meaningful while both shapes coexist;
 *      Task 12 deletes both `path` and the dual-write branch.
 *   - `nestedCallback` (optional) is the `[cluster, method]` address
 *      fired after mutation.  Omit when no echo is wired (App.tsx owns
 *      the boolean optimistically — see `setFilamentsEnabled`).
 */
type SettingsDescriptor = {
  name: SettingsTableKey;
  path: SettingsPath;
  clamp?: (value: number) => number;
  /** Nested path written ALONGSIDE `path` during the H5 dual-write phase. */
  nestedPath?: NestedSettingsPath;
  /** Nested callback fired (H5 task 11 — the only callback shape now). */
  nestedCallback?: NestedCallbackKey;
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
    nestedPath: ['settings', 'points', 'sizePx'],
    nestedCallback: ['points', 'onSizeChange'],
  },
  {
    name: 'setBrightness',
    path: ['settings', 'brightness'],
    nestedPath: ['settings', 'points', 'brightness'],
    nestedCallback: ['points', 'onBrightnessChange'],
  },
  {
    name: 'setAutoRotate',
    path: ['settings', 'autoRotate'],
    nestedPath: ['settings', 'camera', 'autoRotate'],
    nestedCallback: ['camera', 'onAutoRotateChange'],
  },
  {
    name: 'setGalaxyTexturesEnabled',
    path: ['settings', 'galaxyTexturesEnabled'],
    nestedPath: ['settings', 'thumbnails', 'enabled'],
    nestedCallback: ['thumbnails', 'onEnabledChange'],
  },
  {
    name: 'setMilkyWayEnabled',
    path: ['settings', 'milkyWayEnabled'],
    nestedPath: ['settings', 'milkyWay', 'enabled'],
    nestedCallback: ['milkyWay', 'onEnabledChange'],
  },
  {
    // App.tsx owns this boolean optimistically; no echo callback wired.
    // Asymmetry vs. galaxyTextures/milkyWay is deliberate — see the
    // long comment in the original `setFilamentsEnabled`.
    name: 'setFilamentsEnabled',
    path: ['settings', 'filamentsEnabled'],
    nestedPath: ['settings', 'filaments', 'enabled'],
  },
  {
    // Filament-overlay intensity scale; clamps to [0, 1] same as the
    // hand-rolled setter did.  No callback for the same App-owns-state
    // reason as `setFilamentsEnabled`.
    name: 'setFilamentIntensity',
    path: ['settings', 'filamentIntensity'],
    clamp: (v) => Math.max(0, Math.min(1, v)),
    nestedPath: ['settings', 'filaments', 'intensity'],
  },
  {
    name: 'setHighlightFallback',
    path: ['settings', 'highlightFallback'],
    nestedPath: ['settings', 'points', 'highlightFallback'],
    nestedCallback: ['points', 'onHighlightFallbackChange'],
  },
  {
    name: 'setRealOnlyMode',
    path: ['settings', 'realOnlyMode'],
    nestedPath: ['settings', 'points', 'realOnly'],
    nestedCallback: ['points', 'onRealOnlyChange'],
  },
  {
    name: 'setDepthFadeEnabled',
    path: ['settings', 'depthFadeEnabled'],
    nestedPath: ['settings', 'points', 'depthFade'],
    nestedCallback: ['points', 'onDepthFadeChange'],
  },
  {
    // Note the path: `state.bias.absMagLimit`, not settings.  The only
    // current row that doesn't live under `state.settings`.
    name: 'setAbsMagLimit',
    path: ['bias', 'absMagLimit'],
    nestedPath: ['settings', 'bias', 'absMagLimit'],
    nestedCallback: ['bias', 'onAbsMagLimitChange'],
  },
  {
    // Clamps to [0.05, 16] before mutation/echo — a runaway slider or
    // devtools `setExposure(1e9)` must NOT blow out the float buffer
    // (upper) or zero-multiply the HDR signal into a black frame
    // (lower).  The echo fires the *clamped* value so React's slider
    // displays what the shader actually used.
    name: 'setExposure',
    path: ['settings', 'exposure'],
    clamp: (v) => Math.max(0.05, Math.min(16, v)),
    nestedPath: ['settings', 'tonemap', 'exposure'],
    nestedCallback: ['tonemap', 'onExposureChange'],
  },
  {
    name: 'setToneMapCurve',
    path: ['settings', 'toneMapCurve'],
    nestedPath: ['settings', 'tonemap', 'curve'],
    nestedCallback: ['tonemap', 'onCurveChange'],
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
  // 3-tuple form: a nested sub-bag traversal (`state.settings.bias.X`).
  // Pulled out first so the 2-tuple branches stay narrow under the
  // discriminant.  Only `['settings', 'bias', ...]` is reachable from
  // the current union, but the branch is generic so a future row can
  // join without re-shaping the helper.
  if (path.length === 3) {
    const [bag, sub, leaf] = path;
    // Non-null assertion: the descriptor table is the runtime guarantor
    // that the sub-bag exists.  `noUncheckedIndexedAccess` widens the
    // result of `Record<string, X>[k]` to `X | undefined`, which we
    // collapse here because the alternative — a defensive `if` plus
    // throw — would just be dead code (a future bad descriptor crashes
    // at the next line either way).
    const target = (
      state[bag] as unknown as Record<string, Record<string, unknown>>
    )[sub as string]!;
    target[leaf as string] = value;
    return;
  }
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
 * Apply a value to `state` at the given 3-tuple nested path.  Mirrors
 * `setByPath` for the new sub-bag fields introduced in Task 2 — kept
 * as a separate helper so the unsafe cast lives in one place and the
 * dual-write call sites in `buildSettersFromTable` read symmetrically
 * ("write flat, then write nested").
 *
 * Removed after Task 12 collapses the dual-write to a single nested
 * write — at which point `setByPath` itself goes away too.
 */
function setByNestedPath(
  state: EngineState,
  path: NestedSettingsPath,
  value: unknown,
): void {
  const [bag, sub, leaf] = path;
  // Two-step cast through `unknown` because `EngineState[bag]` is a
  // narrow struct type — Task 2 nests it as `{points: {...}, ...}` but
  // TS can't statically prove every sub key is a Record without the
  // explicit widening.  The descriptor table is the runtime guarantor.
  const target = (
    state[bag] as unknown as Record<string, Record<string, unknown>>
  )[sub as string]!;
  target[leaf as string] = value;
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
    const { name, path, clamp, nestedPath, nestedCallback } = descriptor;

    out[name] = (value: unknown) => {
      // Clamps only ever apply to numeric fields; descriptors that
      // declare a clamp are by definition number-typed.  The cast
      // here mirrors the runtime guarantee.
      const next =
        clamp !== undefined ? clamp(value as number) : value;

      // Flat write — the original behaviour, preserved verbatim so
      // every existing reader keeps observing the same state.
      setByPath(state, path, next);
      // Nested twin — Task 2's sub-bag fields.  Additive: new readers
      // see the same post-clamp value at the namespaced path.  Both
      // writes go away together when the dual-write phase ends.
      if (nestedPath !== undefined) {
        setByNestedPath(state, nestedPath, next);
      }

      // Nested callback fire (H5 task 11).  Same optional-chain shape
      // so a missing cluster or missing method is silently skipped.
      // The flat `callback` field on the descriptor is now unused at
      // runtime; Task 12 collapses the descriptor and removes the
      // dead field along with `path`/`setByPath`.
      if (nestedCallback !== undefined) {
        const [cluster, method] = nestedCallback;
        const sub = (
          cb as unknown as Record<string, Record<string, unknown> | undefined>
        )[cluster];
        const fn = sub?.[method] as ((v: unknown) => void) | undefined;
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
