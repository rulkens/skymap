# Engine-owned settings store — Plan 02: cluster migration + husk deletion

> **REQUIRED SUB-SKILL:** execute via `superpowers:subagent-driven-development`.
>
> **Companion plan:** [`2026-06-10-engine-owned-settings-store-01-infra.md`](2026-06-10-engine-owned-settings-store-01-infra.md)
> — Phase 0 (dependency) + Phase 1 (store scaffold). **Execute that file first.**
> This file assumes `handle.settingsStore` exists, `state.settings` delegates to
> the store, and the reducer / selector / action template
> (`setSurveySize` + `selectSurveySize` + `setSurveySizeAction`) is in place.

**Spec:** `docs/superpowers/specs/2026-06-10-engine-owned-settings-store-design.md`.

## Goal

Migrate every settings cluster from the echo-mirror protocol to the engine-owned
store, then delete the husk (the echo callbacks, the derive helpers,
`seedSettingsCallbacks`' settings portion, the emptied `useEngineSettings`
cells). Each cluster is a **green vertical slice** — green at every commit, NOT a
global expand-contract with a red window.

## The organizing rule (unchanged from Plan 01)

> **settings → engine-owned store; events → callbacks.**

No settings value stays echo-mirrored after this plan. No event becomes store
state.

## Conventions reminder for every implementer

Identical to Plan 01's "Conventions reminder" section — re-read it. The
load-bearing ones for this phase:

- MAIN thread runs npm + commits; implementers EDIT ONLY; bash sequential;
  Read/Grep not sed/awk/grep.
- **Escalate, don't hack.** If a cluster's React consumer can't switch to a
  `useStore` selector without restructuring (e.g. a value read outside a
  component, or a value that's actually an event in disguise), STOP and report.
- Tidy comments you touch; `type` not `interface`; one type per `@types` file;
  `readonly` where neighbours use it; no barrels; re-verify cited `file:line`.
- Stage specific paths; squash-merge; tick checkboxes inline.

## The migration pattern (per cluster)

Each cluster slice does the same four moves, in one commit, staying green:

1. **Reducer + selector + action** for the cluster's leaves — pure unit tests
   first (the contract), copying the `setSurveySize` template from Plan 01.
2. **Point the engine setter at the action.** The handle setter
   (`boringSetters.setX` via `settingsTable`, or a bespoke local function) stops
   mutating `state.settings.X` in place + firing the echo; it calls the store
   action instead. The frame-loop reads are already correct (they read
   `state.settings`, which delegates to the store).
3. **Switch the React consumer to a `useStore` selector.** App.tsx /
   SettingsPanel / DebugPanel stop reading the cluster's value from
   `useEngineSettings().settings.*` and read `useStore(handle.settingsStore,
   selectX)` instead. (See "React subscription seam" below for the handle-ref
   timing.)
4. **Delete that cluster's echo + mirror cell** — its `EngineCallbacks` entry's
   *fire site* (the `settingsTable` `callback` tuple or the bespoke `cb.X?.(…)`
   line), its `useEngineSettings` `useState` cell, its `engineCallbacks`
   subscription, and its `seedSettingsCallbacks` line. Leave the now-unused
   `EngineCallbacks` *type* sub-bag until Phase 3 (deleting it mid-phase would
   ripple through `SettingsCallbackSeed` and the seed test — batch that in the
   husk pass).

### React subscription seam

The engine handle lands in `handleRef` asynchronously (`useEngine.ts`), and
`useStore` needs a store instance at render time. Two viable shapes — the
implementer picks the simpler one for skymap and is consistent across clusters
(escalate if neither is clean):

- **(a)** A small `useSettingsStore(handleRef, selector)` hook in `src/hooks/`
  that returns the `defaults.ts` value until `handleRef.current` is non-null,
  then `useStore(handleRef.current.settingsStore, selector)`. First paint matches
  because both seed from `src/data/defaults.ts`.
- **(b)** Lift the store creation out of `createEngine` into `useEngine` and pass
  it INTO `createEngine` — rejected by the spec (the engine **owns** the store,
  created synchronously inside `createEngine`). Do not take this path.

Pin **(a)**. The hook is the single React-side adapter; selectors stay pure and
shared.

### Cluster migration order

Chosen to go simplest-first (scalar leaf, already-templated) and to defer the
two structurally-heaviest clusters (volumes' per-item snapshot, structures/labels'
two-axis derived records) to last so the pattern is fully proven first:

**surveys → tonemap → camera → bias → thumbnails → milkyWay → debug → filaments → volumes → flow → structures/labels**

Rationale for the tail:
- `filaments` / `volumes` master / `flow` are today **App-owned optimistic** (no
  echo) — migrating them removes the asymmetry (they become uniform store reads,
  and App.tsx drops its optimistic `setX` + dual-write).
- `volumes` per-field items flow through `onFieldsChanged` snapshots
  (`buildVolumeFieldsSnapshot`) — a richer reducer shape.
- `structures/labels` is the two-axis derived-record cluster
  (`deriveMarker/LabelCategoryVisibility`) and spans surveys (`famousGalaxy`
  label) + structures — the trickiest selector.

---

## Phase 2 — migrate cluster-by-cluster

### Task 2.1: surveys (the fully-worked template task)

This task spells out every move so 2.2+ can be terse. The surveys cluster covers
`sizePx`, `brightness`, `depthFade`, `highlightFallback`, `realOnly`, and the
master `enabled` + per-survey `items[id].enabled`/`labelEnabled`.

**Settings leaves & their current echoes/mirrors:**
- `surveys.sizePx` — `setPointSize` (`settingsTable.ts:147`), echo
  `surveys.onSizeChange`, cell `pointSize`.
- `surveys.brightness` — `setBrightness` (`settingsTable.ts:152`), echo
  `onBrightnessChange`, cell `brightness`.
- `surveys.depthFade` — `setDepthFadeEnabled`, echo `onDepthFadeChange`, cell
  `depthFadeEnabled`.
- `surveys.highlightFallback` — `setHighlightFallback`, echo
  `onHighlightFallbackChange`, cell `highlightFallback`.
- `surveys.realOnly` — `setRealOnlyMode`, echo `onRealOnlyChange`, cell
  `realOnlyMode`.
- per-survey visibility — `setSourceVisible` (`handles/setSourceVisible.ts`),
  echo `sources.onMaskChange`, cell `visibleSourceMask` (a derived bitmask, see
  note below).

**Note on `visibleSourceMask`:** the React cell is a *derived projection* of the
per-survey `enabled` bits (`deriveSourceMasks` packs `sources.pickMask`). The
clean migration is a **selector** `selectVisibleSourceMask(state)` that derives
the mask from `state.surveys.items[id].enabled` (the authoritative bits) — NOT a
new stored field. `setSourceVisibleImpl` already writes `items[id].enabled` as
the single source of truth (`setSourceVisible.ts:39-41`); the `onMaskChange` echo
+ `deriveSourceMasks`-of-`pickMask` becomes a pure store selector. Confirm the
selector reproduces the exact bitmask `deriveSourceMasks` emits
(`frame/deriveSourceMasks.ts`) so the panel checkboxes are bit-identical.
**Escalate** if the mask depends on fade-tail state the store doesn't hold (it
should not — the echo sends `pickMask` = intent bits, not the fade-tail
drawMask).

**Files:**
- Create reducers: `setSurveySizeAction` already exists (Plan 01); add
  `reducers/setBrightness.ts`, `setDepthFade.ts`, `setHighlightFallback.ts`,
  `setRealOnly.ts`, `setSurveyVisible.ts` + matching actions under `actions/`.
- Create selectors: `selectSurveySize` exists; add `selectBrightness`,
  `selectDepthFade`, `selectHighlightFallback`, `selectRealOnly`,
  `selectVisibleSourceMask`.
- Create `src/hooks/useSettingsStore.ts` (the subscription adapter, shape (a)).
- Modify `src/services/engine/handles/setSourceVisible.ts` (write via store
  action; drop `cb.sources?.onMaskChange?.`).
- Modify `src/services/engine/wiring/settingsTable.ts` (surveys rows lose their
  `callback` tuples once the actions own the write — see "settingsTable
  disposition" below).
- Modify `src/services/engine/engine.ts` (surveys boringSetters → actions).
- Modify `src/hooks/useEngineSettings.ts` (delete the surveys cells +
  subscriptions).
- Modify `src/components/App/App.tsx`, `src/components/SettingsPanel/SettingsPanel.tsx`,
  `src/components/DebugPanel/DebugPanel.tsx` (read via `useSettingsStore`
  selectors).
- Create reducer/selector tests mirroring the `setSurveySize` template.

**settingsTable disposition (read carefully — the spec asks whether the table is
absorbed or stays):** `settingsTable.ts` is the existing declarative write-path.
As of the clamp-at-point-of-use PR (#301) it carries **no clamps** — each row is
`{ name, path, callback? }` and the builder does mutate (`setByPath`) → echo →
`requestRender`. Its two remaining jobs split cleanly under the store: the
**mutate** becomes the store action (a pure copy-on-write reducer), the **echo**
is deleted, and the **`requestRender`** must be preserved (the store action does
NOT wake the scheduler). **Pin this:** keep `settingsTable` as the wake wrapper
but swap its body from `setByPath(state, …) + cb echo` to `action(store, value)`
— the descriptor's `path` stays, the `callback` tuple is removed, `setByPath` is
replaced by a call to the cluster action, and the wrapper still calls
`requestRender()`. This keeps the "every setter wakes the scheduler" audit in one
place (the table's reason to exist) while moving the *write* into the store.
**Do NOT** dissolve `settingsTable` into per-setter inline code — that would
scatter the requestRender audit the table consolidates (simplicity.md #8). If,
once a few clusters are migrated, the table is reduced to "action + requestRender"
and a reducer-registry would express it more directly, **raise it in the Phase 4
radar** rather than refactoring mid-migration.

- [x] Pure reducer tests (one per leaf), copy-on-write asserted (touched cluster
  new ref, siblings same ref), e.g. `setBrightness copies-on-write the surveys
  cluster`, `setSurveyVisible flips items[id].enabled and leaves siblings`.
- [x] Selector tests: `selectBrightness returns surveys.brightness`, …, and
  `selectVisibleSourceMask packs the enabled bits to the deriveSourceMasks
  bitmask` (assert bit-identical to `deriveSourceMasks` output for a known
  enabled-set).
- [x] `useSettingsStore` test: returns the defaults value when the handle ref is
  null; returns the live store value once a store is supplied (drive with a real
  `createSettingsStore`). Use the project's React-testing-library setup if one
  exists; otherwise test the null-fallback branch as a pure function and the
  live branch via the store directly — escalate if no RTL harness exists and the
  hook can't be unit-tested.
- [x] Run-fails. MAIN: `npm test -- settingsStore` (+ the hook test path).
- [x] Implement reducers/selectors/actions/hook.
- [x] Point `setSourceVisibleImpl` + the surveys boringSetters at the actions;
  delete the surveys echoes (fire sites) and the `onMaskChange` fire.
- [x] Switch App.tsx / SettingsPanel / DebugPanel surveys reads to
  `useSettingsStore(handleRef, selectX)`.
- [x] Delete the surveys `useState` cells + their `engineCallbacks.surveys` /
  `sources.onMaskChange` subscriptions + their `seedSettingsCallbacks` lines
  (`pointSize`, `brightness`, `highlightFallback`, `realOnlyMode`,
  `depthFadeEnabled`, `visibleSourceMask`). Leave the `EngineCallbacks` *type*
  sub-bags for Phase 3.
- [x] Run-passes. MAIN: full `npm test` (the surveys panel + `setSourceVisible`
  behaviour preserved; `setSourceVisibleFade` test unaffected — it asserts the
  fade, upstream of the store) + `npm run typecheck`.
- [ ] Commit the slice.

### Task 2.2: tonemap

Same pattern as surveys, for the `tonemap` cluster:
- Leaves: `tonemap.exposure` (`setExposure`, echo `tonemap.onExposureChange`,
  cell `exposure` —
  note the **hybrid** case: App.tsx also nudges `exposure` locally for snappy
  thumb tracking via `setExposure` from the hook (`useEngineSettings.ts:100` +
  `UseEngineSettingsReturn`). Migrating it removes the hybrid: the slider writes
  through the handle, `useStore` reflects it, the optimistic `setExposure` cell +
  return-value setter delete). `tonemap.curve` (`setToneMapCurve`, echo
  `onCurveChange`, cell `toneMapCurve`).
- Reducers `setExposure`, `setToneMapCurve`; selectors `selectExposure`,
  `selectToneMapCurve`. No clamp in the settings path — exposure's `[0.05, 16]`
  range already lives at the post-process pass (`clampExposure`, #301); the
  reducer stores the raw value.
- [ ] Reducer + selector tests (copy-on-write; the reducer stores the raw value
  verbatim — no clamp).
- [ ] Run-fails → implement → point setters at actions → delete tonemap echoes +
  cells + `setExposure` optimistic setter + `seedSettingsCallbacks` lines →
  switch App.tsx reads.
- [ ] Run-passes (full suite) → commit.

### Task 2.3: camera (autoRotate)

Same pattern, for `camera.autoRotate` (`setAutoRotate`, echo
`camera.onAutoRotateChange`, cell `autoRotate`). **Keep** the OTHER `camera`
callbacks — `onFocusChange`, `onCameraChange`, `onScaleChange` are EVENTS, not
settings; they stay (spec "what stays").
- [ ] Reducer `setAutoRotate` + selector `selectAutoRotate` + tests.
- [ ] Run-fails → implement → point `setAutoRotate` boringSetter at the action →
  delete the `onAutoRotateChange` echo + `autoRotate` cell + its seed line →
  switch App.tsx `AutoRotateToggle` read to `useStore`.
- [ ] Run-passes → commit.

### Task 2.4: bias

Same pattern, for `bias.mode` + `bias.absMagLimit`. **Subtlety to respect, not
braid:** `setBiasMode` is **bespoke** (`engine.ts:675`) — it kicks an async
worker bake via `biasCorrection.setMode`. Migrating it means: the store action
writes `bias.mode`; the bespoke `setBiasMode` keeps its `void
biasCorrection.setMode(mode)` side effect (that's a real event-driven action, not
a mirror) and drops the `cb.bias?.onModeChange?.` echo. `setAbsMagLimit` is a
boringSetter (`settingsTable.ts:258`).
- [ ] Reducers `setBiasMode`, `setAbsMagLimit` + selectors + tests.
- [ ] Run-fails → implement → `setBiasMode` writes via action then calls
  `biasCorrection.setMode` (no echo); `setAbsMagLimit` boringSetter → action →
  delete `bias` echoes + cells (`biasMode`, `absMagLimit`) + seed lines → switch
  SettingsPanel reads.
- [ ] Run-passes (the `biasCorrection` bake still fires — assert via the existing
  bias test if one exists) → commit.

### Task 2.5: thumbnails

Same pattern, for `thumbnails.enabled` (`setGalaxyTexturesEnabled`, echo
`thumbnails.onEnabledChange`, cell `galaxyTexturesEnabled`).
- [ ] Reducer `setThumbnailsEnabled` + selector + tests → implement → point
  boringSetter at action → delete echo + cell + seed line → switch SettingsPanel
  read → full suite → commit.

### Task 2.6: milkyWay

Same pattern, for `milkyWay.enabled`. **Preserve the fade:** the handle setter
(`engine.ts:1210`) fires `boringSetters.setMilkyWayEnabled(enabled)` AND
`fades.fadeTo({kind:'overlay', id:'milkyWay'}, …)`. Migrating: the boringSetter's
write becomes the action; the `fadeTo` stays (it's the cosmetic ramp, upstream-
unaffected). Echo `milkyWay.onEnabledChange`, cell `milkyWayEnabled`.
- [ ] Reducer `setMilkyWayEnabled` + selector + tests → implement → action +
  keep `fadeTo` → delete echo + cell + seed line → switch SettingsPanel read →
  full suite (milkyWay fade test, if any, unaffected) → commit.

### Task 2.7: debug

Same pattern, for `debug.showPickBuffer` + `debug.showDiskRadiusRing`
(`setShowPickBuffer` / `setShowDiskRadiusRing` boringSetters, echoes
`debug.onShowPickBufferChange` / `onShowDiskRadiusRingChange`, cells
`showPickBuffer` / `showDiskRadiusRing`). Consumer is DebugPanel.
- [ ] Reducers + selectors + tests → implement → point boringSetters at actions
  → delete echoes + cells + seed lines → switch DebugPanel reads → full suite →
  commit.

### Task 2.8: filaments (removes an App-owned-optimistic asymmetry)

`filaments.enabled` + `filaments.intensity` are today **App-owned optimistic**
(no echo — `settingsTable.ts:176,183` have no `callback`; App.tsx dual-writes via
`setFilamentsEnabled` + `handle.filaments.setEnabled` (`App.tsx:262-270`)).
Migrating removes the asymmetry: the values become uniform store reads; App.tsx
drops the optimistic `setFilamentsEnabled` / `setFilamentIntensity` and just
calls the handle. **Preserve the fade** (`engine.ts:1224` `fadeTo({kind:'filaments'})`).
Intensity's `[0,1]` clamp already lives at the filament renderer
(`clampFilamentIntensity`, #301) — not the settings path.
- [ ] Reducers `setFilamentsEnabled`, `setFilamentIntensity` + selectors + tests
  → implement → point boringSetters at actions (fade stays in the handle; no
  clamp — it's at the renderer) → delete the
  `setFilamentsEnabled`/`setFilamentIntensity` optimistic
  setters from `useEngineSettings` + the `filamentsEnabled`/`filamentIntensity`
  cells → switch App.tsx + StatsPanel reads to `useStore`; App.tsx's
  `onFilamentsChange`/`onFilamentIntensityChange` now call only the handle.
  **Keep** `filamentCounts` cell + `filaments.onReady` callback (that's an EVENT
  — spec "what stays").
- [ ] Run-passes (full suite) → commit.

### Task 2.9: volumes (master + per-field items)

Two parts: the master `volumes.enabled` (App-owned optimistic today —
`setVolumesEnabled` `engine.ts:866`, no echo; App.tsx dual-writes) and the
per-field `volumes.items` (driven through `cb.volumes?.onFieldsChanged?.(snapshot)`
echoes from ~8 bespoke setters — `addVolumeField`, `removeVolumeField`,
`setVolumeFieldEnabled`, `setVolumeFieldIntensity`/`Contrast`/`DensityScale`/
`Trim`/`Exposure`/`Palette`).

**Per-field migration shape:** the bespoke setters already write
`state.settings.volumes.items` via `writeVolumeFieldSetting` /
`removeVolumeFieldSetting` (copy-on-write helpers — `engine.ts:951-1033`). Convert
each to a store reducer/action wrapping the SAME helper, and replace the
`onFieldsChanged(buildVolumeFieldsSnapshot(state))` echo with a **selector**
`selectVolumeFieldRows(state)` that runs `buildVolumeFieldsSnapshot`-equivalent
projection (drop the `debug-*` filter on the React side, as today —
`useEngineSettings.ts:269`). The React `volumeFields` cell becomes
`useStore(handleRef, selectVolumeFieldRows)`.
- [ ] Reducer/selector tests: master `setVolumesEnabled` + per-field
  `setVolumeFieldEnabled`/etc. (copy-on-write of `volumes.items`), and
  `selectVolumeFieldRows` projects the rows the panel shows (debug-filtered).
- [ ] Run-fails → implement: master toggle → action (keep the `volumesMaster`
  fade, `engine.ts:876`); per-field setters → actions wrapping
  `writeVolumeFieldSetting`/`removeVolumeFieldSetting` (keep the per-field
  `fadeTo` + `requestRender` side effects + the debug-volume lazy-load —
  `maybeLazyLoadDebugVolume`); delete the `onFieldsChanged` echoes.
- [ ] Delete `setVolumesEnabled` optimistic setter + `volumesEnabled` /
  `volumeFields` cells + the `volumes.onFieldsChanged` subscription; switch
  App.tsx volumes reads to `useStore`. **Keep** `handle.volumes.getState()` /
  `list()` (they read the store too — confirm they project the same rows).
- [ ] Run-passes (full suite — volume fade/upsample tests unaffected) → commit.

### Task 2.10: flow (removes the last App-owned-optimistic asymmetry)

`settings.flow` (`FlowSettings` — `enabled` + 8 motion/look knobs) is App-owned
optimistic today (no echo; App.tsx dual-writes via `updateFlow` +
`handle.flow.set(patch)` — `App.tsx:112-118`). The flow boringSetters
(`settingsTable.ts:191-241`) no longer clamp — the knob clamps moved to
`clampFlowParams` at the flow renderer (#301); `handle.flow.set` applies per-leaf
side effects (demand re-eval, fade, reseed — `engine.ts:1240-1279`).

**Migration shape:** add a `setFlow` reducer that copy-on-writes a
`Partial<FlowSettings>` patch into `settings.flow`, and an action. There are no
flow clamps left in the settings path — the reducer stores the raw patch;
`clampFlowParams` at the renderer is the single home for the GPU-safe bounds
(`MAX_PARTICLES` / `MIN_TRAIL_STEP`). `handle.flow.set` keeps its
demand/fade/reseed side effects but routes
the writes through the action instead of the boringSetters. React drops the
`flow` cell + `updateFlow`; reads become `useStore(handleRef, selectFlow)`;
`onFlowChange` in App.tsx calls only `handle.flow.set(patch)`.
- [ ] Reducer `setFlow(state, patch: Partial<FlowSettings>)` + selector
  `selectFlow` + tests (copy-on-write; a partial patch merges, untouched leaves
  keep prior values).
- [ ] Run-fails → implement → route `handle.flow.set` writes through the action
  (keep the demand/fade/reseed effects; no clamps — they're at the renderer) → delete
  `flow` cell + `updateFlow` + `UseEngineSettingsReturn.updateFlow` → switch
  App.tsx + DebugPanel flow reads to `useStore`; `onFlowChange` calls only the
  handle.
- [ ] Run-passes (full suite — `flowFieldsHandle` test unaffected; it's upstream
  of the store) → commit.

### Task 2.11: structures / labels (the two-axis derived-record cluster)

The heaviest cluster: `structures.enabled` + per-category `items[cat].enabled`
(ring/marker axis) + `items[cat].labelEnabled` (text axis), PLUS the
`famousGalaxy` label which lives on `surveys.items.famousGalaxy.labelEnabled`.
Today this drives two echoes — `labels.onMarkerCategoryVisibilityChange` and
`labels.onLabelCategoryVisibilityChange` — each carrying a DERIVED record
(`deriveMarkerCategoryVisibility` / `deriveLabelCategoryVisibility`), mirrored
into the `markerCategoryVisibility` / `labelCategoryVisibility` cells. Setters:
`setStructureItemEnabled`, `setStructureLabelEnabled`, `setSurveyLabelEnabled`
(`handles/*.ts`).

**Migration shape (un-braids the derive helpers into selectors):** the derive
helpers become **selectors** — `selectMarkerCategoryVisibility(state)` =
today's `deriveMarkerCategoryVisibility` body over `state.structures.items`;
`selectLabelCategoryVisibility(state)` = today's `deriveLabelCategoryVisibility`
body (partition structure vs survey via `isStructureCategory`). The three setters
write `items[…].enabled`/`labelEnabled` via store actions (keep each setter's
per-category `fadeTo` — markerLayer / labelLayer — the cosmetic ramp, upstream-
unaffected). The echoes delete; React reads `useStore(handleRef,
selectMarker/LabelCategoryVisibility)`.
- [ ] Reducer tests: `setStructureItemEnabled` flips `items[cat].enabled`
  copy-on-write; `setStructureLabelEnabled` flips `items[cat].labelEnabled`;
  `setSurveyLabelEnabled` flips `surveys.items[id].labelEnabled`.
- [ ] Selector tests: `selectMarkerCategoryVisibility` reproduces
  `deriveMarkerCategoryVisibility` for a known items state;
  `selectLabelCategoryVisibility` reproduces `deriveLabelCategoryVisibility`
  (structure + famousGalaxy partition). Assert against the OLD helpers' output
  before deleting them (parity).
- [ ] Run-fails → implement selectors + actions → point the three setters at the
  actions (keep the `fadeTo` calls; drop the `cb.labels?.…` echoes) → delete the
  `markerCategoryVisibility` / `labelCategoryVisibility` cells + the
  `engineCallbacks.labels` subscriptions + the two `seedSettingsCallbacks` lines
  → switch App.tsx structure/label reads to `useStore`.
- [ ] Run-passes (full suite — `setCategoryVisibleFade` test unaffected) → commit.

---

## Phase 3 — delete the husk

Once the last consumer (2.11) migrates, no settings echo fires and no mirror cell
is read. Delete the dead structure in one slice (still green — these are now
unreferenced).

### Task 3.1: delete the settings echoes + derive helpers + seed husk

**Files:**
- Modify `src/@types/engine/EngineCallbacks.d.ts` — delete the **settings** echo
  sub-bags: `surveys?`, `tonemap?`, `bias?`, `thumbnails?`, `milkyWay?`,
  `debug?`, `labels?`, `volumes?`, `camera.onAutoRotateChange`,
  `sources.onMaskChange`. **KEEP** the EVENT members:
  `lifecycle.*`, `selection.*`, `camera.onFocusChange`/`onCameraChange`/
  `onScaleChange`, `sources.onTierChange`/`onCatalogReady`/`onLoadProgress`/
  `onStructureCountsChange`, `filaments.onReady`,
  `input.spaceMouse.onConnectedChange`.
- Delete `src/services/engine/wiring/seedSettingsCallbacks.ts` +
  `tests/services/engine/wiring/seedSettingsCallbacks.test.ts` +
  `src/@types/engine/wiring/SettingsCallbackSeed.d.ts`, and the call site
  (`phases/wireInput.ts:277-297`) + the `deriveMarker/LabelCategoryVisibility`
  imports there.
- Delete `src/services/engine/helpers/deriveMarkerCategoryVisibility.ts` +
  `deriveLabelCategoryVisibility.ts` + their tests (now superseded by the
  selectors).
- Modify `src/hooks/useEngineSettings.ts` — by now it holds only the
  EVENT-driven cells. **KEEP** `filamentCounts` (fed by `filaments.onReady`),
  `spaceMouseConnected` (fed by `input.spaceMouse.onConnectedChange`), and
  `spaceMouseSensitivity` (out-of-bag setting owned by the input subsystem —
  spec "what stays"; NOT in `EngineSettingsState`, so it does not move to the
  store in this effort). If those three are all that remain, either keep the hook
  as the thin event-cell holder OR fold them into `useEngine` — pick the smaller
  diff and **escalate if folding ripples** beyond the hook + App.tsx.
- Modify `src/@types/settings/UseEngineSettingsReturn.d.ts` + related
  (`UseEngineSettingsState`, `EngineSettingsCallbacks`) to match whatever
  remains.
- Modify `src/services/engine/engine.ts` — drop the now-dead `cb` echo arguments
  threaded into the migrated setters (`setSourceVisibleImpl`'s `cb` param, the
  structure setters' `cb` param, etc.) once nothing fires.
- Modify `src/services/engine/wiring/settingsTable.ts` — the `callback` field +
  `NestedCallbackKey` type are now unused (every row's write goes through an
  action). Remove them; the descriptor is `{ name, path }` and the wrapper is
  action + `requestRender` (the `clamp?` field was already removed by #301). (If
  the radar in Phase 4 finds the table is now a thin reducer-registry, note it —
  don't over-refactor here.)

**Explicit DO-NOT-DELETE list (so the implementer doesn't over-delete):**
- The EVENT callbacks listed above.
- `filamentCounts`, `spaceMouseConnected` cells (event-fed).
- `spaceMouseSensitivity` (out-of-`EngineSettingsState` setting — stays React
  state for now; the spec defers folding it into the store).

- [ ] Delete the settings echo sub-bags from `EngineCallbacks.d.ts`; KEEP events.
- [ ] Delete `seedSettingsCallbacks` (+ test + `SettingsCallbackSeed` + call
  site).
- [ ] Delete the two derive helpers + their tests.
- [ ] Trim `useEngineSettings` to the event cells (or fold into `useEngine`);
  update the return types.
- [ ] Drop dead `cb` echo params from migrated engine setters; remove
  `settingsTable`'s `callback`/`NestedCallbackKey`.
- [ ] MAIN: full `npm test` + `npm run typecheck` — green (the deletions are of
  now-unreferenced code; any red means a consumer wasn't migrated — fix forward,
  do not re-add an echo).
- [ ] Commit the husk-deletion slice (stage the specific deleted/modified paths).

---

## Phase 4 — entanglement-radar pass (REQUIRED final task)

### Task 4.1: radar the full diff and record the result

Per simplicity.md ("run the radar on the diff before you call a refactor done")
and the user's explicit request.

**Files:** none changed by default (this is a review). If the radar surfaces a
quick un-braid that's clearly in-scope (e.g. a stray surviving mirror), fix it in
this slice; otherwise record findings and stop.

- [ ] MAIN thread runs the `entanglement-radar` skill (or `/entanglement-radar`)
  over the full branch diff (`git diff main...engine-settings-store`).
- [ ] Confirm and record, as a short note in this task's checkbox or a comment:
  - **One home for every settings value** — no surviving React mirror cell that
    duplicates an `EngineSettingsState` leaf; `grep` `useEngineSettings` shows
    only event-fed cells + `spaceMouseSensitivity`.
  - **settings → store / events → callbacks boundary is clean** — every remaining
    `EngineCallbacks` member is a genuine event (status / selection / focus /
    camera-snapshot / catalog / load-progress / structure-counts /
    filaments-ready / spaceMouse-connected), none is a settings echo.
  - **No new switch-on-discriminant** that should be a registry (check the
    flow/volumes patch dispatch and the `settingsTable` wrapper).
  - **Reducers are pure** — copy-on-write, no engine/GPU import, no mutation of
    the input state (the reducer tests already assert this; the radar confirms no
    reducer slipped a side effect).
  - **`settingsTable` disposition** — confirm it's still the single
    requestRender-audit home (action + wake) and hasn't fractured into
    scattered inline setters; note if a reducer-registry would be a cleaner
    follow-up (do NOT do it here — out of scope).
- [ ] Confirm the OUT-OF-SCOPE `scalarVolumeRenderer` mirror was NOT touched.
- [ ] MAIN: final full `npm test` + `npm run typecheck` green.
- [ ] Commit the radar note (and any in-scope fix).

---

## Definition of done

- Every `EngineSettingsState` leaf is read by React via a `useStore` selector
  over `handle.settingsStore`; zero settings echoes remain in `EngineCallbacks`.
- `useEngineSettings` holds only event-fed cells (or is dissolved into
  `useEngine`); `spaceMouseSensitivity` stays as documented.
- `seedSettingsCallbacks`, `SettingsCallbackSeed`, `deriveMarkerCategoryVisibility`,
  `deriveLabelCategoryVisibility` are deleted.
- Reducers + selectors are pure, copy-on-write, unit-tested; the engine reads the
  store each frame via the `state.settings` getter; actions are the single write
  path.
- Full suite green at every commit; the fade tests (`setSourceVisibleFade`,
  `setCategoryVisibleFade`, `flowFieldsHandle`) untouched.
- The Phase 4 radar recorded one-home / clean-boundary / pure-reducers.
- Opened as a PR off `engine-settings-store`, squash-merged.
