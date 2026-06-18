# Engine settings-handles dissolve into reconcile sagas (design)

> **Status:** approved design, awaiting implementation plan.
> **Why this exists:** the engine exposes ~34 imperative settings setters as
> `EngineHandle` methods (`handles/*.ts` + the `settingsTable` builder). Each one
> dispatches a slice write **and** runs a side effect (a render wake, a fade, a
> reseed, a worker bake) inline. That scatters reactive consequences of Intent
> across setters — the exact pattern [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md)
> and [`intent.md`](../../superpowers/conventions/intent.md) §5 say must live in
> **one effects home**. This folds every SettingsPanel-driven setter into plain
> store dispatches, and moves their consequences into a small set of **reconcile
> sagas** that react to the writes — standing up real behaviour on the empty saga
> seam the RTK migration wired.

## The decision in one line

The UI dispatches **plain settings slice actions** (`setMilkyWayEnabled(true)`),
never engine-handle methods or `requestX` commands. A handful of **table-driven
reconcile sagas** watch the settings write stream and drive the consequences
(wake, fades, flow reseed, bias bake). The entire `handles/` settings surface and
the `settingsTable` builder are deleted.

### Why react-to-write, not `requestX` commands

We considered making each effectful setter a reducer-less `request{X}` command
that a saga catches, dispatches the pure write for, and runs the effect behind
(the [tier-saga](./2026-06-19-tier-out-of-settings-saga-design.md) shape). We
rejected it as the **general** surface, for three reasons:

1. **A command buys no record/replay over the write.** Both are serializable
   action streams; recording `setMilkyWayEnabled(true)` replays exactly as well
   as a `requestMilkyWayEnabled(true)`. A command carries more than its write
   only when one user action fans out to *many* writes — and every setter here is
   a 1:1 single-field write. So the command is a second name for the write: two
   things that must agree (a pairing table), where one does (`simplicity.md` #8).
2. **It would split the UI vocabulary on an invisible property.** The boring
   setters already dissolve to direct `dispatch(setPointSize(n))`. A `requestX`
   surface for *effectful* setters means the UI dispatches `setX` for some knobs
   and `requestX` for others — so a SettingsPanel author must know whether a
   fade/bake happens downstream to pick the action. That braids the UI's action
   choice to the existence of an effect (`simplicity.md` #6, what/how). React-to-
   write erases it: the UI **always** dispatches the write; whether anything
   reconciles is invisible to it.
3. **`requestX` earns its keep only for a pre-write read or a non-serializable
   payload** — `requestTier` needs `prev` before the write (+ `takeLatest`
   cancellation); `addVolumeField` carries a GPU `cube`. Both are **out of scope**
   (see below). Generalizing the command shape to post-write-intent toggles is the
   form without the substance.

`requestX` stays the named pattern for the genuine command/transition cases. Tier
is the first, on its own branch.

## Scope

**In scope — dissolve into plain dispatch + reconcile sagas:**

- The `settingsTable` builder and its 13 "boring" rows (`setPointSize`,
  `setBrightness`, `setExposure`, `setToneMapCurve`, `setAutoRotate`, …) — pure
  `dispatch + requestRender`.
- The effectful `handles/*.ts` setters: the nine visibility/label fades
  (`setSourceVisible`, `setFilamentsEnabled`, `setMilkyWayEnabled`,
  `setMilkyWayLabelEnabled`, `setGalaxyCatalogLabelEnabled`,
  `setStructureItemEnabled`, `setStructureLabelEnabled`, `setVolumeFieldEnabled`,
  `setVolumesEnabled`), the wake-only `setPassDisabled` + the six volume-param
  setters, plus `setFlow` (fade + reseed) and `setBiasMode` (worker bake).

**Out of scope (do not scope-creep):**

- **`setTier`.** Its transition reads `prev` before the write and orchestrates
  per-source slot reloads — a genuine `requestTier` command/`takeLatest` case,
  specced and built on its own branch. It stays an `EngineHandle` method here and
  later reuses the same `setSagaContext` seam this spec generalizes.
- **`volumes.add` / `volumes.remove` (`addVolumeField` / `removeVolumeField`).**
  They carry a non-serializable GPU `ScalarCube` and call the renderer's
  `upload`/`unload` — resource registration, not user Intent, and **no component
  calls them** (only `engine.ts` wiring + dev/programmatic paths). They stay
  `EngineHandle` methods.
- **`camera.*` and `selection.*`.** Imperative camera tweens and the
  hover/select/focus ladder — the latter is the separate
  [selection-into-intent-store](./2026-06-18-selection-into-intent-store-design.md)
  fold. Untouched.
- **The read accessors** `getVolumeFieldsState` / `listVolumeFields` — queries, not
  commands.
- Any **rendering / fade-timing / camera** behaviour change. The wake, the fade
  ramps, the reseed, and the bake are moved verbatim, not altered.

---

## 1. The model

Intent (a settings value) is changed by **one** write path: dispatching the slice
action. Everything downstream is a reactive consequence, reconciled from the write:

```
UI ──dispatch(setX)──▶ settings slice ──(store notifies)──▶ reconcile sagas ──▶ wake / fade / reseed / bake
                                       └──────────────────▶ React selectors (re-render)
```

There is no command layer and no engine-handle method between the UI and the
write. The reconcile sagas are the single effects home `intent.md` §5 names.

### Why reconcile-from-write is correct (idempotence)

`syncVisibilityFades(state, { animate: true })` called with **no `only`** already
walks every intent row and drives each to its *current* intent target; `fadeTo` to
an unchanged target is a no-op. So it is an **idempotent reconciler** — "settings
changed → re-derive every fade", driving exactly the rows whose intent moved. The
`only: [row]` filter is purely a scoping optimization, and the action→row mapping
is pure data. Reacting to the write *after* the reducer runs means the reconciler
reads post-write intent — the same order today's handles rely on (dispatch, then
`syncVisibilityFades` reads `state.settings`).

---

## 2. The reconcile effects (engine-land)

The sagas live in the store layer and cannot reach the engine's scheduler,
renderers, or fade subsystem. The engine registers the effect closures — over
`EngineState` **only** (the write already happened; no store needed) — into saga
context, generalizing the tier spec's `setSagaContext`:

```ts
// src/store/effects/ReconcileEffects.ts (type) + makeReconcileEffects (engine wiring)
export type ReconcileEffects = {
  requestRender: () => void;
  syncFades: (rows: readonly VisibilityLayerKey[]) => void;
  reseedFlow: () => void;
  bakeBias: (mode: BiasMode) => void;
};

export function makeReconcileEffects(state: EngineState): ReconcileEffects {
  return {
    requestRender: () => state.subsystems.scheduler.requestRender(),
    syncFades: (rows) => syncVisibilityFades(state, { animate: true, only: rows }),
    reseedFlow: () => state.gpu.flowFieldRenderer?.maybeReseed(),
    bakeBias: (mode) => void state.subsystems.biasCorrection.setMode(mode),
  };
}
```

`createAppStore` returns `{ store, setSagaContext }`; `EngineCallbacks` gains
`setSagaContext`; the engine calls
`cb.setSagaContext({ reconcile: makeReconcileEffects(state) })` once `EngineState`
exists. `requestRender`/`syncFades` read `state.gpu` / `state.subsystems` live, so
registering before GPU init is fine — the closures dereference at call time.

---

## 3. The reconcile sagas

All four are `takeEvery` watchers composed into the (now non-empty) `mainSaga`.
Each reaches `ReconcileEffects` via `getContext('reconcile')`.

```ts
// (1) WAKE — every settings write wakes the render-on-demand loop, by construction.
// This kills settingsTable's "did we remember requestRender in ALL of them?" audit.
const isSettingsWrite = (a: UnknownAction): boolean =>
  typeof a.type === 'string' && a.type.startsWith(`${settingsRoute}/`);

function* watchWake() {
  yield* takeEvery(isSettingsWrite, function* () {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.requestRender();
  });
}

// (2) FADES — a settings write that maps to a fade row re-derives that row.
//     Pure data: write-action type → the VisibilityLayerKey it drives.
const FADE_ROW: Partial<Record<string, VisibilityLayerKey>> = {
  [setGalaxyCatalogVisible.type]: 'survey',
  [setGalaxyCatalogLabelEnabled.type]: 'surveyLabel',
  [setFilamentsEnabled.type]: 'filaments',
  [setMilkyWayEnabled.type]: 'milkyWayDisk',
  [setMilkyWayLabelEnabled.type]: 'milkyWayLabel',
  [setStructureItemEnabled.type]: 'structureRing',
  [setStructureLabelEnabled.type]: 'structureLabel',
  [writeVolumeField.type]: 'volumeField',
  [setVolumesEnabled.type]: 'volumesMaster',
  [setFlow.type]: 'flow',
};

function* watchFades() {
  yield* takeEvery((a: UnknownAction) => a.type in FADE_ROW, function* (action) {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.syncFades([FADE_ROW[action.type]!]);
  });
}

// (3) FLOW RESEED — only mode/count touch the shared particle buffers.
function* watchFlowReseed() {
  yield* takeEvery(setFlow, function* (a) {
    if (a.payload.mode === undefined && a.payload.count === undefined) return;
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.reseedFlow();
  });
}

// (4) BIAS BAKE — flipping the mode kicks the per-galaxy worker re-bake.
function* watchBiasBake() {
  yield* takeEvery(setBiasMode, function* (a) {
    const fx = yield* getContext<ReconcileEffects>('reconcile');
    fx.bakeBias(a.payload);
  });
}
```

`src/store/rootSaga.ts` composes them: `yield* all([watchWake(), watchFades(),
watchFlowReseed(), watchBiasBake()])` — replacing the empty `all([])`.

Notes on the design:

- **`writeVolumeField` is the single per-field write** (enabled / contrast /
  palette / … all flow through it), so `watchFades` fires on a contrast-only
  change too. `syncFades(['volumeField'])` then reconciles the volumeField fade —
  target unchanged → a no-op. Harmless, and it keeps the table a flat 1:1
  action→row map rather than inspecting the patch.
- **`FADE_ROW` mirrors the `only: [...]` rows the handles pass today**, one row per
  write action. It is the registry that replaces nine near-identical setter bodies
  (`simplicity.md` #7).
- **The wake is centralized**, so the reconcile effects need no `requestRender` of
  their own and the fade rows that today "ride fadeTo's own wake" keep working —
  `requestRender` is idempotent, so an extra wake from `watchWake` coalesces.

---

## 4. The UI migration (mechanical)

Every component call site that today reaches a handle method dispatches the slice
action it already corresponds to, via `useAppDispatch`:

```ts
handleRef.current?.milkyWay.setEnabled(true);   // before
dispatch(setMilkyWayEnabled(true));             // after
```

The full set (from the `handleRef.current?.…` audit) and its target action:

| Handle call (before) | Dispatch (after) |
| --- | --- |
| `sources.setVisible(src, v)` | `setGalaxyCatalogVisible({ id, enabled })` |
| `galaxyCatalogs.setLabelEnabled(id, v)` | `setGalaxyCatalogLabelEnabled({ id, enabled })` |
| `galaxyCatalogs.setSize/​setRealOnly/​setHighlightFallback/​setDepthFade` | `setGalaxyCatalogSize` / `setRealOnly` / `setHighlightFallback` / `setDepthFade` |
| `filaments.setEnabled(v)` / `filaments.setIntensity(n)` | `setFilamentsEnabled` / `setFilamentIntensity` |
| `milkyWay.setLabelEnabled(v)` | `setMilkyWayLabelEnabled` |
| `structures.setItemEnabled/​setLabelEnabled` | `setStructureItemEnabled` / `setStructureLabelEnabled` |
| `volumes.setEnabled/​setMasterEnabled` | `writeVolumeField({ id, patch: { enabled } })` / `setVolumesEnabled` |
| `volumes.setContrast/​setExposure/​setIntensity/​setDensityScale/​setPalette/​setTrim` | `writeVolumeField({ id, patch: { … } })` |
| `tonemap.setCurve(c)` | `setToneMapCurve` |
| `bias.setMode(m)` / `bias.setAbsMagLimit(n)` | `setBiasMode` / `setAbsMagLimit` |
| `camera.setAutoRotate(b)` | `setAutoRotate` |
| `debug.setShowPickBuffer/​setShowDiskRadiusRing` | `setShowPickBuffer` / `setShowDiskRadiusRing` |
| `flow.set(patch)` | `setFlow(patch)` |

**Clamps move onto the write path.** `setVolumeFieldContrast` & co. clamp raw
intent before dispatching today (`clampVolumeContrast`, …). Since the setter
disappears, the clamp moves into the `writeVolumeField` reducer so the stored
Intent is always valid regardless of caller. (`setFlow` already stores raw intent
and clamps at the renderer — left as is; only the volume-param clamps relocate.)

**Camera / selection / tier / `volumes.add|remove` / read accessors stay on the
handle** and their call sites are unchanged.

---

## 5. Correctness invariants (verify in planning)

- **`state.settings` reflects the store synchronously after a dispatch.** The
  reconcile sagas read post-write intent through `state.settings` (inside
  `syncVisibilityFades`). Today's handles already depend on this (dispatch, then
  read `state.settings`), so the guarantee exists; the plan confirms the engine's
  settings view is refreshed on the store's synchronous notify before the saga's
  `takeEvery` worker runs.
- **Idempotent fade reconcile.** `syncFades([row])` on a write that didn't change
  that row's intent is a no-op (target unchanged). Asserted by test (§7).
- **No double-fade race for user toggles.** The single-item `syncVisibilityFadeItem`
  path (concurrent slot-commit dissolves during a tier reload) is untouched; user
  toggles are one-at-a-time, last-issued-wins, so reconciling a single row per
  write introduces no A-redrives-B race.

---

## 6. Blast radius

**Add:**
`src/store/effects/ReconcileEffects.ts` (type) + `makeReconcileEffects` (engine
wiring, e.g. `src/services/engine/wiring/makeReconcileEffects.ts`);
`src/store/effects/reconcileSagas.ts` (the four watchers + `FADE_ROW`);
`SagaContext` / `SetSagaContext` in `src/store/types.ts`.

**Rework:**
`src/store/rootSaga.ts` (compose the four watchers); `src/store/createAppStore.ts`
(return `{ store, setSagaContext }`); `src/main.tsx` + callers (destructure);
`src/@types/engine/EngineCallbacks.d.ts` (+`setSagaContext`); engine wiring
(register `reconcile`); `src/state/settings/settingsSlice.ts` (volume-param clamps
into `writeVolumeField`); **every** SettingsPanel / DebugPanel component that calls
a dissolved handle (§4); the `EngineHandle` sub-handle types (drop the dissolved
methods, keep camera/selection/tier/add-remove/accessors).

**Delete:**
`src/services/engine/wiring/settingsTable.ts`; `src/@types/settings/SettingsTableKey.d.ts`;
the dissolved `src/services/engine/handles/*.ts` (all except `setTier`,
`addVolumeField`, `removeVolumeField`, `getVolumeFieldsState`, `listVolumeFields`)
and their `engine.ts` forwarders; the `handleRef` threading in React for the
dissolved methods.

**Unchanged:** the slice reducers themselves (the UI now dispatches them directly);
`syncVisibilityFades`; the fade manifest; `setTier`; camera/selection; all
rendering.

---

## 7. Testing

- **Reconcile sagas** (real `configureStore` + saga middleware +
  `setContext({ reconcile: { requestRender: vi.fn(), syncFades: vi.fn(), … } })`):
  - dispatch `setMilkyWayEnabled(true)` → `requestRender` called **and**
    `syncFades(['milkyWayDisk'])` called.
  - dispatch a boring write (`setPointSize`) → `requestRender` called, `syncFades`
    **not** called (no `FADE_ROW` entry).
  - dispatch `writeVolumeField({ id, patch: { contrast } })` → `syncFades(['volumeField'])`
    fires; assert it is a no-op against an unchanged enabled bit (idempotence).
  - dispatch `setFlow({ count })` → `reseedFlow` called; `setFlow({ enabled })` →
    `reseedFlow` **not** called, `syncFades(['flow'])` called.
  - dispatch `setBiasMode(1)` → `bakeBias(1)` called.
- **`makeReconcileEffects`** against a fake `EngineState`: each closure calls the
  expected subsystem method; `reseedFlow` tolerates a null renderer.
- **Effect-body parity:** the existing per-handle tests (fade row driven, bias
  bake kicked, flow reseed gated) repoint onto the saga + `makeReconcileEffects`,
  minus the now-deleted handle.
- **Deletion guards:** the `SettingsTableKey` freeze test and the dissolved-handle
  tests are removed; a test asserts `EngineHandle` no longer carries the dissolved
  methods (surviving set frozen).

---

## 8. Build order (suite green at each step)

1. **Saga seam.** `createAppStore` → `{ store, setSagaContext }`; add `SagaContext`
   / `SetSagaContext`; `EngineCallbacks` +`setSagaContext`; update `main.tsx` +
   test callers. `mainSaga` still `all([])`. Additive — no behaviour yet.
2. **Reconcile effects + sagas.** Add `ReconcileEffects` + `makeReconcileEffects`;
   engine registers `reconcile` at wiring; `rootSaga` composes the four watchers.
   Behaviour now fires *in addition* to the handles (idempotent wake/fade — both
   paths run; harmless), so the suite stays green while both coexist.
3. **Cut the boring table over.** Migrate the 13 boring call sites to direct
   dispatch; delete `settingsTable.ts` + `SettingsTableKey` + forwarders. Wake now
   comes from `watchWake`.
4. **Cut the fade/effect handles over.** Migrate the visibility/label/volume/flow/
   bias/pass call sites to direct dispatch; relocate the volume-param clamps into
   `writeVolumeField`; delete the dissolved `handles/*.ts` + forwarders.
5. **Trim `EngineHandle`.** Drop the dissolved sub-handle methods; freeze the
   surviving surface (camera, selection, tier, add/remove, accessors); reconcile
   tests.

---

## References

- [ADR 0007 — intent-centric state + effects](../../adrs/0007-intent-centric-state-and-effects.md)
  — the effects-layer direction; `typed-redux-saga` as the orchestrated-edge
  vehicle; this stands up real behaviour on its seam.
- [`intent.md`](../../superpowers/conventions/intent.md) §5 — effects are reactive
  consequences of Intent, in one home; the wake-as-effect worked example.
- [`simplicity.md`](../../superpowers/conventions/simplicity.md) — #6 (what/how),
  #7 (registry over branches), #8 (single source of truth) — the basis for
  react-to-write over `requestX`.
- [Tier out of settings — `requestTier` saga](./2026-06-19-tier-out-of-settings-saga-design.md)
  — the `requestX` command/`takeLatest` shape this spec deliberately does **not**
  generalize, and the `setSagaContext` boundary it **does**.
- [Selection into the Intent Store](./2026-06-18-selection-into-intent-store-design.md)
  — the selection/attention ladder fold, also out of scope here.
</content>
</invoke>
