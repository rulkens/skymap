# Animation Layer 2 — the tour saga, BeatData, capture/restore (Plan C)

> **For agentic workers.** Execute this plan via the
> **REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`** — a fresh
> subagent per task, with the spec + per-task `Interfaces` block as its brief,
> plus the spec/quality reviews that workflow gates on. Each task is a TDD loop:
> write the failing test → run it and confirm it fails → minimal implementation
> → confirm it passes → commit (specific paths only).

**Goal.** Build Layer 2 of the animation system — the **reactive orchestration**
that sequences Layer-1 clips into a guided tour. This plan adds: `BeatData`, the
`visitBeat` / `guidedTour` sagas, the `TOUR_ADVANCE` / `TOUR_EXIT` control
actions, the tour clip builders (`flyToClip` / `dwellDrift`, built from Plan A's
scene verbs + clip primitives), the `captureScene` / `restoreScene` widening of
the existing `captureSettings` / `restoreSettings` helpers (the snapshot gains
`selection.focus`), and `showCaption` / `ui.caption`.

> **The scene vocabulary is Plan A's (Layer 1) — this plan only CONSUMES it.** The
> `SceneEffect` type, the five `show`/`hide`/`fade`/`scene`/`focus` constructors,
> the `applySceneEffect` verb→side-effect dispatch table, and the `show`/`hide`
> fade-duration override on `syncVisibilityFades` are ALL Plan A's. The recording
> spikes (`cosmicFlows`, `webShowcase`) call `playClip` DIRECTLY with no tour saga
> and still use all five verbs, so "anything a saga-less recording clip uses is
> Layer 1" puts the whole scene vocabulary in Plan A. This plan's tour clip
> builders simply CALL Plan A's constructors; its validation (Task 8) ASSERTS the
> composed verb behaviour, building none of the machinery.
>
> **`suspendDuringClip` is Plan B's (Layer 1) — this plan only CONSUMES the
> parking.** The per-action guard that parks `watchFocusTween` while a clip plays
> guards ANY clip's camera (it keys on `selectClipActive`, true for saga-less
> recordings too), so it is Layer 1 = Plan B. A beat's in-clip `focus()` relies on
> the parking, but this plan adds NO task for it.

> **Plan A owns the `clipOpacity` channel — this plan CONSUMES it.** The
> third opacity channel `clipOpacity` (the channel factory, the `fade()` Layer-1
> primitive that writes it, the `FadeId → VisibilityLayerKey` bridge, the
> `resolveLayerOpacity` third factor + its six consumers, reset-on-clip-end, and
> the `clipPlayer.clipOpacityOf(layer, nowMs)` accessor) is Plan A's, in full. It
> is a transient, non-reactive, `clipPlayer`-owned mechanism = pure Layer 1. This
> plan never constructs the channel, never adds `createClipOpacityChannel`, never
> touches `resolveLayerOpacity`, and never owns `fade()`. Where this plan's clip
> builders need the channel they READ `clipPlayer.clipOpacityOf`; the `fade()`
> primitive (with the other four verbs) is a Plan-A constructor the tour's clips
> simply call.

**Architecture.** The tour is a `typed-redux-saga` that plays data clips
(`yield* call(playClip, clip)` — Plan B's seam) and adds the glue a clip cannot
predetermine: load-waits (`waitUntil`), click-to-advance (`take(TOUR_ADVANCE)`),
explicit exit (`take(TOUR_EXIT)`), and guaranteed settings+focus restore in a
`finally`. The saga reaches the engine through the SAME `getContext('reconcile')`
seam `watchFades` uses — never a `state`/`store` in lexical scope. Opacity
**composes, never braids**: `final alpha = intentOpacity(bridge) ×
focusRecession(structureFocus) × clipOpacity(clipPlayer)` — the three-factor
product Plan A wires into `resolveLayerOpacity`. The camera arbitrates (one winner
pose); opacity multiplies (three independent factors all apply). This plan reads
the composed alpha to VALIDATE it (Task 8), never builds the composition.

**Tech Stack.** TS + Redux Toolkit (inline-Immer slices) + `typed-redux-saga` /
`redux-saga`; React 19 + `react-redux`; Vitest; raw WebGPU engine in
`src/services/engine`.

**Source of truth.** The approved design
[`2026-06-19-animation-system-design.md`](../specs/2026-06-19-animation-system-design.md).
Read it fully before starting — especially "Scene effects: visibility verbs and
the three opacity channels", the Layer-2 `visitBeat` / `guidedTour` block, and the
"Migration and integration notes". This plan is open-decision #5 item **C**. It
lands on the parked tour spec
([`2026-05-07-tour-animation-design.md`](../specs/2026-05-07-tour-animation-design.md));
the `BeatData[]` replaces that spec's hand-rolled `tourSubsystem.advance(nowMs)`
sequencer.

**Depends on Plans A + B (the shared cross-plan contract — names EXACT):**

- From **A**: `ClipData`, `evaluateClip`, the `camera.clip` Intent +
  `startClip` / `endClip` actions, the `clip`@95 driver row (`commitsOnEdge`),
  the `clipPlayer` Resource (`tick` / `stop` / `clipOpacityOf`), the whole scene
  vocabulary (`SceneEffect`, the five `show`/`hide`/`fade`/`scene`/`focus`
  constructors, the `applySceneEffect` verb→side-effect table, the `show`/`hide`
  fade-duration override on `syncVisibilityFades`), the whole `clipOpacity`
  mechanism (channel + `resolveLayerOpacity` third factor + `fadeIdToVisibilityKey`
  bridge), `selectClipActive`.
- From **B**: `playClip(clip: ClipData): Promise<void>` — Plan C calls
  `yield* call(playClip, clip)`. The focus tween is the one-segment case of
  `evaluateClip`. `suspendDuringClip` (the `watchFocusTween` parking) + the
  `endClip → cancelCameraTween` teardown reaction are Plan B's.
- **Plan C adds** (this plan): `BeatData`, the tour clip builders
  (`flyToClip` / `dwellDrift`), `visitBeat` / `guidedTour`,
  `TOUR_ADVANCE` / `TOUR_EXIT`, `ReconcileEffects.captureScene` / `restoreScene`,
  and `showCaption`. The scene verbs, `applySceneEffect`, the duration override,
  and `suspendDuringClip` are Plan A/B's; this plan does not redefine them.

> **Sequencing gate.** This plan assumes A + B have landed (the `clipPlayer`
> Resource, `playClip`, `selectClipActive`, `startClip`/`endClip`, the
> `clipOpacity` channel + `clipPlayer.clipOpacityOf`, the scene vocabulary
> — `SceneEffect`, the five constructors, `applySceneEffect`, the duration override
> — and `suspendDuringClip` all exist). If a task here references a Plan-A/B symbol
> that is not yet on the branch, STOP and report — do not stub it. **Plan A owns
> the scene vocabulary + `clipOpacity`; Plan B owns `suspendDuringClip`; this plan
> consumes them and builds none.**

## Global Constraints

- TS: `export type X = …`, never `interface`. **One type per file** under
  `src/@types/` (filename = exported type): `BeatData.ts` is its own file.
  (`SceneEffect.ts` + `SettingsAction.ts` are Plan A's — imported, not declared
  here.) No barrels; deep relative imports. Use `Vec3`
  (`src/@types/math/Vec3`), never a raw tuple.
- **One function per file** in `utils/` / closure factories named for the symbol.
- Slices are **inline-Immer** like `settingsSlice` / `cameraSlice`; name
  slice-reducer args by their slice (`tour`/`action`), never terse `s`/`a`.
- `typed-redux-saga`: read `getContext` **INSIDE** the worker (per-action), like
  `watchFocusTween` (`focusTweenSaga.ts:36-37`). The engine registers its saga
  context AFTER the root saga forks.
- **`BeatData.effects` are plain Redux actions** — `visitBeat` does
  `yield* put(e)` verbatim, **no** `applyIntent` / `applyEffect` wrapper.
- Tests: Vitest, mirror the src tree under `tests/`. Typed `vi.fn<() => void>()`
  — bare `vi.fn()` fails tsc against typed callback fields. Saga tests use the
  real `configureStore` + saga-middleware harness from
  `tests/store/effects/reconcileSagas.test.ts`; the saga-context bag
  (`reconcile`, etc.) is injected via `runSaga`/middleware `context`.
- Didactic comments: explain *why* + the rejected alternative, matching the
  multi-paragraph module headers on `syncVisibilityFades.ts` / `focusRecession.ts`
  / `structureFocusSubsystem.ts`. Timeless + terse — no dates, no PR refs.
- Branch + PR, squash-merge. Commit with the user's git identity; stage SPECIFIC
  paths (never `git add -A`/`.`); trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## Resolved spec ambiguities (read before starting)

1. **`SourceRef` → `SelectionRef`.** The spec writes `BeatData.focus: SourceRef
   | null` and `focus(ref)`, but **no `SourceRef` type exists**. `focus()` drives
   selection focus through `updateSelectionFocus`
   (`selectionSlice.ts:31`), whose payload type is **`SelectionRef`**
   (`src/@types/engine/SelectionRef.d.ts`). So throughout this plan
   `BeatData.focus`, the `focus` scene verb, and `captureScene.focus` use
   **`SelectionRef | null`**. Do not introduce a new `SourceRef` alias.

2. **`clipOpacity` is keyed by `VisibilityLayerKey` — owned by Plan A.** The
   `clipOpacity` channel, its `VisibilityLayerKey` key space, the
   `fadeIdToVisibilityKey` renderer bridge, and the `clipPlayer.clipOpacityOf`
   accessor are ALL Plan A's (its Tasks 11–12). `fade([layers], …)` names layers
   the same `VisibilityLayerKey` way `show`/`hide` do
   (`src/@types/animation/VisibilityLayerKey`), so a `fade()` cue writes the
   channel directly. This plan only READS `clipPlayer.clipOpacityOf(layer, nowMs)`
   — in the Task 8 validation that the composed alpha is correct. It builds no
   channel, no bridge, and no `resolveLayerOpacity` change.

3. **The suspend-set + `endClip` teardown are Plan B's — consumed here.** Exactly
   `{ watchFocusTween }` is parked during a clip; `watchFades`, `watchFlowReseed`,
   `watchWake`, `watchSelectionRows` stay LIVE — the clip relies on them
   (intent-opacity bridge, render wake, the isolation dim a `focus()` cue *wants*).
   `suspendDuringClip(worker)` (Plan B) wraps the **worker inside `takeEvery`**, and
   `endClip()` clears any dormant `camera.tween` via `cancelCameraTween()` (Plan B's
   teardown reaction). This plan adds NO task for either — it relies on the parking
   so a beat's in-clip `focus()` plants no tween.

4. **The scene vocabulary is Plan A's — consumed here.** The `SceneEffect` type,
   all five `show`/`hide`/`fade`/`scene`/`focus` constructors, and the
   `applySceneEffect` verb→side-effect table are Plan A's (Layer 1: saga-less
   recordings use them). `scene` is typed to a `SettingsAction` union (never
   `AnyAction`); `focus` is a selection-Intent change; `fade` writes only
   `clipOpacity`. The verbs are clip TIMELINE effects fired edge-triggered by
   `clipPlayer` (Plan A's cue-firing + `applySceneEffect`) in the tick phase. This
   plan's tour clip builders simply CALL the constructors; it redeclares none of
   the type, the constructors, or the dispatch table.

5. **Caption channel.** The spec's `put(showCaption(beat.caption))` needs a
   `showCaption(string | null)` action + a `caption` field somewhere addressable.
   The parked tour spec routes captions through a label producer reading the
   active beat. To keep Layer 2 reusing the production action surface (and avoid a
   tour-private subsystem), `showCaption` writes a `ui.caption` field on the
   shipped `ui` slice (`uiSlice.ts`); a caption producer/consumer is the parked
   tour's concern, out of scope here. `visitBeat` `put`s `showCaption(caption)`
   then `showCaption(null)` — the field is the wired seam, the rendering is
   deferred.

## File Structure

> **Not here (Plan A/B own them):** `SceneEffect.ts`, the `show`/`hide`/`scene`/
> `focus`/`fade` constructors, `applySceneEffect.ts`, `VISIBILITY_ACTION_ROW`, the
> `syncVisibilityFades` duration override (all Plan A); `suspendDuringClip.ts` + the
> `focusTweenSaga.ts` wrap + the `endClip → cancelCameraTween` reaction (all Plan
> B). This plan imports the verbs from Plan A's `effectHelpers.ts` and relies on
> Plan B's parking — it edits none of those files.

```
src/
  @types/
    tour/
      BeatData.ts               NEW  { focus, caption, dwellSec, effects? }
  state/
    tour/
      tourActions.ts            NEW  TOUR_ADVANCE / TOUR_EXIT plain action creators
      guidedTourSaga.ts         NEW  guidedTour + visitBeat (typed-redux-saga)
      dwellDrift.ts             NEW  the perpetual dwell clip builder (ClipData, from Plan A verbs)
      flyToClip.ts              NEW  the per-beat establishing clip builder (ClipData, from Plan A verbs)
    ui/
      uiSlice.ts                MOD  add `caption` field + showCaption reducer
  store/
    effects/
      ReconcileEffects.ts       MOD  add captureScene / restoreScene closures
    rootSaga.ts                 MOD  fork guidedTour's watcher if event-launched (Task 7)
  services/
    engine/
      wiring/
        captureScene.ts         NEW  wraps captureSettings + selection.focus
        restoreScene.ts         NEW  wraps restoreSettings + updateSelectionFocus
  data/
    animation/
      flowOrbitClip.ts          NEW  the ?floworbit spike as ClipData (Task 8)
      cosmicFlowsClip.ts        NEW  the ?flowshow spike as ClipData (Task 8)
                                (flyout reused from Plan A's src/data/animation/flyoutClip.ts)
tests/  mirror every NEW/MOD src path above
```

---

## Task 1: `BeatData` type

**Files:** `src/@types/tour/BeatData.ts` (new), tests in `tests/@types/` are
unnecessary for a pure type — exercised via the saga (Task 6).

**Signature:**

```ts
// BeatData.ts
export type BeatData = {
  readonly focus: SelectionRef | null;
  readonly caption: string | null;
  readonly dwellSec: number;
  readonly effects?: readonly Action[]; // plain Redux actions — put verbatim
};
```

**Notes:**
- `SelectionRef` from `src/@types/engine/SelectionRef`; `Action` from
  `@reduxjs/toolkit`. `BeatData.focus` is a `SelectionRef` (resolved spec
  ambiguity #1 — no new `SourceRef`).
- **`SceneEffect` and `SettingsAction` are Plan A's** (`src/@types/animation/
  SceneEffect.ts`, `src/@types/settings/SettingsAction.ts`). Plan A declares them
  for its own scene vocabulary; this plan imports them where a tour clip builder
  needs a verb. Do NOT redeclare either here.

- [ ] Add `BeatData.ts` with the shape above and a didactic header (why
  `SelectionRef` not a new `SourceRef`; `effects` are `put` verbatim, no wrapper).
- [ ] `npm run typecheck` clean (the type is consumed in later tasks).
- [ ] Commit.

### Interfaces

**Consumes:** `SelectionRef`, `Action` (`@reduxjs/toolkit`).
**Produces:** `BeatData`. (`SceneEffect` + `SettingsAction` are Plan A's.)

---

> **Plan A owns the scene vocabulary; Plan B owns `suspendDuringClip`.** What used
> to be this plan's Tasks 2 (scene-verb constructors), 3 (`syncVisibilityFades`
> duration override), 4 (`applySceneEffect` + `endClip → cancelCameraTween`), and 8
> (`suspendDuringClip`) are deleted — they are Layer 1, built by Plan A/B. This plan
> CONSUMES them: its tour clip builders call Plan A's `show`/`hide`/`fade`/`scene`/
> `focus`, its in-clip `focus()` relies on Plan B's `watchFocusTween` parking, and
> its validation (Task 8) asserts the composed verb behaviour Plan A wired.

---

## Task 2: `captureScene` / `restoreScene` wiring helpers

**Files:** `src/services/engine/wiring/captureScene.ts` (new),
`src/services/engine/wiring/restoreScene.ts` (new),
`src/@types/engine/settings/SceneSnapshot.ts` (new — widens `SettingsSnapshot`
with `focus`); tests `tests/services/engine/wiring/captureScene.test.ts`,
`restoreScene.test.ts` (new).

The tour's `restore` must revert a beat's `focus()` (and its member-isolation dim),
not settings alone (spec migration note: "the snapshot adds `selection.focus`").
`captureScene`/`restoreScene` **wrap** the shipped `captureSettings`
(`captureSettings.ts:23`) / `restoreSettings` (`restoreSettings.ts:32`), widening
the snapshot.

**Signatures:**

```ts
// SceneSnapshot.ts
export type SceneSnapshot = Readonly<{
  settings: SettingsSnapshot;
  focus: SelectionRef | null;
}>;

// captureScene.ts
export function captureScene(state: Pick<EngineState, 'settings' | 'selection'>): SceneSnapshot;

// restoreScene.ts
export function restoreScene(
  state: EngineState,
  store: AppStore,
  snapshot: SceneSnapshot,
  opts: { animate: boolean },
): void;
```

**Behaviour:**
- `captureScene` = `{ settings: captureSettings(state), focus:
  state.selection.focus }`.
- `restoreScene` = `restoreSettings(state, store, snapshot.settings, opts)` THEN
  `store.dispatch(updateSelectionFocus(snapshot.focus))` (spec: "re-dispatches
  `updateSelectionFocus(snapshot.focus)`" — reverted "the same way `scene` is, not
  by a separate `put(updateSelectionFocus(null))` bolted onto the tour").
  `clipOpacity` is already reset to 1 at clip end, so transient `fade`s need no
  separate undo here.

- [ ] Test `captureScene captures the six settings clusters + selection.focus`.
- [ ] Test `captureScene is detached` — mutating live `selection.focus` after
  capture does not change the snapshot (the settings half is already detached via
  `structuredClone` in `captureSettings`; assert the focus ref isn't aliased into
  later mutation — a fresh write to the slice leaves the snapshot's `focus`).
- [ ] Test `restoreScene restores settings then re-dispatches focus` — assert the
  `mergeSnapshot` dispatch AND the `updateSelectionFocus(snapshot.focus)` dispatch
  both fire (order: settings first).
- [ ] Test `restoreScene with focus null clears selection focus`.
- [ ] Implement both wrappers + `SceneSnapshot`.
- [ ] `npm test -- captureScene restoreScene` green; `npm run typecheck` clean.
- [ ] Commit.

### Interfaces

**Consumes:** `captureSettings`, `restoreSettings`, `SettingsSnapshot`,
`updateSelectionFocus`, `SelectionRef`, `EngineState.selection`.
**Produces:** `captureScene`, `restoreScene`, `SceneSnapshot`.

---

## Task 3: Register `captureScene` / `restoreScene` on `ReconcileEffects`

**Files:** `src/store/effects/ReconcileEffects.ts` (modify), the engine
registration site that calls `setSagaContext({ reconcile: … })` (modify), tests
in the engine wiring test that builds the `ReconcileEffects` bag (modify).

The saga reaches `captureScene`/`restoreScene` through `getContext('reconcile')`
— it has no `state`/`store` in lexical scope to pass them (spec: "the engine seam
— the same bag `watchFades` reads"; `guidedTour`'s
`const fx = yield* getContext('reconcile'); fx.captureScene()`).

**Revised `ReconcileEffects`:**

```ts
export type ReconcileEffects = {
  requestRender: () => void;
  syncFades: (rows: readonly VisibilityLayerKey[]) => void;
  reseedFlow: () => void;
  bakeBias: (mode: BiasMode) => void;
  captureScene: () => SceneSnapshot;                                   // NEW
  restoreScene: (snapshot: SceneSnapshot, opts: { animate: boolean }) => void; // NEW
};
```

The two new closures **capture the live `state` + `store`** at engine
construction (where `ReconcileEffects` is built — the same place `syncFades`
closes over the engine), so the saga calls them with no args / snapshot-only.

- [ ] Test `the reconcile bag exposes captureScene/restoreScene` — extend the
  engine-wiring test that asserts the `ReconcileEffects` shape; assert
  `fx.captureScene()` returns a `SceneSnapshot` over a stub engine state, and
  `fx.restoreScene(snap, { animate })` calls through to `restoreScene`.
- [ ] Add the two fields to the type + the registration closures.
- [ ] `npm test` (touched wiring tests) green; `npm run typecheck` clean.
- [ ] Commit.

### Interfaces

**Consumes:** `captureScene`, `restoreScene`, `SceneSnapshot`, the engine's live
`state`/`store`.
**Produces:** `ReconcileEffects.captureScene`, `ReconcileEffects.restoreScene`.

---

## Task 4: `showCaption` + `ui.caption` field

**Files:** `src/state/ui/uiSlice.ts` (modify),
`src/@types/ui/UiState.ts` (modify — add `caption: string | null`),
`src/state/ui/buildInitialUiState.ts` (modify — default `null`),
tests `tests/state/ui/uiSlice.test.ts` (modify).

`visitBeat` does `yield* put(showCaption(beat.caption))` then
`put(showCaption(null))`. The caption is a one-off string addressable from the
store; the shipped `ui` slice (`uiSlice.ts`) is its home (it already owns
`uiHidden`, which the tour also drives via `setUiHidden`).

**Signature:** `showCaption: (state, action: PayloadAction<string | null>) => void`
setting `state.caption = action.payload`.

- [ ] Test `showCaption sets ui.caption` — dispatch `showCaption('Virgo')`,
  assert `ui.caption === 'Virgo'`; `showCaption(null)` clears it.
- [ ] Add the `caption` field (init `null`) + the reducer; export `showCaption`.
- [ ] `npm test -- uiSlice` green; `npm run typecheck` clean.
- [ ] Commit.

### Interfaces

**Consumes:** `UiState`.
**Produces:** `showCaption` action, `ui.caption` field.

---

## Task 5: `TOUR_ADVANCE` / `TOUR_EXIT` actions + `dwellDrift` / `flyToClip` builders

> **`suspendDuringClip` is Plan B's — not a task here.** While a clip owns the
> camera @95, a `focus()` cue plants no `camera.tween` because Plan B parks
> `watchFocusTween` via `suspendDuringClip` (keyed on `selectClipActive`, true for
> any clip — Layer 1, not tour-specific) and Plan B's `endClip → cancelCameraTween`
> reaction clears any tween planted before the clip. This plan's in-clip `focus()`
> (Task 6) RELIES on that parking but builds none of it.

**Files:** `src/state/tour/tourActions.ts` (new),
`src/state/tour/dwellDrift.ts` (new), `src/state/tour/flyToClip.ts` (new),
tests `tests/state/tour/dwellDrift.test.ts`, `flyToClip.test.ts` (new).

**Control actions** (plain creators — they are `take`-targets, carry no payload):

```ts
export const TOUR_ADVANCE = createAction('tour/advance');
export const TOUR_EXIT = createAction('tour/exit');
```

**`dwellDrift`** — the perpetual dwell clip (spec dwellDrift block): a slow loop
orbit + bob that NEVER completes (so it always loses the `race`). Returns a
`ClipData` (Plan A's type) built from the `oscillate`/`spin`/`fork` Layer-1
constructors (Plan A):

```ts
export function dwellDrift(beat: BeatData): ClipData; // start: 'live', fork(oscillate) + spin loop
```

**`flyToClip`** — the per-beat establishing clip (spec `playClip(flyToClip(beat))`).
Resolves the beat's focus target to its world pose + framing distance (via the same
resolver the focus tween uses — `resolveDeps` / `extractSelectionRow`,
`focusTweenSaga.ts:32`) and builds a `start: 'live'` `moveTarget` + `dollyTo` clip:

```ts
export function flyToClip(beat: BeatData, resolved: ResolvedFocus): ClipData;
```

> **Resolver seam.** `flyToClip` needs the focus target's world pose + framing
> distance. Rather than reach into engine state, take a pre-resolved
> `ResolvedFocus` ({ worldPos, focusMpc }) arg — `visitBeat` resolves it via the
> saga's `resolveDeps` context before calling (mirrors `webShowcaseClip`'s
> `resolveStructure`/`resolveFamous` in the spec). A `null` focus → a no-move clip
> (hold only).

- [ ] Test `dwellDrift builds a perpetual loop clip` — assert the `spin` is
  `loop: true` and the clip has no finite-duration awaited child (it loses the
  race by construction).
- [ ] Test `dwellDrift starts live`.
- [ ] Test `flyToClip builds a moveTarget + dollyTo to the resolved pose`.
- [ ] Test `flyToClip with null focus is a hold-only clip`.
- [ ] Implement the actions + both builders using Plan A's Layer-1 constructors.
- [ ] `npm test -- dwellDrift flyToClip` green; `npm run typecheck` clean.
- [ ] Commit.

### Interfaces

**Consumes:** `ClipData`, `oscillate`/`spin`/`fork`/`moveTarget`/`dollyTo`/`hold`
(Plan A constructors), `BeatData`, `ResolvedFocus`.
**Produces:** `TOUR_ADVANCE`, `TOUR_EXIT`, `dwellDrift`, `flyToClip`.

---

## Task 6: `visitBeat` saga

**Files:** `src/state/tour/guidedTourSaga.ts` (new — `visitBeat` lives here beside
`guidedTour`), tests `tests/state/tour/guidedTourSaga.test.ts` (new).

A beat is **one clip per stop**: wait for data → awaited establishing fly →
per-beat intents → caption → interactive dwell (never frozen) → clear caption
(spec `visitBeat` block).

**Signature:** `function* visitBeat(beat: BeatData): Generator;`

**Body (contract — implement from the spec block lines 795-806):**
1. `yield* call(waitUntil, () => focusReady(beat.focus))` — reactive load-wait.
2. `yield* call(playClip, flyToClip(beat, resolved))` — establishing move,
   **awaited** (a click mid-flight does NOT cut it).
3. `for (const e of beat.effects ?? []) yield* put(e)` — plain actions, verbatim,
   NO wrapper.
4. `yield* put(showCaption(beat.caption))`.
5. `yield* race({ timeout: delay(beat.dwellSec*1000), next: take(TOUR_ADVANCE),
   drift: call(playClip, dwellDrift(beat)) })` — the dwell; the perpetual
   `dwellDrift` always loses → cancelled through `[CANCEL] → clipPlayer.stop()`.
6. `yield* put(showCaption(null))`.

> `waitUntil` + `focusReady` are reactive helpers. If Plan B / the codebase
> already has a `waitUntil(predicate)` saga helper, reuse it; otherwise add a tiny
> `src/state/tour/waitUntil.ts` (`function* waitUntil(pred): polls via take of a
> tick action OR a `delay`-based poll`) — match whatever load-wait primitive Plan
> B introduced for `famousHopTour`. `focusReady(ref)` checks the focus target's
> data is loaded (resolve via `resolveDeps`); a `null` focus is trivially ready.

- [ ] Test `visitBeat waits for focus data before flying` — `focusReady` false
  then true; assert `playClip` not called until ready.
- [ ] Test `visitBeat awaits the fly clip before arming advance` — assert the
  establishing `playClip` resolves before `take(TOUR_ADVANCE)` is listened for.
- [ ] Test `visitBeat puts each effect verbatim (no wrapper)` — `effects: [setFlow(…)]`
  → assert `setFlow(…)` dispatched as-is.
- [ ] Test `visitBeat puts showCaption then clears it`.
- [ ] Test `TOUR_ADVANCE wins the dwell race and cancels dwellDrift` — the
  perpetual drift clip's `[CANCEL]` (→ `clipPlayer.stop()`) fires.
- [ ] Test `the dwell timeout auto-advances when no click arrives`.
- [ ] Implement `visitBeat` (typed-redux-saga; `getContext` inside for
  `resolveDeps`/`reconcile` as needed).
- [ ] `npm test -- guidedTourSaga` green; `npm run typecheck` clean.
- [ ] Commit.

### Interfaces

**Consumes:** `playClip` (Plan B), `flyToClip` / `dwellDrift` (Task 5),
`showCaption` (Task 4), `TOUR_ADVANCE` (Task 5), `waitUntil` / `focusReady`,
`BeatData`, `resolveDeps` context.
**Produces:** `visitBeat`.

---

## Task 7: `guidedTour` saga — snapshot, beat loop, exit race, finally-restore

**Files:** `src/state/tour/guidedTourSaga.ts` (modify — add `guidedTour`), tests
`tests/state/tour/guidedTourSaga.test.ts` (modify).

The tour spine (spec `guidedTour` block, lines 808-821): capture the scene, hide
UI, race the beat loop against an explicit exit, and ALWAYS restore in a `finally`.

**Signature:** `function* guidedTour(beats: readonly BeatData[]): Generator;`

**Body (contract):**
1. `const fx = yield* getContext<ReconcileEffects>('reconcile')` — the engine seam
   (read INSIDE, per `watchFocusTween`).
2. `const snapshot = fx.captureScene()` — six clusters + `selection.focus`.
3. `yield* put(setUiHidden(true))`.
4. `try { yield* race({ run: call(loop over beats → visitBeat), exit:
   take(TOUR_EXIT) }); }` — `TOUR_EXIT` cancels the `run` arm; cancellation
   propagates into the in-flight clip via `[CANCEL] → clipPlayer.stop()`.
5. `finally { fx.restoreScene(snapshot, { animate: true }); yield* put(setUiHidden(false)); }`
   — restore runs on natural completion AND on mid-beat exit.

**Why a saga, not data (spec):** the `try/finally` gives guaranteed
settings+focus restore on abort for free — the one thing a pure-data sequencer
couldn't.

> **No camera-input self-abort.** The tour stops ONLY on `TOUR_EXIT` (spec
> "Cancellation and teardown" — inferring abort from camera input self-aborts
> every beat via the tour's own commit-on-edge). A stray drag is swallowed by the
> clip@95 priority. Do NOT add a camera-input `take`.

**Launch wiring.** Decide how `guidedTour` is started:
- The spec migration note says `engine.tour.start(beats): Promise<void>` survives
  — the saga's run resolves the promise. The cleanest fit with the saga runtime
  is a `take(TOUR_START)` watcher forked in `rootSaga` (Task: add `TOUR_START`
  action to `tourActions.ts`, fork `watchTour` in `rootSaga.ts:40-50`). The
  `engine.tour.start` handle dispatches `TOUR_START({ beats })` and returns a
  promise resolved when the saga's run completes (mirror how `fades.fadeTo`
  returns a promise). Confirm the exact handle shape against Plan A/B's
  `engine.tour` if they touched it; otherwise add `watchTour` here.

- [ ] Test `guidedTour captures the scene before the first beat`.
- [ ] Test `guidedTour hides the UI for the duration and restores it after`.
- [ ] Test `guidedTour runs every beat in order` — two beats → two `visitBeat`
  passes.
- [ ] Test `TOUR_EXIT cancels mid-beat and the finally restores the scene` —
  assert `fx.restoreScene(snapshot, { animate: true })` is called AND
  `setUiHidden(false)` dispatched, even when exit fires during beat 1.
- [ ] Test `natural completion restores the scene` (the `finally` runs on the
  non-exit path too).
- [ ] Test `no camera-input action aborts the tour` — a `beginDrag` /
  `commitCameraPose` during a beat does NOT end the run.
- [ ] Implement `guidedTour` + the launch watcher (`watchTour`) + `TOUR_START`,
  fork `watchTour` in `rootSaga.ts`.
- [ ] `npm test -- guidedTourSaga rootSaga` green; `npm run typecheck` clean.
- [ ] Commit.

### Interfaces

**Consumes:** `visitBeat` (Task 6), `ReconcileEffects.captureScene/restoreScene`
(Task 3), `setUiHidden` (`uiSlice.ts:51`), `TOUR_EXIT` / `TOUR_START` (Task 5),
`getContext('reconcile')`, `race`/`take`/`call`/`put` (typed-redux-saga).
**Produces:** `guidedTour`, `watchTour`, `TOUR_START`, the `rootSaga` fork.

---

## Task 8: Validation — re-express ALL THREE current spikes as clips + an end-to-end tour test

**Why all three (not one):** the three throwaway `CameraDriver` spikes
(`docs/research/2026-06-19-camera-animation-spike-findings.md`) are the real
acceptance bar for "is Layer 1 expressive enough." Re-expressing only one would
leave the model's coverage unproven for the motion shapes the others exercise. The
three current spikes are `flyoutDriver` / `flowOrbitDriver` / `flowShowcaseDriver`;
re-expressed as clips they validate **distinct** capabilities of the A+B+C stack,
so all three land here (`webShowcase` + `famousHop` are aspirational spec examples,
NOT current spikes — leave them out). `flyout` is already a clip from **Plan A Task
13** (`src/data/animation/flyoutClip.ts`); this task REUSES it (does not redeclare)
and adds the other two.

**Files:**
- `src/data/animation/flowOrbitClip.ts` (new) — the `?floworbit` spike as data.
- `src/data/animation/cosmicFlowsClip.ts` (new) — the `?flowshow` spike (the spec's
  `cosmicFlows`, lines 261-283) as data.
- `tests/data/animation/flowOrbitClip.test.ts` (new),
  `tests/data/animation/cosmicFlowsClip.test.ts` (new),
- `tests/state/tour/tour.integration.test.ts` (new) — the end-to-end tour + the
  three-spike playback assertions.

Keep clip data in `src/data/animation/` to match Plan A's `flyoutClip.ts` (NOT
`src/clips/`). Each clip is built from Plan A's scene verbs + camera constructors;
this task READS the composed alpha (`clipPlayer.clipOpacityOf` / `resolveLayerOpacity`)
— it does not build the channel (Plan A owns it).

### The three spikes, and the distinct capability each proves

| Spike → clip | Motion shape it proves | Key assertions |
| --- | --- | --- |
| `flyout` (Plan A Task 13, REUSED) | log-space dolly + base-layer yaw, played through the `playClip` seam (Plan B) | `playClip(flyout)` resolves on clip end; commit-on-edge bakes the saturated final pose into `camera.base` |
| `flowOrbit` (new) | a perpetual base `spin` + a **`fork`ed `oscillate`** pitch-bob — proves vel/osc layering and the never-completing loop | compiles with NO single-writer clash (`yaw` base vs `pitch` osc are distinct layers); `evaluateClip` yaw advances monotonically while `pitch` oscillates zero-mean; the fork does NOT extend `durationSec` |
| `cosmicFlows` (new) | the full **scene choreography** — `hide(…,0)`, the `fade(['flow'],0,0)` load-but-don't-show mask, `scene(setFlow({enabled:true}))`, the crossfade `all([fade(['flow'],1,3), fade(['galaxies'],0,3)])`, the per-layer fade-to-black | the three composed-alpha properties below |

**`flowOrbit` clip shape** (spec lines 246-257, the `?floworbit` driver — "seamless
orbit with a gentle pitch-sine bob"):

```ts
export const flowOrbit: ClipData = {
  start: 'live',
  timeline: [
    fork(oscillate('pitch', { amp: 0.04, period: 14 })),   // the gentle bob — additive, perpetual
    spin('yaw', { by: TWO_PI, over: 90, loop: true }),     // very slow orbit — never completes
  ],
};
```

**`cosmicFlows` composed-alpha assertions (the load-bearing properties):**
- The `fade(['flow'], 0, 0)` mask drives `clipOpacity(flow) → 0` while
  `scene(setFlow({ enabled: true }))` brings `intentOpacity(flow) → 1` behind it —
  assert composed `resolveLayerOpacity` for flow stays 0 during the mask, then
  rises with the `fade(['flow'], 1, 3)` lift ("load but don't show").
- The crossfade moves `clipOpacity(galaxies) → 0` while `intentOpacity(galaxies)`
  stays 1 (galaxies stay LOADED) — assert intent untouched, composed alpha dims.
- After `endClip`, `clipOpacity` resets to 1 and composed alpha returns to
  `intentOpacity × focusRecession` (spec "Clip end — no opacity reconcile").

> **Layer names — use the real `VisibilityLayerKey`s, do NOT add composite
> aliases.** The spec's `cosmicFlows` worked example uses friendly composite names
> (`'galaxies'`, `'volumes'`, `'milkyWay'`, `'structures'`, `'labels'`,
> `'famousGalaxyLabels'`) that are NOT `VisibilityLayerKey` members. When
> re-expressing, map each to the real keys and **enumerate** (the spike findings
> are explicit: "no global fade, everything together, per layer"):
> `galaxies → 'survey'`, `volumes → 'volumesMaster'`, `milkyWay → 'milkyWayDisk'
> (+ 'milkyWayLabel')`, `structures → 'structureRing' (+ 'structureLabel')`,
> `labels → 'surveyLabel' + 'milkyWayLabel' + 'structureLabel'`,
> `famousGalaxyLabels → 'surveyLabel'`. Do NOT widen `VisibilityLayerKey` with
> composite aliases — that would re-fuse the intents it deliberately splits.

- [ ] Re-express `flowOrbit` as `ClipData`; test `flowOrbit compiles with no
  single-writer clash` and `evaluateClip advances yaw monotonically while pitch
  oscillates zero-mean; the fork does not extend durationSec`.
- [ ] Re-express `cosmicFlows` as `ClipData`; test `the clip type-checks and carries
  the expected cue sequence` (hide → mask → enable → crossfade → fade-to-black).
- [ ] Integration test `playClip resolves for each of the three spikes` — `flyout`,
  `flowOrbit` (drive it past several loops then `stop()`), `cosmicFlows` each play
  through the runner without throwing; the camera is owned by `clip`@95 throughout.
- [ ] Integration test `the flow mask keeps composed alpha at 0 until the lift` (cosmicFlows).
- [ ] Integration test `the crossfade dims galaxies without touching intent` (cosmicFlows).
- [ ] Integration test `clip end restores composed alpha to the steady state` (cosmicFlows).
- [ ] `npm test` (whole suite) green; `npm run typecheck` clean; `npm run build`.
- [ ] Commit.

### Interfaces

**Consumes:** Plan A's scene verbs + `fade()` primitive + `oscillate`/`spin`/`fork`
camera constructors + `clipPlayer.clipOpacityOf` + `resolveLayerOpacity` (read-only,
for the assertions), Plan A's `flyout` clip (reused), Plan A/B `playClip` + the
`clip`@95 driver.
**Produces:** the `flowOrbit` + `cosmicFlows` validation clips + the end-to-end tour
and three-spike playback assertions. (`flyout` is reused, not produced here.)

---

## Definition of Done

- [ ] All new tests green; whole suite (`npm test`) green; `npm run typecheck`
  clean; `npm run build` clean.
- [ ] `final alpha = intentOpacity × focusRecession × clipOpacity` (Plan A's
  renderer composition) is verified by the Task 8 integration tests — this plan
  READS the composed alpha, does not build it.
- [ ] The scene verbs behave as Plan A built them — `fade()` moves `clipOpacity`
  ONLY (never intent); `show`/`hide` ride the live bridge; `scene`/`focus` dispatch
  the production action surface — verified read-only by the Task 8 validation.
- [ ] `BeatData.effects` are `put` verbatim — no `applyIntent`/`applyEffect` wrapper.
- [ ] The tour stops ONLY on `TOUR_EXIT` (no camera-input self-abort); the `finally`
  always runs `restoreScene` (settings + focus) and un-hides the UI.
- [ ] `captureScene`/`restoreScene` are `getContext('reconcile')` closures; the saga
  passes no `state`/`store`.
- [ ] This plan adds NO `clipOpacity` channel, NO `resolveLayerOpacity` change, NO
  `SceneEffect` type, NO scene-verb constructor, NO `applySceneEffect`, NO
  `syncVisibilityFades` duration override (all Plan A's), and NO `suspendDuringClip`
  or `endClip → cancelCameraTween` reaction (Plan B's) — verify none leaked back in.
- [ ] Run the `entanglement-radar` skill over the diff — confirm the tour clip
  builders compose Plan A's verbs (no re-minted constructor) and `BeatData.effects`
  are `put` verbatim (no wrapper).
- [ ] PR (squash-merge) with the spec linked; relocate this plan via `/feature-done`.

## Self-review (run before handing off)

**Spec coverage** — every Layer-2 item in the Plan-C scope is a task: `BeatData`
(T1), `captureScene`/`restoreScene` (T2) on `ReconcileEffects` (T3), `showCaption`/
`ui.caption` (T4), `TOUR_ADVANCE`/`TOUR_EXIT` + the tour clip builders
`flyToClip`/`dwellDrift` (T5), `visitBeat` (T6), `guidedTour` (T7), and the
validation re-expressing ALL THREE current spikes — `flyout` (reused) / `flowOrbit`
/ `cosmicFlows` (T8). The scene vocabulary (`SceneEffect`, the five constructors, `applySceneEffect`,
the `show`/`hide` duration override) is Plan A's; `suspendDuringClip` + the
`endClip → cancelCameraTween` reaction are Plan B's; the `clipOpacity` channel +
renderer composition are Plan A's — none are tasks here. ✓

**Cross-plan contract** — every Plan-A/B symbol used (`ClipData`, `evaluateClip`,
`playClip`, `clip`@95, `clipPlayer`, `clipPlayer.clipOpacityOf`, the scene verbs +
`SceneEffect` + `applySceneEffect`, `startClip`/`endClip`, `selectClipActive`,
`suspendDuringClip`) is consumed, never redefined. The scene vocabulary is Plan A's
in full and `suspendDuringClip` is Plan B's; this plan reads
`clipPlayer.clipOpacityOf` (in the T8 validation), CALLS the verbs in its clip
builders, and RELIES on the parking — it constructs none of it. ✓

**Resolved ambiguities surfaced** — `SourceRef → SelectionRef`, the scene
vocabulary + `clipOpacity` owned by Plan A (read here via `clipPlayer.clipOpacityOf`
+ the imported verbs), `suspendDuringClip` owned by Plan B, and the
`showCaption → ui.caption` home are all stated up front and threaded into the
tasks. (`SettingsAction`, not `AnyAction`, is Plan A's typing decision — consumed
where a tour clip's `scene()` needs it.) ✓

**No placeholders / no full bodies** — every code block is a signature, a
type shape, or a tiny before/after; bodies are deferred to the implementer with
cited `path:line` anchors. ✓
