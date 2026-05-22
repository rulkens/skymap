# Settings Store Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each phase is independently shippable and leaves the suite green.

**Goal:** Make a single vanilla Zustand store (`engineSettingsStore`) the sole source of truth for every `EngineState.settings.*` field, eliminating the double-store-plus-echo-callback machinery (the `settingsTable` callback half, the `useEngineSettings` mirror `useState`s, the `seedSettingsCallbacks` echo fan-out, and the echo half of `EngineCallbacks`).

**Why:** Today each setting lives in *three* places kept in sync by hand — the engine's `state.settings` bag (hot-loop read), a React `useState` mirror in `useEngineSettings`, and the echo callbacks that wire them together. Adding one setting touches four files. The `biasMode` spike (commit `1b30af6`) proved a single store can own a bidirectional, hot-loop-read, side-effecting field with the engine reading it back each frame, and that doing so is a **net code deletion** on the production side. This plan generalises that spike to the whole settings bag.

**Non-goal / scope boundary:** Only the `EngineState.settings.*` bag migrates. State that lives in *other* engine homes and echoes via *other* callback clusters — `visibleSourceMask` (`state.sources.drawMask`), SpaceMouse connection/sensitivity (subsystem), POI label/marker visibility (`poiSubsystem`), and the dynamic `volumes.fields` map — are **separate seams** with their own ownership and are explicitly out of scope. They are listed in "Out-of-scope follow-ups". `volumes.masterEnabled` (a plain boolean in the settings bag) *is* in scope; `volumes.fields` (a dynamic per-field record) is not.

**Tech Stack:** TypeScript + Vitest, React 19, vanilla Zustand (already a dependency), bound to React via `useSyncExternalStore` (NOT zustand's `useStore` — see `engineTelemetryStore.ts` for the client-only-SPA rationale).

---

## Architecture

### The invariant that keeps control un-inverted

The engine stays **authoritative**. React never writes settings directly into the store — it always calls an `EngineHandle` setter (`handle.points.setBrightness(v)`), which clamps / triggers side effects and *then* writes the store. The store is the engine's outbound projection that the engine *also reads back* in its hot loop. This is the same shape the `biasMode` spike used: writes funnel through the handle; the store replaces the echo callback channel and the `state.settings` bag simultaneously.

```
React control ──onChange──▶ handle.<cluster>.setX(v)
                                  │  (engine: clamp / side effects)
                                  ▼
                          engineSettingsStore.setX(clamped)   ← single source of truth
                            ▲                       │
                            │ getState() (hot loop) │ useX() selector
                   runFrame / wireInput        SettingsPanel / App
```

### Target store shape (layered + one generic interface)

`engineSettingsStore` keeps the **same layered/clustered shape** as `EngineSettingsState` (it's a relocation of that tree, not a re-modelling), and exposes **one generic setter + one generic selector hook** rather than a `setX`/`useX` pair per field:

```ts
export type SettingsValues = {
  points: { sizePx; brightness; highlightFallback; realOnly; depthFade };
  tonemap: { exposure; curve };
  camera: { autoRotate };
  bias: { mode; absMagLimit };
  thumbnails: { enabled };
  milkyWay: { enabled };
  filaments: { enabled; intensity };
  volumes: { masterEnabled };
};
// generic setter (type-safe via <C, K>): update('bias', 'mode', v)
// generic selector hook:                 useEngineSetting((s) => s.bias.mode)
export type SettingsStorePath = { [C in keyof SettingsValues]: readonly [C, keyof SettingsValues[C]] }[keyof SettingsValues];
```

`update<C, K>(cluster, key, value)` pins `value` to the leaf type, so `update('bias','mode', 3)` is a compile error. `useEngineSetting(selector)` re-renders only when the selected leaf changes — select primitives, not whole clusters.

### The `settingsTable` becomes store-driven

Each migrated row's `path: ['settings', cluster, leaf]` + `callback: [cluster, method]` is replaced by a single `storePath: [cluster, key]` (typed `SettingsStorePath`). The builder calls `engineSettingsStore.getState().update(cluster, key, next)` + `requestRender()`; the echo step is deleted. `clamp` is preserved. Rows migrate one at a time (legacy `path` rows coexist with `storePath` rows); Phase 5 flips the remainder and deletes `setByPath`/`SettingsPath`/`NestedCallbackKey`.

### The cluster-removal gotcha

When a cluster's **last** leaf migrates out of `EngineState.settings`, delete the now-empty cluster sub-bag from `EngineSettingsState`, its construction in `engine.ts`, and its entry in `settingsTable`'s `SettingsPath` union. Clusters and their last-field: `camera`→`autoRotate`, `tonemap`→both, `thumbnails`→`enabled`, `milkyWay`→`enabled`, `points`→all five, `filaments`→both, `bias`→`absMagLimit` (after `mode` already left), `volumes`→`masterEnabled` (but `fields` stays, so the `volumes` bag survives).

### The cast-heavy-fixture hazard (read before touching tests)

Many engine test fixtures build state as `… as unknown as EngineState`. `tsc` **cannot** flag a removed `settings.*` field inside such a cast (this is exactly how `runFrame.test`'s stale `bias: { mode: 'off' }` survived the spike). So **the test suite, not the compiler, is the safety net** for fixtures. After each field migration: `grep` the test tree for the field name and fix every fixture, then run the full suite. Do not trust `npm run typecheck` alone for test coverage of removed fields.

---

## File inventory (per field, the recipe)

For each settings field `F` in cluster `C` with leaf `L` (`state.settings.C.L`):

1. **Store** (`src/state/engineSettingsStore.ts`): the leaf already exists in its cluster (added in Phase 1). No per-field action/hook — writes go through the generic `update(cluster, key, v)`, reads through `useEngineSetting`.
2. **settingsTable** (`src/services/engine/wiring/settingsTable.ts`): change `F`'s row from `path`/`callback` to `storePath: [cluster, key]` (or move bespoke setters' `update(...)` call inline).
3. **Hot-loop / engine readers**: replace every `state.settings.C.L` read with `engineSettingsStore.getState().C.L`. Find them: `grep -rn "settings.C.L" src`. Known sites: `runFrame.ts`, `wireInput.ts`, and occasionally a pass `enabled()` predicate.
4. **EngineCallbacks** (`src/@types/engine/EngineCallbacks.d.ts`): delete `C.onLChange`. If the cluster bag becomes empty, delete the bag.
5. **seedSettingsCallbacks** (`.ts` + `SettingsCallbackSeed.d.ts`): delete the `cb.C?.onLChange?.(snapshot.X)` fire and the seed field.
6. **EngineState construction + type**: remove `L` from `EngineSettingsState.C` and from the literal in `engine.ts`. Remove the empty cluster if `L` was the last leaf.
7. **React**: delete `useEngineSettings` mirror `useState` + echo subscription + return field + the type field in `UseEngineSettingsState`. Have the consumer read `useEngineSetting((s) => s.C.L)`; thread it where it's rendered.
8. **Tests**: `grep` the test tree for `L` / the React field name; fix every fixture and assertion; run the full suite.

---

## Phase 1: Foundation — generalise the store + a test helper

### Task 1.1: Expand `engineSettingsStore` to the full flat settings shape

**Files:** Modify `src/state/engineSettingsStore.ts`

- [ ] **Step 1:** Define the layered `SettingsValues` tree (clusters mirroring `EngineSettingsState`) with defaults from `data/defaults.ts`, the generic `update(cluster, key, value)` action, the `SettingsStorePath` type, and the generic `useEngineSetting(selector)` hook bound via `useSyncExternalStore`.
- [ ] **Step 2:** Add a test-only reset helper exported from the module: `resetEngineSettingsStore()` that re-applies all defaults. (Used by `afterEach` in tests so the module-singleton store doesn't leak between cases within a file.)
- [ ] **Step 3:** `npm run typecheck` — expect PASS (nothing reads the new fields yet).
- [ ] **Step 4:** Commit: `feat(settings-store): expand store to full settings shape + reset helper`.

### Task 1.2: Shared settings-state test fixture helper

**Files:** Create `tests/services/engine/helpers/makeSettingsState.ts` (or extend an existing helper in that dir).

- [ ] **Step 1:** Export `makeEngineSettings(overrides?)` returning a valid `EngineSettingsState` literal from defaults, so fixtures stop hand-rolling the bag (and break loudly via a single helper when the shape changes, instead of silently via per-fixture casts).
- [ ] **Step 2:** This phase does NOT yet rewire existing fixtures — it only adds the helper. Commit: `test(settings): add makeEngineSettings fixture helper`.

---

## Phase 2: Migrate the `camera` cluster (`autoRotate`) — proves cluster removal

Smallest cluster (one field); migrating it empties `settings.camera`, exercising the cluster-removal gotcha end-to-end before the bigger clusters.

### Task 2.1: Store + table

- [ ] **Step 1:** `autoRotate` field/action/`useAutoRotate` already added in Phase 1 — verify present.
- [ ] **Step 2:** In `settingsTable.ts`, change the `setAutoRotate` row to write `engineSettingsStore.getState().setAutoRotate` instead of `path`/`callback`. (See Phase 5 for the table builder's structural change if migrating rows piecemeal; until then, the simplest is to special-case the row's emitted setter to call the store action + `requestRender`.)

### Task 2.2: Readers + React + cleanup

- [ ] **Step 1:** `grep -rn "settings.camera.autoRotate" src` — replace each reader (notably `runFrame.ts`'s auto-rotate yaw block) with `engineSettingsStore.getState().autoRotate`.
- [ ] **Step 2:** Delete `camera.onAutoRotateChange` from `EngineCallbacks` (`camera` bag also has `onFocusChange`/`onCameraChange`/`onScaleChange`/`onAutoRotateChange` — only drop `onAutoRotateChange`; the bag survives).
- [ ] **Step 2b:** Delete the `cb.camera?.onAutoRotateChange?.(snapshot.autoRotate)` fire in `seedSettingsCallbacks.ts` and `autoRotate` from `SettingsCallbackSeed`.
- [ ] **Step 3:** Remove `autoRotate` from `EngineSettingsState.camera`; if that empties the `camera` bag, remove the bag, its construction in `engine.ts`, and the `['settings','camera',…]` arm of `settingsTable`'s `SettingsPath` union.
- [ ] **Step 4:** In `useEngineSettings.ts`: drop the `autoRotate` `useState`, the `camera.onAutoRotateChange` echo, and the `autoRotate` return field; in `UseEngineSettingsState.d.ts` drop the field. In `App.tsx`: read `const autoRotate = useAutoRotate()`; the `AutoRotateToggle`'s `playing={autoRotate}` and `onToggle` (handle setter) are otherwise unchanged.
- [ ] **Step 5:** Tests: `grep -rn "autoRotate" tests` — fix fixtures/assertions; full `npm test`.
- [ ] **Step 6:** Commit: `feat(settings-store): migrate autoRotate to the store`.

---

## Phase 3: Migrate the `tonemap` cluster (`exposure`, `toneMapCurve`) — proves clamp + optimistic exception

`exposure` carries a clamp `[0.05, 16]` AND an App-side optimistic thumb-track (App nudges it locally for snappy slider feedback before the engine echo lands). The store unifies the optimistic case: one write, both sides read.

- [ ] **Task 3.1:** Migrate `toneMapCurve` (plain, follows the recipe). Readers: the HDR encode path (`encodeHdr*` / frame settings). Commit.
- [ ] **Task 3.2:** Migrate `exposure` (clamp preserved in the engine setter). The App-side optimistic `setExposure` becomes a direct `engineSettingsStore.getState().setExposure(v)` call from the slider onChange for thumb-tracking, while the authoritative clamped write still happens via the handle setter — document that the store makes the optimistic copy unnecessary (the snappy update and the authoritative update both land on the same store field). Remove `useEngineSettings`'s `setExposure` optimistic setter export and the `UseEngineSettingsReturn` entry. Commit.

---

## Phase 4: Migrate `thumbnails`, `milkyWay`, `filaments`, `bias.absMagLimit`

Each is a plain field or a clamped field; follow the recipe. `filaments.enabled` / `filaments.intensity` are App-owned-optimistic today (no echo) — in the store they become normal store writes from the handle setter, deleting the `setFilamentsEnabled` / `setFilamentIntensity` optimistic exports from `useEngineSettings`.

- [ ] **Task 4.1:** `thumbnails.enabled` → `galaxyTexturesEnabled`. Commit.
- [ ] **Task 4.2:** `milkyWay.enabled` → `milkyWayEnabled`. Commit.
- [ ] **Task 4.3:** `filaments.enabled` + `filaments.intensity` (drop the two optimistic setters). Commit.
- [ ] **Task 4.4:** `bias.absMagLimit` (empties `settings.bias` since `mode` already left — remove the `bias` bag + its `SettingsPath` arm). Commit.

---

## Phase 5: Migrate the `points` cluster + collapse the table builder

The five `points` fields, plus the structural payoff: rewrite `buildSettersFromTable` to write store actions instead of `state.settings` + echo. The `SETTINGS_TABLE` rows become `{ name, storeKey, clamp? }`; `setByPath`/`SettingsPath`/`NestedCallbackKey` are deleted.

- [ ] **Task 5.1:** Migrate `points.sizePx`, `brightness`, `highlightFallback`, `realOnly`, `depthFade` (readers: `runFrame`/`wireInput` `RenderFrameSettings` build, `pointSpritesPass`). Commit per 1-2 fields to keep diffs reviewable.
- [ ] **Task 5.2:** Collapse `settingsTable.ts`: rows → `{ name, storeKey, clamp? }`; builder calls `engineSettingsStore.getState()[storeKey](clamped); requestRender();`. Delete `setByPath`, `SettingsPath`, `NestedCallbackKey`, and the `EngineState`/`EngineCallbacks` imports if now unused. Update `settingsTable.test.ts`. Commit.

---

## Phase 6: Migrate `volumes.masterEnabled` + final teardown

- [ ] **Task 6.1:** Migrate `volumes.masterEnabled` → `volumesMasterEnabled`. The `volumes` bag survives (`fields` stays). Drop `setVolumesEnabled` optimistic export. Commit.
- [ ] **Task 6.2:** Teardown sweep. After every in-scope field has moved:
  - `EngineSettingsState` should contain only `volumes.fields` (+ any out-of-scope leaves). Confirm `grep -rn "state.settings" src` shows only the survivors.
  - `seedSettingsCallbacks` should fire only the out-of-scope echoes (mask, labels) — confirm it no longer fires any migrated cluster.
  - `EngineCallbacks` echo bags for fully-migrated clusters (`points`, `tonemap`, `thumbnails`, `milkyWay`, `filaments`) should be gone; `camera`/`bias`/`sources`/`volumes` keep only their non-migrated members.
  - `useEngineSettings` should be drastically smaller — only out-of-scope state (mask, spaceMouse, labels, volumeFields, filamentCounts) remains.
  - Commit: `refactor(settings-store): remove emptied settings machinery`.

---

## Phase 7: End-to-end verification

- [ ] **Step 1:** `npm run typecheck && npm test && npm run build` — all green.
- [ ] **Step 2:** Visual smoke (ask the user): drag every SettingsPanel control (point size, brightness, exposure slider thumb-tracking, tone curve, auto-rotate toggle, thumbnails/milkyway/filaments toggles, abs-mag slider, volumes master) and confirm each takes effect AND the panel reflects the engine-clamped value.
- [ ] **Step 3:** Confirm `tsc` + suite green; commit any verification fixes.

---

## Out-of-scope follow-ups (separate plans)

- **`visibleSourceMask`** — lives in `state.sources.drawMask`, echoes via `sources.onMaskChange`, written by the bespoke `setSourceVisible` (fade animation). Different home, different seam.
- **SpaceMouse** connection/sensitivity — subsystem-owned, `input.spaceMouse.*` echoes.
- **POI label/marker visibility** — `poiSubsystem`-owned, `labels.*` echoes, two independent axes.
- **`volumes.fields`** — dynamic per-field record (add/remove/tunables), pushed via `volumes.onFieldsChanged`. A store *could* own it but its dynamic-collection shape warrants its own design.
- **`setTier`** — bespoke; orchestrates asset-slot reloads. Not a settings-bag value.
