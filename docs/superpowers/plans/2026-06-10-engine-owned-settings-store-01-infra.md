# Engine-owned settings store — Plan 01: infrastructure

> **REQUIRED SUB-SKILL:** execute via `superpowers:subagent-driven-development`
> — one fresh implementer subagent per task, with spec + quality reviews.
>
> **Companion plan:** [`2026-06-10-engine-owned-settings-store-02-migration.md`](2026-06-10-engine-owned-settings-store-02-migration.md)
> holds Phase 2 (cluster-by-cluster migration), Phase 3 (husk deletion), and the
> Phase 4 radar pass. This file covers Phase 0 (dependency) + Phase 1 (store
> scaffold). Execute this file first; the migration plan depends on the
> `handle.settingsStore` surface landing here.

**Spec:** `docs/superpowers/specs/2026-06-10-engine-owned-settings-store-design.md`
(the approved design — this plan implements exactly that, no scope creep).

## Goal

Make `state.settings` (the authoritative `EngineSettingsState`) the **single
home** for every render setting, observable by React via a zustand vanilla store
the engine owns. Delete the React-side mirror (`useEngineSettings`'s ~24 cells)
and the engine's ~13 settings echo callbacks, replacing both with `useStore`
selectors over the engine-owned store. Behaviour-preserving: same settings, same
clamps, same render output.

## Architecture

The engine constructs a `zustand/vanilla` store holding the whole
`EngineSettingsState`, seeded from `src/data/defaults.ts`, synchronously at the
top of `createEngine` before GPU init, and exposes it on `handle.settingsStore`.
The engine reads it every frame (via a `state.settings` getter that delegates to
`store.getState()`, so the dozens of `state.settings.X` read sites are
untouched) and writes it through **actions** that run pure copy-on-write
**reducers**. React subscribes to the same store with **selectors**.

## Tech Stack

- **zustand vanilla store, engine-owned.** Engine (`services/`) imports only
  `createStore` from **`zustand/vanilla`** — no React dependency in the core.
- **React 19** (`19.2.5`) consumes the store with **`useStore` from `zustand`**
  (built on `useSyncExternalStore`).
- Reducers + selectors are framework-agnostic pure functions — the unit-test
  surface.

## This is a /simplify un-braiding

The braid: **value × place mirror** (simplicity.md #5 — "state: values, never a
mirror that drifts from its authoritative home" — and #8 single source of
truth). Every render setting lives in two places — `state.settings`
(authoritative) and the `useEngineSettings` React copy — kept consistent by the
**echo protocol** (the engine fires a typed callback on every change; React
`setState`s). The protocol isn't even applied uniformly: some values echo, some
are "App-owned optimistic" (`filaments`, `volumes` master, `flow`), one is
hybrid (`exposure`). That asymmetry is the confession (simplicity.md
"asymmetry-language is a STOP signal"): it's an artifact of how the mirror is
stored, not anything essential.

**The organizing rule this plan must preserve (from the spec):**

> **settings → engine-owned store; events → callbacks.**

Do **not** let any settings value stay echo-mirrored after migration. Do **not**
turn an event (`lifecycle.onStatusChange`, `selection.onSelectChange`,
`camera.onFocusChange`/`onCameraChange`, `sources.onCatalogReady`/
`onLoadProgress`/`onStructureCountsChange`, `filaments.onReady`,
`input.spaceMouse.onConnectedChange`) into store state — those stay callbacks.

## Architecture / contract

### The store factory

**Create:** `src/services/engine/settingsStore/createSettingsStore.ts`

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';

export type SettingsStore = StoreApi<EngineSettingsState>;

// Seeds the whole EngineSettingsState from defaults; no actions ON the store
// object (actions live as free functions taking the store — see below).
export function createSettingsStore(initial: EngineSettingsState): SettingsStore;
```

The store holds **only** `EngineSettingsState` (the #295 cluster shape,
verbatim — `src/@types/settings/EngineSettingsState.d.ts`). No actions are
co-located on the state object: keeping the state shape identical to
`EngineSettingsState` means the engine's `state.settings` getter can return
`store.getState()` directly with no type surgery.

### Reducers / actions / selectors split

- **Reducers** — pure `(state: EngineSettingsState, payload) => EngineSettingsState`,
  copy-on-write at the touched cluster only
  (`{ ...state, surveys: { ...state.surveys, sizePx } }`). One file per reducer
  under `src/services/engine/settingsStore/reducers/`. The unit-test surface.
- **Actions** — thin free functions `(store, payload) => void` that call
  `store.setState((s) => reducer(s, payload))`. They live with the store and are
  what the engine's handle setters delegate to. No Redux-style action *objects*
  or dispatch (spec non-goal).
- **Selectors** — pure `(state: EngineSettingsState) => T`, one file per selector
  under `src/services/engine/settingsStore/selectors/`. Shared: React uses
  `useStore(store, selectSurveySize)`; the engine reads `state.settings.surveys.sizePx`
  directly (the getter delegates to the store) or `selectSurveySize(store.getState())`.

### The handle surface

`createEngine` exposes the store on the handle so React can subscribe:

```ts
handle.settingsStore: StoreApi<EngineSettingsState>   // getState / setState / subscribe
```

**Create:** `src/@types/engine/handles/EngineSettingsStoreHandle.d.ts` is NOT
needed — `settingsStore` is the raw `StoreApi`, added as a field on
`EngineHandle` (`src/@types/engine/EngineHandle.d.ts`). The action methods keep
surfacing through the **existing** sub-handle namespaces (`handle.surveys.*`,
`handle.structures.*`, …) — call sites barely change. The store is the
subscription seam; the sub-handles stay the imperative-write seam.

### Import boundary

- Engine code (`src/services/`): `import { createStore } from 'zustand/vanilla'`.
- React code (`src/components/`, `src/hooks/`): `import { useStore } from 'zustand'`.
- Reducers/selectors: zero framework imports (pure).

### Bootstrap / first paint

The store is constructed and seeded from `src/data/defaults.ts` **synchronously**
in `createEngine`, before the async bootstrap IIFE, and `state.settings` becomes
a getter returning `store.getState()`. React renders from `src/data/defaults.ts`
until the handle lands (today's pattern), then switches to `useStore` — values
match because both seed from the *same* defaults module. `src/data/defaults.ts`
becomes the **single** seed for both sides.

## Conventions reminder for every implementer

- **/simplify execution discipline:** the MAIN thread runs `npm test` /
  `npm run typecheck` and makes commits; implementer subagents **EDIT FILES
  ONLY** (they cannot run npm/npx). Run bash **sequentially** (a permission
  denial cascade-cancels a parallel batch). Use **Read/Grep**, never
  sed/awk/grep.
- **Pause before implementing:** reuse existing helpers/types; surface the
  simplest alternative before editing. **Escalate, don't hack** — if a clean
  migration is blocked structurally (notably the synchronous
  store-creation-in-`createEngine` bootstrap point, or the `state.settings`
  getter interacting with a frame-loop write), STOP and report rather than
  re-braiding around it.
- **Preserve the spec's un-braided choices:** settings → store, events →
  callbacks; reducers pure + copy-on-write; one defaults seed.
- **Tidy the strands you touch:** bring comments in edited files to current
  state — timeless and terse, explain WHY + the rejected alternative, **no**
  history notes (no dates / PR refs / "pre-X").
- **Skymap type conventions:** `type` not `interface`; one type per file in
  `src/@types`; `readonly` where neighbours use it; `Vec2`/`Vec3` not raw
  tuples; deep relative imports, no barrels.
- **Re-verify every cited `file:line`** against the live tree before relying on
  it (this plan cites current line numbers; refactors drift them).
- **Commit hygiene:** stage specific paths (NEVER `git add -A` / `.`); branch is
  `engine-settings-store` (off main); squash-merge; format only touched files.
  Tick this plan's `- [ ]` → `- [x]` inline in the same response as the
  TaskUpdate.
- **Adjacent-but-OUT-OF-SCOPE knot:** simplicity.md "Known entanglements" lists
  `scalarVolumeRenderer` mirror state (the RENDERER caching per-field enablement
  inside each `FieldEntry`). That is a **different** mirror (renderer↔EngineState,
  not React↔engine) and is **NOT** in scope here. Do not fold it in.

---

## Phase 0 — dependency

### Task 0.1: Add the zustand dependency

**Files:** `package.json` (modify — MAIN thread runs the install)

- [ ] MAIN thread runs `npm install zustand` (React 19.2.5 — zustand v5 supports
  React 19; confirm the resolved version is v5.x).
- [ ] Confirm `zustand` lands in `dependencies` (not `devDependencies` — it ships
  in both the engine bundle and the React bundle).
- [ ] `npm run typecheck` → still green (no usage yet).
- [ ] Commit `package.json` + lockfile.

---

## Phase 1 — store scaffold (runs ALONGSIDE the existing mirror)

No consumer migrates in this phase. The store is constructed, seeded, exposed on
the handle, and the reducer/selector/action test pattern is established. The
`useEngineSettings` mirror and all echoes stay live and authoritative — the
store is a parallel, not-yet-read structure until Plan 02.

### Task 1.1: Store factory + first reducer + first selector (the test template)

This task establishes the pure-unit-test pattern every later cluster copies.
Pick **surveys.sizePx** as the worked example (it's the simplest scalar leaf).

**Files:**
- Create `src/services/engine/settingsStore/createSettingsStore.ts`
- Create `src/services/engine/settingsStore/reducers/setSurveySize.ts`
- Create `src/services/engine/settingsStore/selectors/selectSurveySize.ts`
- Create `tests/services/engine/settingsStore/createSettingsStore.test.ts`
- Create `tests/services/engine/settingsStore/reducers/setSurveySize.test.ts`
- Create `tests/services/engine/settingsStore/selectors/selectSurveySize.test.ts`

**Contracts:**

```ts
// createSettingsStore.ts
export type SettingsStore = StoreApi<EngineSettingsState>;
export function createSettingsStore(initial: EngineSettingsState): SettingsStore;

// reducers/setSurveySize.ts — pure, copy-on-write at the surveys cluster
export function setSurveySize(state: EngineSettingsState, sizePx: number): EngineSettingsState;

// selectors/selectSurveySize.ts — pure projection
export function selectSurveySize(state: EngineSettingsState): number;
```

- [ ] Reducer test `setSurveySize copies-on-write the surveys cluster`:
  given a state, `next = setSurveySize(state, 4)` asserts `next.surveys.sizePx === 4`,
  `next.surveys !== state.surveys` (touched cluster is a NEW ref), and
  `next.tonemap === state.tonemap` (sibling clusters are the SAME ref).
- [ ] Reducer test `setSurveySize leaves the input state unmutated` asserts the
  original `state.surveys.sizePx` is unchanged after the call.
- [ ] Selector test `selectSurveySize returns the survey point size` asserts it
  reads `surveys.sizePx`.
- [ ] Store test `createSettingsStore seeds getState from the initial value`
  asserts `store.getState()` deep-equals the passed-in `EngineSettingsState`.
- [ ] Store test `setState with a reducer notifies subscribers and reflects in
  getState`: subscribe a spy, call `store.setState((s) => setSurveySize(s, 4))`,
  assert the spy fired and `selectSurveySize(store.getState()) === 4`.
- [ ] Run-fails (tests red, modules absent). MAIN thread runs `npm test -- settingsStore`.
- [ ] Implement the three modules. Build the test-fixture `EngineSettingsState`
  by reusing the construction pattern in `engine.ts:266-330` (defaults from
  `src/data/defaults.ts`); factor a tiny test helper if it'll be reused across
  reducer tests — do NOT duplicate the literal in every test file.
- [ ] Run-passes. MAIN: `npm test -- settingsStore` → green; `npm run typecheck`.
- [ ] Commit the six files.

### Task 1.2: Construct + seed the store in `createEngine`; expose on the handle

This is the **bootstrap point** flagged for escalation. The store must be created
synchronously, seeded from the SAME literal that today seeds `state.settings`
(`engine.ts:266-330`), and `state.settings` must delegate to it.

**Files:**
- Modify `src/services/engine/engine.ts` (construct store; `state.settings`
  getter; expose `handle.settingsStore`)
- Modify `src/@types/engine/EngineHandle.d.ts` (add `settingsStore` field)
- Modify `tests/services/engine/` — add/extend a construction test asserting the
  handle carries a seeded store (mirror the existing handle-shape test style;
  find the closest existing `createEngine`/handle test and extend it).

**Contract — `EngineHandle`:**

```ts
import type { StoreApi } from 'zustand/vanilla';
import type { EngineSettingsState } from '../settings/EngineSettingsState';

export type EngineHandle = {
  // … existing sub-handles …
  /**
   * The engine-owned settings store. React subscribes via `useStore`;
   * the engine reads it each frame and writes it through the sub-handle
   * setters' actions. One home for every render setting.
   */
  settingsStore: StoreApi<EngineSettingsState>;
  destroy: () => void;
  assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};
```

**`state.settings` seam — the decision to pin:** turn the `settings` literal at
`engine.ts:266-330` into the store's seed, then make `state.settings` a **getter**
that returns `store.getState()`. This keeps every existing frame-loop read
(`runFrame.ts:283-311`, the presentation producers, the passes — verified ~30
sites via `rg "state.settings\."`) working unchanged, because copy-on-write means
`store.getState()` returns a stable ref that only changes after a user-driven
write. Sketch:

```ts
// before (engine.ts ~259):
const state: EngineState = { settings: { surveys: {...}, tonemap: {...}, ... }, ... };

// after:
const settingsStore = createSettingsStore({ surveys: {...}, tonemap: {...}, ... });
const state: EngineState = {
  get settings() { return settingsStore.getState(); },  // delegates to the store
  ...
};
```

- [ ] Add `settingsStore` to `EngineHandle.d.ts` with the contract above.
- [ ] In `engine.ts`, build the seed object (the existing `settings` literal
  body, unchanged) and pass it to `createSettingsStore`. Replace the literal
  `settings:` field with the getter delegating to `settingsStore.getState()`.
- [ ] Add `settingsStore` to the handle literal (`engine.ts:1165` region).
- [ ] **Escalation check:** if making `settings` a getter trips a type error
  because `EngineState.settings` is declared non-`Readonly` and a write site
  assigns `state.settings.X = v` (the in-place mutators that Plan 02 will
  convert), confirm those writes still compile against the getter (they read a
  mutable object today). If a write site CANNOT be left untouched in Phase 1
  (e.g. it reassigns `state.settings = …`), STOP and report — do not add a
  setter that re-introduces a second write path.
- [ ] Construction test: `createEngine exposes a settingsStore seeded from
  defaults` — assert `handle.settingsStore.getState().surveys.sizePx ===
  DEFAULT_POINT_SIZE_PX` and `.tonemap.exposure === DEFAULT_EXPOSURE`.
- [ ] Construction test: `state.settings reads through the store` — drive an
  existing setter (whichever already has a construction-level test) and assert
  the change is visible via `handle.settingsStore.getState()`. (Plan 02 makes the
  setters write the store; in Phase 1 the in-place mutation of the object the
  store holds is still observed by `getState()` because it returns the same
  object ref — verify this holds, and if mutation-in-place does NOT surface to
  `getState` subscribers, note it: that's expected, and Plan 02's actions fix it
  by going copy-on-write. Phase 1 only needs `getState()` reads to reflect the
  current values, which they do.)
- [ ] MAIN: `npm test` (full engine suite stays green — behaviour unchanged) +
  `npm run typecheck`.
- [ ] Commit `engine.ts`, `EngineHandle.d.ts`, the test.

### Task 1.3: Establish the action pattern (no consumer migrated)

Add the **action** layer the migration plan builds on: a thin free function that
runs a reducer through `store.setState`. Worked on `setSurveySize` again so the
template is complete before Plan 02 starts migrating clusters.

**Files:**
- Create `src/services/engine/settingsStore/actions/setSurveySizeAction.ts`
- Create `tests/services/engine/settingsStore/actions/setSurveySizeAction.test.ts`

**Contract:**

```ts
// actions/setSurveySizeAction.ts
import type { SettingsStore } from '../createSettingsStore';
export function setSurveySizeAction(store: SettingsStore, sizePx: number): void;
// body: store.setState((s) => setSurveySize(s, sizePx));
```

- [ ] Action test `setSurveySizeAction writes the size through the reducer`:
  create a store, call the action, assert `selectSurveySize(store.getState())`
  reflects it and the surveys cluster ref changed (copy-on-write through the
  reducer).
- [ ] Run-fails. MAIN runs `npm test -- settingsStore`.
- [ ] Implement.
- [ ] Run-passes. MAIN: `npm test -- settingsStore` + `npm run typecheck`.
- [ ] Commit both files.

---

## Phase 1 exit criteria

- `zustand` is a dependency; engine imports `zustand/vanilla`.
- A seeded store exists and is reachable at `handle.settingsStore`.
- `state.settings` delegates to `store.getState()`; the full suite is green
  (behaviour unchanged — the mirror still drives React).
- The reducer / selector / action triplet for `surveys.sizePx` exists with pure
  unit tests — the **template** every cluster in Plan 02 copies.

Proceed to `2026-06-10-engine-owned-settings-store-02-migration.md`.
