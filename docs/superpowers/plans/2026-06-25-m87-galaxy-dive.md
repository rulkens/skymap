# M87 galaxy dive — durable focus-id clips for tours

**Spec:** `docs/superpowers/specs/2026-06-25-m87-galaxy-dive-design.md`
**Builds on:** branch `animation-clip-tour-registries` (PR #373) — partially-reshaped
WIP (`BeatData`, `Tour.setup`, `flyToClip`, `webShowcase`). Several tasks *finish or
correct* a WIP file rather than create it; that is called out where it applies.

## Goal

Make tour beats carry **clips authored over durable branded `FocusId` handles**, and
express the M87 dive as **clip composition**: beat 2 `flyAndFocusOnClip('cluster-virgo-m87')`
sets the persistent selection focus to Virgo; beat 3 `flyToClip('m87')` moves only the
camera, so Virgo's focus persists and M87 (a member) stays bright under the isolation
dim. No per-beat `frame`/`focus`/`effects` fields.

## Architecture

The locked design (do not redesign — these tasks turn it into code):

- **`FocusId`** is a branded string (`'m87'`, `'cluster-virgo-m87'`, `'milkyWay'`, …) —
  exactly what `resolveFocusId(raw: string, deps)` already consumes. The brand earns
  its keep only at the authoring surface (`flyToClip(focusId('m87'))` type-checks;
  `flyToClip('m87')` is a compile error).
- **Id-bearing timeline effects** (`moveTargetId` / `dollyToId` / `focusId`) are static
  data baked into tour clips at module load. They cannot be compiled directly.
- A **play-time resolve pass** (`resolveClipFoci`) in `visitBeatSaga` rewrites the
  id-bearing effects into concrete `moveTarget` (`setVec`) / `dollyTo` (`set`) /
  `focus(ref)` (`SceneEffect kind:'focus'`) BEFORE `playClip`. This mirrors the
  existing `'live'`-start seam (`resolveClipStart`, `cameraSlice.ts:148`), keeping
  `compileClip` / `evaluateClip` / `clipPlayer` id-free.
- **Resolution chain per id:** `resolveFocusId(id, deps)` → `extractSelectionRow(ref, deps)`
  → `focusFraming(row, fovYRad)`. (`extractSelectionRow.ts`, `focusFraming.ts`.)
- A **readiness gate** (`clipFociReady`) replaces `focusReady`: `visitBeatSaga` waits
  until every referenced id resolves AND `cameraRuntime() !== null`, which guarantees
  the resolve pass can frame every id.

### Correctness notes to embed (prose, not extra mechanism)

- **The in-clip `focus()` cue is what makes the dive work.** It fires WHILE the clip
  owns the camera at driver-priority 95, so `suspendDuringClip` (`suspendDuringClip.ts`)
  parks `watchFocusTweenSaga` (no competing tween yanks the camera off M87) while
  `watchSelectionRowsSaga` still raises the isolation dim. This is the path the
  webShowcase spike used; the suspend guard's docblock already describes it.
- **Focus is persistent tour state across beats.** `flyAndFocusOnClip` sets it (a
  `focus(id)` cue), `flyToClip` leaves it untouched (no focus cue), `focus(null)`
  clears it. Beat 3's dive depends on beat 2's focus persisting.
- **`resolveClipFoci` MUST run before `compileClip`.** `compileClip` (after this plan)
  throws on the three id-bearing kinds. The readiness gate guarantees the pass can
  resolve every id before `playClip` dispatches `clipStarted`.

## Tech stack

TS, redux-toolkit + typed-redux-saga, Vitest. No new deps. Conventions (CLAUDE.md):
one symbol per file in `src/@types/` and `src/utils/`; `type` not `interface`; deep
relative imports, no barrels; didactic timeless comments.

## Global constraints

- **Branded type, plain consumer.** `resolveFocusId` keeps its `string` parameter; a
  `FocusId` is assignable to `string`, and the `#focus=` URL path still passes raw
  strings. Do NOT brand `resolveFocusId`'s parameter.
- **One symbol per file** for `FocusId`, `focusId`, `FocusBoundEffect`, `TourSetup`,
  `resolveClipFoci`, `clipFociReady`, `flyToClip`, `flyAndFocusOnClip`,
  `collectFocusIds` (if extracted). `effectHelpers.ts` is the one named exception —
  the new helpers join that vocabulary module.
- **Suite stays green.** Each task ends with the named tests passing; the final task
  gates on the full `npm run typecheck` + `npm test`.
- This feature is **not verifiable in automated tests** end-to-end — the dive is a
  visual property. The integration test asserts the state invariants (focus persists,
  no tween planted); the user confirms the dive on screen.

---

## Task 1 — `FocusId` branded type + `focusId` constructor

**Files:** `src/@types/animation/FocusId.ts` (new), `src/utils/animation/focusId.ts` (new),
`tests/utils/animation/focusId.test.ts` (new).

**Type:** `export type FocusId = string & { readonly __focusId: unique symbol };`
**Signature:** `focusId(raw: string): FocusId` — brands via cast.

- [ ] Add `FocusId.ts` with a didactic docblock: brand earns its keep only at the
  authoring surface; assignable-to-string so `resolveFocusId` stays plain.
- [ ] Add `focusId.ts` — single function, file named for it.
- [ ] Test `focusId returns a value assignable to string` — assign `focusId('m87')` to a
  `string` const and assert `=== 'm87'` (the round-trip is identity).
- [ ] `npm test -- focusId` → green. Commit.

## Task 2 — `resolveFocusId` learns `'milkyWay'`

**Files:** `src/services/url/resolveFocusId.ts` (modify), `tests/services/url/resolveFocusId.test.ts` (modify).

Today `'milkyWay'` falls through to the famous `[a-z0-9_-]+` scan (`resolveFocusId.ts:106`)
and returns null. Add an explicit branch returning the `SelectionRef` `{ type: 'milkyWay' }`
placed **before** the famous fallback (and before the structure loop is fine too — it is a
literal-equality check, no prefix ambiguity).

**Before/after (one added branch, before the famous fallback at line ~106):**
```ts
if (focusId === 'milkyWay') return { type: 'milkyWay' };
// … existing famous fallback …
```

- [ ] Add the branch with a one-line comment (literal singleton; would otherwise scan
  famousMeta and miss).
- [ ] Test `resolveFocusId('milkyWay', deps) returns the milkyWay ref` asserting
  `{ type: 'milkyWay' }`.
- [ ] Note in the test/docblock that the inverse `focusIdOf` stays null for milkyWay —
  out of scope (spec "Out of scope").
- [ ] `npm test -- resolveFocusId` → green. Commit.

## Task 3 — `FocusBoundEffect` type + id-bearing helpers + `compileClip` throw

**Files:** `src/@types/animation/FocusBoundEffect.ts` (new),
`src/@types/animation/Effect.d.ts` (modify),
`src/services/engine/animation/effectHelpers.ts` (modify),
`src/services/engine/animation/compileClip.ts` (modify),
`tests/services/engine/animation/effectHelpers.test.ts` (modify or add),
`tests/services/engine/animation/compileClip.test.ts` (modify).

**Type (new file):**
```ts
export type FocusBoundEffect =
  | { readonly kind: 'moveTargetId'; readonly id: FocusId; readonly over: number; readonly ease: Ease }
  | { readonly kind: 'dollyToId';    readonly id: FocusId; readonly over: number; readonly ease: Ease }
  | { readonly kind: 'focusId';      readonly id: FocusId | null };
```

**`Effect`** (`Effect.d.ts:53-60`): union `FocusBoundEffect` into `Effect` alongside
`CameraAction | SceneEffect | …structural nodes`.

**Helper signatures** (`effectHelpers.ts`):
```ts
export function moveTargetId(id: FocusId, over: number, ease?: Ease): FocusBoundEffect & { kind: 'moveTargetId' };
export function dollyToId(id: FocusId, over: number, ease?: Ease): FocusBoundEffect & { kind: 'dollyToId' };
export function focus(id: FocusId | null): FocusBoundEffect & { kind: 'focusId' }; // CHANGED from focus(ref: SelectionRef|null)
```

- [ ] Add `moveTargetId` / `dollyToId` (default `ease: 'inOut'`, matching `moveTarget`/`dollyTo`).
- [ ] **Change** the existing `focus()` (`effectHelpers.ts:324`) from
  `focus(ref: SelectionRef | null): SceneEffect & { kind: 'focus' }` to
  `focus(id: FocusId | null): FocusBoundEffect & { kind: 'focusId' }`. It has NO other
  callers — verify with a grep for `focus(` across `src`/`tests` (excluding `focusFraming`,
  `focusReady`, `updateSelectionFocus`, `.focus(`) before editing; if a caller surfaces,
  STOP and report rather than hacking. The drift docblock should note the `focusId` cue is
  resolved to a `SceneEffect kind:'focus'` (carrying `ref`) by `resolveClipFoci` at play time.
- [ ] **Keep** the `SceneEffect` `kind:'focus'` arm (`SceneEffect.ts:77-80`) — it is the
  RESOLVED form the pass produces; do not delete it.
- [ ] **`compileClip`**: its exhaustive `walk` switch (`compileClip.ts:95-213`) must THROW on
  the three id-bearing kinds with a clear message, e.g.
  `resolveClipFoci must run before compileClip (unresolved <kind>)`. The existing
  `default: never` guard stays for true exhaustiveness; add explicit `moveTargetId` /
  `dollyToId` / `focusId` cases that throw (so the `never` narrowing still holds).
- [ ] Tests (`effectHelpers.test.ts`):
  - `moveTargetId carries the id and defaults ease to inOut`
  - `dollyToId carries the id and defaults ease to inOut`
  - `focus(id) builds a focusId effect carrying the id`
  - `focus(null) builds a focusId effect with id null`
- [ ] Test (`compileClip.test.ts`): `compileClip throws on an unresolved focus-bound effect`
  — build a `ClipData` whose timeline contains `moveTargetId(focusId('m87'), 5)` and assert
  the throw message mentions `resolveClipFoci`.
- [ ] `npm test -- effectHelpers compileClip` → green. Commit.

## Task 4 — `resolveClipFoci` (+ optional `collectFocusIds`)

**Files:** `src/services/engine/animation/resolveClipFoci.ts` (new),
`src/services/engine/animation/collectFocusIds.ts` (new, OPTIONAL — see DRY note),
`tests/services/engine/animation/resolveClipFoci.test.ts` (new).

**Signature:** `resolveClipFoci(data: ClipData, deps: ResolveDeps, fovYRad: number): ClipData`

Walks the timeline (recurse into `seq.children` / `all.children` / `fork.child`; pass
through `hold` / `wait` / camera leaves / `SceneEffect`s unchanged), replacing each
id-bearing effect:

| id-bearing input | resolved output | builder |
| --- | --- | --- |
| `moveTargetId(id, over, ease)` | `moveTarget(focusFraming(row, fovYRad).target, over, ease)` → `setVec ch:'target'` | `moveTarget` |
| `dollyToId(id, over, ease)` | `dollyTo(focusFraming(row, fovYRad).distance, over, ease)` → `set ch:'distance'` | `dollyTo` |
| `focusId(id)` | `{ kind: 'focus', ref }` where `ref = id === null ? null : resolveFocusId(id, deps)` | raw `SceneEffect` (no helper — `focus()` now builds `focusId`) |

Resolution chain per non-null id: `resolveFocusId(id, deps)` → `extractSelectionRow(ref, deps)`
→ `focusFraming(row, fovYRad)`. Mirror `resolveClipStart` (`cameraSlice.ts:148`) in spirit —
a pure rewrite over plain data, no engine handles beyond `deps`/`fovYRad`.

The readiness gate (Task 5) guarantees every id resolves before this runs, so a null at the
`resolveFocusId`/`extractSelectionRow` step here is a programmer error — throw with a clear
message rather than silently dropping the cue.

**DRY note (do not force):** the timeline walk is shared with `clipFociReady` (Task 5). If a
clean `collectFocusIds(data: ClipData): FocusId[]` helper falls out (gather every
`moveTargetId`/`dollyToId`/non-null `focusId` id by one walk), extract it to
`collectFocusIds.ts` and have `clipFociReady` consume it. If the two walks differ enough
(rewrite vs predicate) that sharing adds indirection, keep them separate — note which you chose.

- [ ] Implement `resolveClipFoci` (recursive rewrite; reuse `moveTarget`/`dollyTo` from
  `effectHelpers.ts`; the `focus` cue is a raw `{ kind:'focus', ref }` `SceneEffect`).
- [ ] Test `resolveClipFoci rewrites moveTargetId/dollyToId to concrete camera actions` —
  a `flyToClip('m87')`-shaped clip (an `all([moveTargetId, dollyToId])`) resolves to
  `setVec ch:'target'` + `set ch:'distance'` with the framed target/distance from a stub
  `focusFraming` input (use immediateDeps + a known structure/galaxy row).
- [ ] Test `resolveClipFoci rewrites a focusId cue to a focus ref cue` — a `focusId(id)`
  resolves to `{ kind:'focus', ref: <resolved SelectionRef> }`.
- [ ] Test `resolveClipFoci resolves focusId(null) to focus(null)` — `{ kind:'focus', ref: null }`.
- [ ] Test `resolveClipFoci recurses into seq/all/fork` — an id-bearing effect nested under
  `all`/`seq`/`fork` is rewritten in place.
- [ ] `npm test -- resolveClipFoci` → green. Commit.

## Task 5 — `clipFociReady` (replaces `focusReady`)

**Files:** `src/state/tour/clipFociReady.ts` (new),
`tests/state/tour/clipFociReady.test.ts` (new).
(`focusReady.ts` deletion is deferred to Task 9.)

**Signature:** `clipFociReady(data: ClipData, deps: ResolveDeps): boolean`

Walks the timeline; returns `false` if any `moveTargetId` / `dollyToId` / **non-null**
`focusId` id fails `resolveFocusId(id, deps)` (returns null). A `focusId(null)` cue is
ready (it clears focus — no data needed). A clip with no id-bearing effects is ready.

Share `collectFocusIds` with Task 4 if extracted; otherwise mirror the same walk.

- [ ] Implement the predicate.
- [ ] Test `clipFociReady is false when a famous id is not yet loaded` — `flyToClip('m87')`-shaped
  clip against deps whose `catalogs.get` / `famousMeta` make `'m87'` unresolvable → false.
- [ ] Test `clipFociReady is true for a structure id` — `cluster-virgo-m87` against immediateDeps
  (structures.byId returns a record) → true.
- [ ] Test `clipFociReady is true for milkyWay` — `flyToClip(focusId('milkyWay'))` → true
  (depends on Task 2's branch).
- [ ] Test `clipFociReady is true for a clip with no focus-bound effects` (e.g. a hold-only clip).
- [ ] Test `clipFociReady is true for focusId(null)`.
- [ ] `npm test -- clipFociReady` → green. Commit.

## Task 6 — Clip builders: finish `flyToClip`, add `flyAndFocusOnClip`

**Files:** `src/state/tour/flyToClip.ts` (correct WIP),
`src/state/tour/flyAndFocusOnClip.ts` (new),
`tests/state/tour/flyToClip.test.ts` (new/modify),
`tests/state/tour/flyAndFocusOnClip.test.ts` (new).

The WIP `flyToClip.ts` already has the right shape but is missing imports for `FocusId`,
`moveTargetId`, `dollyToId` (its docblock still describes the OLD pre-resolved-pose design).
Correct it.

**Signatures:**
```ts
export function flyToClip(id: FocusId): ClipData;          // start:'live'; timeline:[ all([moveTargetId(id, FLY_SEC,'inOut'), dollyToId(id, FLY_SEC,'inOut')]) ]
export function flyAndFocusOnClip(id: FocusId): ClipData;  // same timeline, LED by focus(id)
```
`FLY_SEC = 5` stays (`flyToClip.ts:27`).

- [ ] Correct `flyToClip.ts`: import `FocusId`, `moveTargetId`, `dollyToId`, `all`; rewrite the
  docblock to describe id-bearing authoring (resolved by `resolveClipFoci` at play time);
  no pre-resolved-pose / `ResolvedFocus` language.
- [ ] Add `flyAndFocusOnClip.ts`: `timeline: [ focus(id), all([moveTargetId, dollyToId]) ]`.
- [ ] Test (`flyToClip.test.ts`) `flyToClip has no focus cue and is live-start` — assert the
  timeline contains an `all` of `moveTargetId`+`dollyToId` and NO `focusId` effect.
- [ ] Test (`flyAndFocusOnClip.test.ts`) `flyAndFocusOnClip leads with a focusId cue` — the
  first timeline entry is `{ kind:'focusId', id }`.
- [ ] `npm test -- flyToClip flyAndFocusOnClip` → green. Commit.

## Task 7 — `BeatData` confirm + `visitBeatSaga` rewrite

**Files:** `src/@types/animation/tour/BeatData.ts` (confirm/finish),
`src/state/tour/visitBeatSaga.ts` (rewrite),
`tests/state/tour/visitBeatSaga.test.ts` (rewrite).

**`BeatData`** (already reshaped in WIP — confirm it is exactly):
```ts
export type BeatData = { readonly caption: string | null; readonly dwellSec: number; readonly clip: ClipData };
```
(No `focus` / `effects` / `frame`.) The WIP docblock at `BeatData.ts:3-22` still describes the
OLD `focus`/`effects` shape — rewrite it to "a caption, a dwell, and a clip; focus lives inside
the clip as a `focus()` cue, scene changes are tour-level `setup` or in-clip `scene()` cues."

**`visitBeatSaga`** new body (the WIP at `visitBeatSaga.ts:76-110` still uses
`focusReady`/`extractSelectionRow`/`focusFraming`/`ResolvedFocus`/`flyToClip(beat, resolved)`/
`beat.effects` — replace all of that):
1. read `resolveDeps`, `cameraRuntime`, `playClip` from `getContext` (unchanged).
2. `yield* call(waitUntil, () => clipFociReady(beat.clip, resolveDeps()) && cameraRuntime() !== null)`
3. `const clip = resolveClipFoci(beat.clip, resolveDeps(), cameraRuntime()!.fovYRad)`
4. `yield* call(playClip, clip)`  (awaited — a mid-flight `advanceTour` must not cut it)
5. `yield* put(showCaption(beat.caption))`
6. `race({ timeout: delay(beat.dwellSec * 1000), next: take(advanceTour), drift: call(playClip, dwellDrift(beat)) })`
7. `yield* put(showCaption(null))`

Remove imports of `focusReady`, `extractSelectionRow`, `focusFraming`, `ResolvedFocus`. Keep
the "getContext read inside the worker" docblock rationale.

- [ ] Confirm/finish `BeatData.ts` (shape + docblock).
- [ ] Rewrite `visitBeatSaga.ts` per the 7 steps above.
- [ ] Rewrite `visitBeatSaga.test.ts` to the new beat shape (beats carry `clip`, not `focus`/`effects`).
  Read the current test's mock style first (`sagaMiddleware.setContext` for
  `resolveDeps`/`cameraRuntime`/`playClip`; `flush()` macrotask helper; CANCEL hook) and match it.
  Required tests:
  - `visitBeatSaga waits until clip foci are ready and camera runtime is non-null before playing`
    (a famous-id clip blocks `waitUntil` until the cloud loads / runtime arrives, then `playClip` fires).
  - `visitBeatSaga passes the resolved clip to playClip` — assert the clip `playClip` receives has
    concrete `setVec`/`set` (no `moveTargetId`/`dollyToId` kinds remain); i.e. `resolveClipFoci` ran.
  - `visitBeatSaga awaits the fly clip before showing the caption` (port the existing "awaits the fly
    clip before arming advance" test to the clip shape).
  - `visitBeatSaga shows then clears the caption` (port existing).
  - `advanceTour wins the dwell race and cancels dwellDrift` (port existing CANCEL test).
  - `the dwell timeout auto-advances` (port existing).
  - An in-clip-focus path test: a `flyAndFocusOnClip`-shaped beat's resolved clip carries a
    `{ kind:'focus', ref }` cue (assert the resolved clip's timeline contains it).
  - DELETE the `puts each effect verbatim` test (no `beat.effects` anymore).
- [ ] `npm test -- visitBeatSaga` → green. Commit.

## Task 8 — `TourSetup` type + `Tour.setup` + `guidedTourSaga` + `watchTourSaga`

**Files:** `src/@types/animation/tour/TourSetup.ts` (new),
`src/@types/animation/tour/Tour.ts` (modify),
`src/state/tour/guidedTourSaga.ts` (modify),
`src/state/tour/watchTourSaga.ts` (modify),
`tests/state/tour/guidedTourSaga.test.ts` (modify).

**CONTRACT MISMATCH to reconcile:** the WIP `Tour.ts:23-28` has `setup` inline and
**required** (`setup: { effects?: readonly Action[] }`). The spec wants a named type and an
**optional** `setup`:
```ts
// src/@types/animation/tour/TourSetup.ts
export type TourSetup = { readonly effects: readonly Action[] };
```
```ts
// Tour.ts
export type Tour = { readonly id: TourId; readonly label: string; readonly setup?: TourSetup; readonly beats: readonly BeatData[] };
```
Making `setup` optional means `demoTour` (Task 9) needs no `setup` key. Migrate the WIP to the
named-type + optional shape.

**`guidedTourSaga`** (`guidedTourSaga.ts:46`): change signature from
`guidedTourSaga(beats: readonly BeatData[])` to `guidedTourSaga(tour: Tour)`. After
`captureScene` + `setUiHidden(true)`, dispatch the setup effects, THEN loop the beats:
```ts
for (const e of tour.setup?.effects ?? []) yield* put(e);
// then: run: call(function* () { for (const beat of tour.beats) yield* call(visitBeatSaga, beat); })
```
The setup effects fire INSIDE the `try`/before the race so the `finally` `restoreScene` winds
them back. **Verify-and-note:** `captureScene` (`captureScene.ts`) snapshots
`captureSettings` (`captureSettings.ts` clones `galaxyCatalogs, structures, volumes,
filaments, milkyWay, flow`) + `selection.focus`. The Task-9 setup effects mutate
`volumes` (setVolumesEnabled), `filaments` (setFilamentsEnabled), and `galaxyCatalogs`
(setGalaxyCatalogLabelEnabled `famousGalaxy`) — all three clusters ARE in the snapshot, so
restore winds them back. Confirm this holds; if a future setup effect touches a cluster
outside that set, the snapshot must be extended (no extension needed for this plan — note it).

**`watchTourSaga`** (`watchTourSaga.ts:18-21`): change `call(guidedTourSaga, tour)` (was
`tour.beats`).

- [ ] Add `TourSetup.ts`.
- [ ] Migrate `Tour.ts` to `setup?: TourSetup` (named, optional); reconcile WIP docblock.
- [ ] Rewrite `guidedTourSaga` signature + setup-dispatch + beats loop; keep the
  `try/finally` + race + `exitTour`-only-abort rationale.
- [ ] Update `watchTourSaga` call site.
- [ ] Update `guidedTourSaga.test.ts`: the saga now takes a `Tour`, not `BeatData[]`. Wrap the
  existing narration-beat fixtures in a `Tour` (`{ id, label, beats:[…] }`). Port all six
  existing tests. ADD `guidedTourSaga dispatches setup effects before the first beat` — a tour
  with `setup.effects: [setVolumesEnabled(false)]` drives `settings.volumes` off in the store
  before any beat side-effect, and `restoreScene` runs in the finally. (Reconcile stub already
  exists in the harness.) Note the beat fixtures move from `{ focus: null, … }` to
  `{ caption, dwellSec, clip }` — narration beats become a minimal hold-only or
  `flyToClip(focusId('milkyWay'))` clip; pick the smallest that keeps `clipFociReady` true
  synchronously (a hold-only clip has no foci → always ready).
- [ ] `npm test -- guidedTourSaga watchTourSaga` → green. Commit.

## Task 9 — Data reshape + integration test

**Files:** `src/data/animation/tours/demoTour.ts` (reshape),
`src/data/animation/tours/webShowcase.ts` (finish + rewrite docblock),
`src/data/animation/clips/cosmicFlows.ts` (verify compiles),
`tests/state/tour/tour.integration.test.ts` (extend OR a new
`tests/state/tour/webShowcaseDive.integration.test.ts`).

**`demoTour`** (`demoTour.ts:26-42`) is still the OLD `focus` shape — reshape its three beats to
`{ caption, dwellSec, clip }` using:
- `flyAndFocusOnClip(focusId('milkyWay'))`
- `flyAndFocusOnClip(focusId('cluster-virgo-m87'))`
- `flyAndFocusOnClip(focusId('supercluster-laniakea-sc'))`

**`webShowcase`** (`webShowcase.ts`) — already mostly in the new shape but its beat clips call
`flyToClip('milkyWay')` etc. with RAW strings (no `focusId(...)` brand) and `flyAndFocusOnClip`
is not imported. Finish:
- `setup.effects` = `[setVolumesEnabled(false), setFilamentsEnabled(false), setGalaxyCatalogLabelEnabled({ id: 'famousGalaxy', enabled: false })]` (already present — keep).
- beats:
  - `{ caption: 'The named cosmic web', dwellSec: 4, clip: flyToClip(focusId('milkyWay')) }`
  - `{ caption: 'The Virgo Cluster',    dwellSec: 6, clip: flyAndFocusOnClip(focusId('cluster-virgo-m87')) }`
  - `{ caption: 'The M87 Galaxy',       dwellSec: 6, clip: flyToClip(focusId('m87')) }`
- Rewrite the docblock: remove the "M87 dive is not here YET" / "intentionally omitted" section;
  describe the dive via composition (beat 2 focuses Virgo, beat 3 moves only the camera to M87
  so Virgo's focus persists and M87 rides bright under the isolation dim).

**`cosmicFlows.ts`** — the user's WIP; verify it still compiles against the changed `focus()`
signature (it does not call `focus()` — confirm by reading; no edit expected).

**Integration test.** The existing `tour.integration.test.ts` is a cosmicFlows clip-opacity
test, NOT a tour-saga harness — extending it in place would muddy two concerns. Prefer a NEW
`webShowcaseDive.integration.test.ts` (note the choice in the task). It must prove the spec's
dive invariants over the webShowcase beats (drive `visitBeatSaga`/`guidedTourSaga` against a
real store with stubbed `resolveDeps`/`cameraRuntime`/`playClip`, matching the
`visitBeatSaga.test.ts` harness):
- `beat 2 sets selection.focus to Virgo` — after the `flyAndFocusOnClip('cluster-virgo-m87')`
  beat's resolved clip plays, the resolved clip carries a `{ kind:'focus', ref: <Virgo structure ref> }`
  cue (and, if driving the real clipPlayer, `selection.focus` becomes that ref).
- `beat 3 (flyToClip m87) leaves focus = Virgo` — the beat-3 resolved clip has NO focus cue, so
  Virgo's focus persists across the beat (assert the resolved clip's timeline has no
  `kind:'focus'`/`kind:'focusId'` entry; the M87 framing rides `setVec`/`set` only).
- `no camera tween is planted during the dive` — the in-clip `focus()` cue fired during beat 2's
  clip is suspend-guarded (`suspendDuringClip` parks `watchFocusTweenSaga`), so no
  `camera.tween` is set while a clip is active. Assert `store.getState().camera.tween` stays null
  across the dive. (Cite `suspendDuringClip.ts` in the test docblock for why.)

- [ ] Reshape `demoTour.ts` (+ docblock tidy: drop the "no effects" paragraph if stale).
- [ ] Finish `webShowcase.ts` beats with branded `focusId(...)` + import `flyAndFocusOnClip`;
  rewrite the docblock.
- [ ] Verify `cosmicFlows.ts` compiles (read; no `focus()` call expected).
- [ ] Add the integration test with the three dive assertions above.
- [ ] `npm test -- tour webShowcase demoTour` → green. Commit.

## Task 10 — Cleanup + full gate

**Files:** `src/@types/animation/tour/ResolvedFocus.ts` (delete if dead),
`src/state/tour/focusReady.ts` (delete if dead), their tests (delete if dead).

After Tasks 7–9, `ResolvedFocus` and `focusReady` are likely unused.

- [ ] Grep `src`/`tests` for importers of `ResolvedFocus` and `focusReady`. **Only if zero
  importers remain**, delete each file + its test. If anything still imports them, STOP and
  report rather than leaving a dangling import.
- [ ] Run `npm run typecheck` (both src + tools tsconfigs) → clean.
- [ ] Run `npm test` (full suite) → green.
- [ ] Note in the commit/PR body: the dive itself is a VISUAL property not covered by automated
  tests — the user confirms on screen (load `webShowcase`, watch beat 3 dive to M87 while the
  rest of the sky stays dimmed and Virgo's members ride bright).
- [ ] Commit.

---

## Self-review (done before finalising this plan)

- **Spec coverage:** `FocusId`/`focusId` (T1) ↔ spec "The interface"; `resolveFocusId`
  milkyWay (T2) ↔ spec "resolveFocusId learns 'milkyWay'"; id-bearing effects + helper
  vocabulary + `compileClip` throw (T3) ↔ spec "New effect-helper vocabulary" + "resolution
  seam"; `resolveClipFoci` (T4) + `clipFociReady` (T5) ↔ spec "The resolution seam"; clip
  builders (T6) ↔ spec "Clip builders"; `BeatData` + `visitBeatSaga` (T7) ↔ spec "BeatData" +
  "visitBeatSaga simplification"; `TourSetup`/`Tour.setup`/`guidedTourSaga` (T8) ↔ spec
  "Tour gains setup"; data + dive integration (T9) ↔ spec "The dive via composition" +
  "Testing"; cleanup + gate (T10). Out-of-scope items (spike finale, milkyWay deep-linking,
  non-settings cues) are not tasked — correct.
- **Placeholder scan:** none.
- **Type-name consistency:** `FocusId`, `focusId`, `FocusBoundEffect`, `moveTargetId`,
  `dollyToId`, `focusId` (effect kind), `resolveClipFoci`, `clipFociReady`, `collectFocusIds`,
  `TourSetup` — spelled identically across all tasks.
- **Contract mismatches flagged inline:** (a) WIP `Tour.setup` is inline + required; spec wants
  named `TourSetup` + optional `setup?` (T8). (b) WIP `flyToClip`/`webShowcase` pass RAW strings
  where the branded `focusId(...)` is required (T6/T9). (c) WIP `demoTour` is still the OLD
  `focus` beat shape (T9). (d) The existing `tour.integration.test.ts` is a clip-opacity test,
  not a tour-saga harness — the dive test goes in a new file (T9).
