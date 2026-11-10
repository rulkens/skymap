# Clip studio package (slice 1): implementation plan

> **For agentic workers:** execute with `subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md), except that the owner asked for **parallel work
> packages** (Q26): the groups below have disjoint file sets and an explicit wave order. One commit per task.

**Goal:** start `packages/studio`, the clip studio, as production code: a lazily loaded timeline editor
behind `#studio=<clipId>` that opens any registry clip, shows its real structure and timing as outline +
tracks, lets a person select steps, edit their parameters in a schema-driven inspector, and undo/redo.
No engine change beyond the compiler's ground preparation; no saving yet.

**Decision record:** [`docs/grill-sessions/clip-studio-2026-11-07.md`](../../grill-sessions/clip-studio-2026-11-07.md)
(Q1–Q26 and the owner's design preferences). There is no spec: Q26 is an explicit owner override of the
spec-first convention, so this plan carries the Ground preparation section a spec would. The design
reference is the mock code in `src/dev/mocks/studio/` (`StudioD*.tsx`, `InspectorGrid.tsx`, `StudioTip.tsx`,
`StudioDGlyph.tsx`, `rulerSteps.ts`, `stepsD.ts`) and the shots in `data/shots/studio-rounds/`. The mocks are
read-only for this plan; nothing in the package imports them.

**Tech:** TS, React 19, RTK 2 (`combineSlices().inject`), typed-redux-saga, CSS modules on
`src/styles/tokens.css`, Vitest + Testing Library.

---

## Architecture

### A1. Package layout and wiring

`packages/studio/` is a workspace package with **no build of its own**: the app's Vite build emits it as a
lazy chunk, so it compiles, lints and tests under the root configs, like `packages/move-files`.

- `package.json`: `@skymap/studio`, private, `type: module`, no dependencies (React, RTK, typed-redux-saga,
  classnames are hoisted from the root, which is the only bundler).
- Root `tsconfig.json` `include` gains `packages/studio/src` and `packages/studio/tests`, so `npm run
  typecheck`, `typecheck:fast` and `npm run build`'s `tsc --noEmit` cover it with no new CI step.
- Root `vitest.config.ts` `include` gains `packages/studio/tests/**/*.test.{ts,tsx}`; tests mirror
  `packages/studio/src/` under `packages/studio/tests/` (the move-files precedent). Component tests opt into
  jsdom per file with `// @vitest-environment jsdom`, as `tests/components/**` do.
- `eslint.config.js`: the product block's `files` gains `packages/studio/src/**/*.{ts,tsx}`; the
  `no-restricted-imports` react-redux rule gains `packages/studio/src/**/state/**`.
- Convention sweeps gain the package root: `componentFilePurity` (no allowlist; the package complies from its
  first commit), `noInlineTypes`, `noJsImportSpecifiers`, `typeFilesAreDeclarations`, `concernFolderShape`
  (15-file cap, bag names) and the utils one-symbol/filename sweeps. A new `studioImportBoundary` test pins
  the dependency direction (A2).

Inside `src/`, **concern modules first, role folders inside** (ADR 0014's shape, as `packages/desktop`):

```
packages/studio/src/
  studioEntry.ts        the lazy chunk's only entry: StudioDock + studioSessionSaga
  @types/{session,rows,kinds}/   cross-module contract types, one per .d.ts
  data/                 cross-module data (channel families)
  utils/format/         naming-table formatters, one function per file
  draft/utils/          pure addressing and edits over the authored ClipData tree
  session/              state/ (slice, selectors, injection), sagas/, utils/, data/
  kinds/data/           THE row-kind registry (A5)
  timeline/             utils/ (model), state/ (composed selectors), components/ (outline, ruler, tracks, marks)
  primitives/           data/ (glyph paths), components/ (Glyph, StudioTip, Kbd, inspector grid primitives)
  inspector/            data/ (field controls), utils/, components/
  shell/                data/ (key table), hooks/, components/ (dock, grabber, top bar, key bar, narrow notice)
```

### A2. Dependency direction

The app knows the package only by **two dynamic `import()`s** of `packages/studio/src/studioEntry.ts`: the
takeover body saga (`src/state/studio/studioBodySaga.ts`) and the React host
(`src/components/StudioHost/StudioHost.tsx`). Vite folds both into one chunk. The package deep-imports app
types, engine and store modules by relative path (desktop precedent); those already live in the main chunk, so
the lazy chunk depends on main and never the reverse. `studioImportBoundary.test.ts` enforces: no static import
of `packages/studio` from `src/`, dynamic ones only from those two files; no `react-redux` import in the
package (components read through `src/store/hooks.ts`); no import of `src/dev/`.

### A3. RTK: inject the studio slice into the app store

**Decision:** the root reducer becomes `combineSlices(...)` (same static routes), and the package calls
`rootReducer.inject(studioSlice)` once, at session start. Selectors come from
`studioSlice.injectInto(rootReducer).selectors`, which read `initialState` until the slice's first action
lands, so no component or saga ever sees `undefined`. The app's `RootState` stays unaware of `studio`: the
package owns its state type, and the app imports nothing from the package.

Rejected: a studio-owned store. The studio needs the app's saga context (selection resolver, camera runtime),
takeover and clock actions, and later the engine seams; a second store means a second saga middleware and
cross-store sync. RTK 2's injection is the stock answer and `combineSlices` already composes the settings root
(`src/state/settings/combinedSettingsReducer.ts`). Recorded as **ADR 0016** (Task 1.2).

### A4. The studio is a takeover

`#studio=<clipId>` is a takeover kind beside `exhibit`, `tour` and `clip`: one `TakeoverSource` arm, one
`takeoverSource('studio')` hash row, one `navigateSaga` case, one `watchTakeoverSaga` branch. That reuses the
mutual exclusion (a tour link closes the studio), the URL round trip and the clock-freeze bracket Q7 needs
(the studio pins the sim instant), and gives later slices (seek, scene tracks) the same lifetime
`clipBodySaga` has. Closing is `exitTakeover` (Close button, or Escape when nothing in the studio is
selected). The draft stays in the injected slice after close, and reopening the same clip keeps it, so a
close never silently loses work while saving does not exist.

### A5. One registry keyed by row kind

`kinds/data/rowKinds.ts` exports `ROW_KINDS: RowKindRegistry`, a mapped type over every `Effect['kind']`
plus the two pseudo-rows (`start`, `waypoint`), so the compiler refuses a missing kind. Each entry is pure
data plus pure functions: glyph id, mark shape, channel families written, the naming-table label, and the
inspector field schema. Components look up `MarkShape → component` and `FieldControl → widget` in two small
tables; adding a kind is one entry (in one of four family files), not edits in five places. No React in the
registry, so the model and the registry test without a DOM.

### A6. The timeline model is derived, and its timing comes from the compiler

`Timeline = buildTimeline(draft, compile, collapsed)`: a pure function of the authored draft (names, values,
tree) and the compiler's per-effect spans (start/end seconds, flyPath knot times), memoised by
`createSelector`. No re-implementation of timing: `compileClip` gains `spans` (Task 0.1). Compiling needs a
resolved clip, and resolution needs the engine's `SelectionResolver`, so `resolveDraftSaga` resolves each
draft revision and lands it in the slice as a **revision-tagged display cache** (the `selectionRows`
precedent: one saga writer, consumers ignore a resolution whose revision is not the draft's). The resolved
tree has the draft's shape (pinned by Task 0.4), so a span's path, a compile error's path and an inspector's
"Resolved" line all index the draft directly.

### A7. Edits are pure, validated by the compiler

Every edit is a reducer over the draft: slice 1 has one, `paramEdited({ ref, param, value, label, gesture })`,
applied by `setRowParam`. Unit conversion (degrees → radians, % → 0–1) happens in the inspector before
dispatch, so actions stay serializable. Undo/redo keeps **draft snapshots** (immer's structural sharing makes
them cheap, and undoing back to the opened draft restores the identical object, which is how "clean" is
detected). Consecutive edits with the same `gesture` id (one focused field, held arrow key) coalesce into one
history entry. Validity is the compiler's: a `ClipCompileError` carries the offending effect paths, a reason
and the spans walked so far (Task 0.3), so an invalid draft still draws at true times with its culprits marked.

### A8. Slice 1 vs later

Slice 1 is pure (A1–A7): scaffold, store seam, takeover route, compiler ground prep, model, registry,
primitives, shell, outline/tracks/inspector over real clips, selection, param edits, undo, playhead and zoom
in state. The 3D view does not follow the playhead yet (no seek). Deliberately absent from slice-1 state,
each added by the slice that gives it a consumer: `views` (PiP, S6), `loop` (transport, S4), `saveStatus`
(S8). See **Later slices**.

---

## Ground preparation

Produced against the post-refactor shape above. Each item is its own commit, sequenced first in its group.

| Prep | Why the feature needs it | Task |
| --- | --- | --- |
| `compileClip` returns per-effect `spans` | Row timing from the compiler's own walk (overlapped seqs, cue flushing, fork, dwell-lengthened flyPaths) | 0.1 |
| flyPath knot arrival times on the track and span | Waypoint rows and lane knots (Q18–Q20) | 0.2 |
| `ClipCompileError` with paths, reason, partial spans | Map an invalid draft to its rows; draw it at true times | 0.3 |
| Resolution preserves effect paths (test) | Spans and errors index the authored draft | 0.4 |
| Root reducer → `combineSlices` | Lazy slice injection (A3) | 1.2 |
| `withFrozenClockSaga` out of `clipBodySaga` | The studio session pins the clock the same way; no second copy | 1.3 |

Growth verdict: every later slice lands as a new registry entry, a new slice field with its consumer, or a new
saga over the same session; the PiP rig, scene tracks and seek are engine slices the studio only calls. PR
packaging of the prep commits (own PR vs riding this one) is asked at the checkpoint, as always.

---

## Work packages and order

| Wave | Group | Owns | Starts from |
| --- | --- | --- | --- |
| 0 | **Task 0** (controller, inline) | `src/@types/animation/EffectPath.d.ts`, `EffectSpan.d.ts` | `main` |
| A | **G0 Compiler prep** (0.1–0.4) | `src/services/engine/animation/**`, `src/@types/animation/**` (except Task 0's), their tests | Task 0 |
| A | **G1 Session** (1.1–1.8) | root configs, `src/store/**`, `src/state/{takeover,url,navigation,studio,time,camera/clipBodySaga}`, `src/@types/{takeover,url}`, `tests/conventions/**`, ADR, `packages/studio/{package.json,README.md}`, `packages/studio/src/{studioEntry.ts,@types,draft,session}` | Task 0 |
| B | **G2 Model + registry** (2.1–2.6) | `packages/studio/src/{data,utils,kinds,timeline/utils,timeline/state}` | A merged |
| B | **G3 Primitives** (3.1–3.4) | `packages/studio/src/primitives/**` | G1 Task 1.5 (may start early) |
| C | **G4 Shell + timeline view** (4.1–4.5) | `packages/studio/src/{shell,timeline/components}/**` | B merged |
| C | **G5 Inspector** (5.1–5.3) | `packages/studio/src/inspector/**` | B merged |
| D | **Task 6.1** (controller) | `src/components/App/App.tsx`, `src/components/StudioHost/**`, `studioEntry.ts`, `StudioDock.tsx`, docs | C merged |

Tests for each group live under the mirror of its `src/` folders and are part of its file set. G1 owns the
package's contract types (Task 1.5) so B and C compile against them; a group that finds a contract type wrong
says so in its reply and the controller amends it, never two groups editing one type file.

---

## Task 0: path and span types (controller, inline)

**Files:** `src/@types/animation/EffectPath.d.ts` (new), `src/@types/animation/EffectSpan.d.ts` (new)

```ts
/** Index path into ClipData.timeline: timeline index, then `children` index (seq/all), 0 for a fork's child. */
export type EffectPath = readonly number[];

/** The compiler's walk window for one effect. endSec - startSec is the AWAITED duration (0 for cues, fork, osc). */
export type EffectSpan = {
  readonly path: EffectPath;
  readonly startSec: number;
  readonly endSec: number;
  /** flyPath only: absolute arrival second at each waypoint, one per waypoint, the last equal to endSec. */
  readonly knotSecs?: readonly number[];
};
```

No test (types).

---

## G0: Compiler ground preparation

### Task 0.1: `compileClip` records per-effect spans

**Files:** `src/services/engine/animation/compileClip.ts`, `src/@types/animation/compiledClip/CompiledClip.d.ts`,
`tests/services/engine/animation/compileClip.test.ts` **review: yes**

**Contract:** `CompiledClip` gains `readonly spans: readonly EffectSpan[]`, one per walked effect in walk
pre-order (parent before children). `walk` threads the effect's path; each node records
`{ path, startSec: atSec, endSec: atSec + <the duration walk returns> }`. A fork's child records its own true
window; the fork records `[atSec, atSec]`. Zero-length children of an overlapped seq record the second they
actually fire at (the next step's start). Existing tests that `toEqual` a whole `CompiledClip` are updated to
ignore or include `spans`; no other compiled field changes.

- [x] Test `spans: an overlapped seq starts its second step overlap seconds early`:
      `seq([dollyTo(300, 4), dollyTo(950, 4)], { overlap: 1 })` → child spans `[0,4]` and `[3,7]`, seq `[0,7]`.
- [x] Test `spans: a cue inside an overlapped seq fires at the next step's start`:
      `seq([dollyTo(300, 4), show(['flow']), dollyTo(950, 4)], { overlap: 1 })` → the show's span is `[3,3]`.
- [x] Test `spans: a forked child keeps its own window while the fork awaits nothing`:
      `[wait(2), fork(dollyTo(300, 5)), hold(1)]` → fork `[2,2]`, its child (path `[1,0]`) `[2,7]`, hold `[2,3]`.
- [x] Test `spans: all ends on its longest child`: `all([dollyTo(1, 2), spin('yaw', { by: 1, over: 5 })])` → `[0,5]`.
- [x] Implement; `npm test -- compileClip` green.

### Task 0.2: flyPath knot arrival times

**Files:** `src/services/engine/animation/buildPathTrack.ts`, `src/@types/animation/compiledClip/CompositeTrack.d.ts`,
`src/services/engine/animation/compileClip.ts`, `tests/services/engine/animation/buildPathTrack.test.ts`,
`tests/services/engine/animation/compileClip.test.ts` **review: yes**

**Contract:** `CompositeTrack` gains optional `readonly knotSecs?: readonly number[]` (absolute arrival second
per waypoint; geodesic omits it). `buildPathTrack` fills it from the same time warp it samples with (dwell
included); `compileClip` copies it onto the flyPath's `EffectSpan.knotSecs`.

- [x] Test `knotSecs: one per waypoint, strictly increasing, the last equal to endSec` (3 `atPoint` waypoints).
- [x] Test `knotSecs: a dwell moves later knots by the dwell time`: same path with `linger: 0.7, lingerSec: 1.4`
      → each knot after the first is later than without dwell, and `endSec` grows by the summed dwell.
- [x] Test `spans: a flyPath span carries its track's knotSecs`.
- [x] Implement; targeted tests green.

### Task 0.3: `ClipCompileError` names the effects at fault

**Files:** `src/services/engine/animation/ClipCompileError.ts` (new), `src/@types/animation/ClipCompileReason.d.ts`
(new), `src/services/engine/animation/{compileClip,validateSingleWriter,validateSeqOverlap,validateSeqCueOrder,validateCompositeExclusivity,resolveSeqJoins}.ts`,
`tests/services/engine/animation/ClipCompileError.test.ts` (new) **review: yes**

**Contract:**

```ts
export type ClipCompileReason =
  | 'twoWriters' | 'threeWriters' | 'blendWindow' | 'joinRefused'
  | 'seqOverlap' | 'cueOrder' | 'compositeClash' | 'flyPath';

export class ClipCompileError extends Error {
  readonly reason: ClipCompileReason;
  readonly paths: readonly EffectPath[]; // the effect(s) at fault, never empty
  readonly spans: readonly EffectSpan[]; // every span recorded before the throw
  readonly channel?: Channel;
}
```

Every throw `compileClip` can surface (its own and its validators') becomes a `ClipCompileError`; messages
are unchanged, so existing message assertions stay green. Mechanism is the implementer's within two limits:
runtime track types (`BaseSegment`, `VelRamp`, `SceneCue`) gain **no** provenance field (the evaluator's hot
types and their `toEqual` tests stay untouched), so post-walk validators report the offending writer objects
and `compileClip` maps them to paths through an identity map it keeps beside its accumulators (index-aligned
through `continuedFromComposite` and `resolveSeqJoins`, which preserve array positions); mid-walk throws are
wrapped once, at the deepest node being walked. "Unresolved focus effect" throws stay plain `Error`s: they are
programmer errors, not draft errors.

- [x] Test `twoWriters names both clashing effects`: `all([dollyTo(300, 4), dollyTo(500, 6)])` → paths
      `[[0,0],[0,1]]`, reason `twoWriters`, channel `distance`, spans include both children.
- [x] Test `seqOverlap names the seq`: `seq([dollyTo(1, 2), dollyTo(2, 2)], { overlap: 3 })` → paths `[[0]]`.
- [x] Test `threeWriters names the three`, `cueOrder names the cue`, `compositeClash names the composite and the
      base writer`, `flyPath names the flyPath` (an empty waypoint list): one test each, smallest clip that
      triggers it.
- [x] Test `a valid clip compiles exactly as before` is the existing suite; run all of
      `tests/services/engine/animation/`.

### Task 0.4: resolution preserves every draft path (amended 2026-11-10)

**Files:** `tests/services/engine/animation/resolveClipFoci.test.ts`

The studio indexes the authored draft with paths computed on the resolved clip. The original contract
("every path exists in both trees") is false: `resolveClipFoci` rewrites `lookAtId` and `aimAlong` to
`aimAt(...)` = `all([yaw tween, pitch tween])`, so a draft leaf at path P becomes an `all` at P with children
that exist only in the resolved tree (7 registry clips). Controller ruling: keep the engine as it is and pin
the weaker, true contract. A span looked up by a draft path is still the right window (the resolved `all` at P
spans exactly the leaf's window); only compile-error paths can name a deeper node, and `buildTimeline` trims
those (Task 2.4).

- [x] Test `resolveClipFoci keeps every draft path, structural kind and waypoint count`: for every
      `clipRegistry` clip, with a stub resolver that resolves any id, walk the draft; every draft path exists
      in the resolved tree, `seq`/`all`/`fork` stay put, flyPath waypoint counts match, and a draft node whose
      resolved kind differs is a `lookAtId` or `aimAlong` that became an `all` of two `set` tweens.

---

## G1: Session (scaffold, seams, state, saga)

Work order: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.4 (the route lands last, so `studioEntry.ts` exports a real
saga from its first commit). G3 may branch from the 1.5 commit.

### Task 1.1: package scaffold and convention wiring

**Files:** `packages/studio/package.json`, `packages/studio/README.md` (new: what it is, how to open it, the
module map of A1, the A2 boundary, in ≤ 60 lines), `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`,
`tests/conventions/{componentFilePurity,noInlineTypes,noJsImportSpecifiers,typeFilesAreDeclarations,concernFolderShape}.test.ts`,
`tests/helpers/conventions/utilsFunctionSweepFiles.ts`, `tests/conventions/studioImportBoundary.test.ts` (new),
`CLAUDE.md` ("Where to look": one line, `packages/studio/  clip studio (lazy #studio chunk) — README`)

- [x] Wire per A1. The utils sweep covers `packages/studio/src/**/utils/`.
- [x] `studioImportBoundary` rules per A2, empty allowlist. Its roots may be nearly empty at this commit; the
      rules must still run (assert the swept file list is defined, not non-empty).
- [x] `npm run typecheck:fast`, `npm test -- conventions` green.

### Task 1.2: root reducer becomes `combineSlices`; injection seam; ADR 0016

**Files:** `src/store/rootReducer.ts`, `src/store/types.ts` (only if `RootState` inference needs it),
`tests/store/rootReducer.test.ts` (new), `docs/adrs/0016-lazy-slices-inject-into-the-root-reducer.md` (new)
**review: yes**

**Contract:** `export const rootReducer = combineSlices({ [settingsRoute]: …, … })` with the same routes and
reducers; `RootState = ReturnType<typeof rootReducer>` unchanged in shape.

- [x] (Deleted later by Q44: it tested RTK.) Test `a slice injected after store creation reads initialState before its first action and its own state
      after`: a throwaway `createSlice` injected into `rootReducer` after `createAppStore()`; its `injectInto`
      selector returns `initialState` immediately, and the reduced value after one of its actions.
- [x] `createAppStore.test.ts` and the full store tests stay green (no static route changes).
- [x] ADR 0016: context (lazy chunk needs state, Q26's open question), decision (A3), consequences (app
      `RootState` unaware of lazy slices; a lazy slice reads through `injectInto` selectors; the serializable
      and immutable checks walk injected state too).

### Task 1.3: extract `withFrozenClockSaga` (prep refactor)

**Files:** `src/state/time/withFrozenClockSaga.ts` (new), `src/state/camera/clipBodySaga.ts`,
`tests/state/camera/clipBodySaga.test.ts`

**Signature:** `withFrozenClockSaga<T>(body: (frozenSimDays: number) => Generator<unknown, T>): Generator<unknown, T>`:
pause at one `nowMs`, derive the frozen sim instant from it, run `body`, and in `finally` give the clock back
exactly as `clipBodySaga` does today (live re-snaps, a playing manual clock resumes, a paused one stays).

- [x] Move the bracket out of `clipBodySaga` unchanged; `clipBodySaga` calls it.
- [x] Existing `clipBodySaga` tests pin the behaviour; if none covers the live re-snap branch, add
      `withFrozenClockSaga re-snaps a live clock on exit`.

### Task 1.4: `#studio=<clipId>` takeover route and lazy body

**Files:** `src/@types/takeover/TakeoverSource.d.ts`, `src/@types/url/LinkView.d.ts`,
`src/state/url/hashParamSources.ts`, `src/state/navigation/navigateSaga.ts`, `src/state/takeover/watchTakeoverSaga.ts`,
`src/state/studio/studioActions.ts` (new: `openStudio = createAction<ClipId>('studio/open')`),
`src/state/studio/studioBodySaga.ts` (new), `packages/studio/src/studioEntry.ts` (new; exports
`studioSessionSaga`, from Task 1.8),
`tests/state/navigation/navigateSaga.test.ts`, `tests/state/studio/studioBodySaga.test.ts` (new) **review: yes**

- `TakeoverSource` gains `{ kind: 'studio'; id: ClipId }`; `LinkView`'s takeover arm gains `'studio'`.
- `HASH_PARAM_SOURCES` appends `takeoverSource('studio')` (append-only rule).
- `navigateSaga`: `case 'studio'`: unknown id → `UNKNOWN_ID`; else `put(openStudio(id))`. `startsTakeover`
  includes `studio`.
- `watchTakeoverSaga`: `openStudio` joins `startRequests`; source `{ kind: 'studio', id }`; body
  `() => studioBodySaga(id)` (no scene snapshot: the studio writes no scene in slice 1).
- `studioBodySaga(id)`: `call` the dynamic `import('../../../packages/studio/src/studioEntry')`, then
  `call(studioSessionSaga, id)`.

- [x] Test `navigate #studio=<unknown> is UNKNOWN_ID and opens nothing`.
- [x] Test `navigate #studio=cosmicFlows dispatches openStudio('cosmicFlows')`.
- [x] Test `studioBodySaga runs the package session saga for its clip` (mock the dynamic import with `vi.mock`).

### Task 1.5: package contract types

**Files:** new `.d.ts` files, one type each, under `packages/studio/src/@types/{session,rows,kinds}/`. No test.
These are the contracts B and C build against; pin them exactly.

```ts
// rows/
export type EffectKind = Effect['kind'];
export type RowKind = EffectKind | 'start' | 'waypoint';
export type RowRef =
  | { readonly kind: 'start' }
  | { readonly kind: 'effect'; readonly path: EffectPath }
  | { readonly kind: 'waypoint'; readonly path: EffectPath; readonly index: number };
/** What each row kind edits: its Effect arm, the clip's start, or one flyPath waypoint. */
export type RowSubjects = { readonly [K in EffectKind]: Extract<Effect, { kind: K }> } & {
  readonly start: ClipData['start'];
  readonly waypoint: PathWaypoint;
};
export type ChannelFamily = 'distance' | 'lookAt' | 'turn' | 'layers' | 'settings';
export type LabelOp = '→' | '+' | '−' | '±' | '';
/** One row's text per the naming table: Name | Op Value · qualifier; duration is formatted separately. */
export type RowLabel = {
  readonly name: string;          // closed vocabulary, ≤ 11 chars
  readonly op: LabelOp;
  readonly value: string;         // '300 Mpc', '±5.2° /16 s', 'via c65, m31 +10'
  readonly subject?: FocusId;     // Q22: a bound step shows the subject only, '→ ◎M31'
  readonly qualifier?: string;    // after ' · ': 'flow', 'loops', 'fade 2 s'
};
export type TimelineRow = {
  readonly id: string;            // rowKey(ref)
  readonly ref: RowRef;
  readonly kind: RowKind;
  readonly depth: number;
  readonly parentId: string | null;
  readonly expandable: boolean;
  readonly collapsed: boolean;
  readonly background: boolean;   // inside a fork
  readonly family: ChannelFamily | null;  // icon tint; null for structure rows
  readonly writes: readonly ChannelFamily[];  // a group: union of its children
  readonly label: RowLabel;
  readonly duration: string;      // '4 s', '0 s', 'end', '∞', '–' (unresolved)
  readonly startSec: number | null;   // null until the draft resolves and compiles
  readonly endSec: number | null;     // awaited end
  readonly tailEndSec: number | null; // visible extent: a cue's `over`, a windowed osc's window, a perpetual osc to clip end
  readonly errors: readonly ClipCompileReason[];
};
export type TimelineCompile =
  | { readonly ok: true; readonly spans: readonly EffectSpan[]; readonly durationSec: number }
  | { readonly ok: false; readonly spans: readonly EffectSpan[]; readonly error: ClipCompileErrorInfo };
export type ClipCompileErrorInfo = {
  readonly reason: ClipCompileReason; readonly paths: readonly EffectPath[];
  readonly channel?: Channel; readonly message: string;
};
export type Timeline = {
  readonly rows: readonly TimelineRow[];      // visible rows, collapse applied, in outline order
  readonly durationSec: number | null;
  readonly loop: boolean;
  readonly error: ClipCompileErrorInfo | null;
  readonly cueSecs: readonly number[];        // ruler notches and snap targets: step starts, cue times, End
};

// kinds/
// GlyphId: a string-literal union of every key in the mock's StudioDGlyph ICON table, plus 'aimAlong'.
export type MarkShape = 'start' | 'bar' | 'cue' | 'gap' | 'group' | 'rate' | 'osc' | 'composite' | 'knot';
export type FieldControl =
  | 'seconds' | 'mpc' | 'degrees' | 'degreesPerSec' | 'percent' | 'number'
  | 'ease' | 'channel' | 'toggle' | 'readout';
export type FieldSpec<T> = {
  readonly key: string;                                   // stable within the kind
  readonly param: Extract<keyof Exclude<T, string | undefined>, string>;  // the subject field it reads and writes
  readonly label: string;                                 // ≤ 11 chars, the naming vocabulary
  readonly tip?: string;                                  // one line, no full stop
  readonly control: FieldControl | ((subject: T) => FieldControl);
  readonly fallback?: number | string | boolean;          // shown dim while the param is absent; ↺ resets to absent
  readonly readOnly?: true;
  readonly section?: string;                              // inspector section header, e.g. 'Pace'
};
export type RowKindSpec<T> = {
  readonly glyph: GlyphId;
  readonly mark: MarkShape;
  readonly writes: (subject: T) => readonly ChannelFamily[];
  readonly label: (subject: T) => RowLabel;
  readonly fields: readonly FieldSpec<T>[];
  /** Subject-bound kinds: the inspector's Resolved line from the same path in the resolved clip (Q22). */
  readonly resolved?: (resolved: Effect) => string;
};
export type RowKindRegistry = { readonly [K in RowKind]: RowKindSpec<RowSubjects[K]> };

// session/
export type PreviewPins = {   // Q7: pinned when the clip opens
  readonly startPose: CameraPose; readonly simDays: number;
  readonly frame: OrientationFrameId; readonly fovYRad: number;
};
export type StudioResolution =
  | { readonly revision: number; readonly data: ClipData }   // resolved foci + pinned start
  | { readonly revision: number; readonly message: string };
export type HistoryEntry = { readonly draft: ClipData; readonly label: string; readonly gesture: string | null };
export type DraftHistory = { readonly past: readonly HistoryEntry[]; readonly future: readonly HistoryEntry[] };
export type TimeWindow = { readonly startSec: number; readonly endSec: number };
export type StudioState = {
  readonly clipId: ClipId | null;
  readonly baseline: ClipData | null;   // as opened; dirty = draft !== baseline
  readonly draft: ClipData | null;      // authored form, FocusIds unresolved
  readonly revision: number;            // bumps on every draft change
  readonly preview: PreviewPins | null;
  readonly resolution: StudioResolution | null;
  readonly selection: RowRef | null;
  readonly collapsed: readonly string[];  // row ids
  readonly playheadSec: number;
  readonly viewport: TimeWindow | null;   // null = fit
  readonly history: DraftHistory;
};
```

`HistoryEntry.draft` is the draft **before** the edit (the state undo returns to); for `future`, the draft
redo returns to. `label` names the edit for "Undo Distance".

### Task 1.6: draft addressing and the param edit

**Files:** `packages/studio/src/draft/utils/{rowKey,effectAt,updateEffectAt,setRowParam}.ts` (new), mirrors in
`packages/studio/tests/draft/utils/`

**Signatures:**
- `rowKey(ref: RowRef): string`: `'start'`, `'e:0.2.1'`, `'w:0.2.1/3'`.
- `effectAt(data: ClipData, path: EffectPath): Effect | null`.
- `updateEffectAt(data: ClipData, path: EffectPath, update: (e: Effect) => Effect): ClipData`: copies only the
  spine from root to the target.
- `setRowParam(data: ClipData, ref: RowRef, param: string, value: number | string | boolean | undefined): ClipData`:
  `undefined` removes an optional param; a `waypoint` ref edits `waypoints[index]` of the flyPath at `path`.

- [x] Test `updateEffectAt keeps every sibling subtree by identity` (only the spine is new).
- [x] Test `setRowParam sets a nested effect's param` (`over` of `[1,0]` in a two-level clip).
- [x] Test `setRowParam with undefined removes an optional param` (`fade` on an `osc`).
- [x] Test `setRowParam edits one waypoint` (`linger` on waypoint 2 of a flyPath; the others keep identity).
- [x] Test `rowKey distinguishes effect and waypoint refs at the same path`.

### Task 1.7: the studio slice, injection and selectors

**Files:** `packages/studio/src/session/state/{studioSlice,initialState,selectors}.ts`,
`packages/studio/src/session/data/studioLimits.ts` (`HISTORY_LIMIT = 100`),
`packages/studio/src/session/utils/defaultCollapsed.ts`, tests mirrored **review: yes**

**Actions** (slice name `studio`):

| Action | Payload | Effect |
| --- | --- | --- |
| `studioOpened` | `{ clipId; draft; preview }` | same `clipId` with a dirty draft: keep draft and history, refresh `preview`; otherwise reset to the new clip, `collapsed = defaultCollapsed(draft)` (flyPaths with > 8 waypoints, Q20) |
| `draftResolved` | `StudioResolution` | stored only when `revision` equals the draft's |
| `rowSelected` | `RowRef \| null` | |
| `rowToggled` | `string` (row id) | collapse ↔ expand |
| `playheadSet` | `number` (s) | clamped to `≥ 0` |
| `viewportSet` | `TimeWindow \| null` | |
| `paramEdited` | `{ ref; param; value; label; gesture: string \| null }` | `setRowParam`; push `{ draft: before, label, gesture }` unless the top entry has the same non-null gesture; clear `future`; bump `revision` |
| `undone` / `redone` | none | swap through history; bump `revision` |

**Selectors** (`injectInto` selectors over the app `RootState`): `selectStudioClipId`, `selectDraft`,
`selectRevision`, `selectSelection`, `selectCollapsed`, `selectPlayheadSec`, `selectViewport`,
`selectPreview`, `selectIsDirty`, `selectUndoLabel` / `selectRedoLabel` (`null` when unavailable),
`selectCurrentResolution` (the resolution only when its revision is the draft's, else `null`).
`selectors.ts` binds the slice with `studioSlice.injectInto(rootReducer)` (fix wave B replaced the planned `injectStudioSlice()`); importing it injects, idempotently.

- [x] Test `paramEdited pushes one history entry and bumps the revision`.
- [x] Test `edits with the same gesture coalesce into one entry; a new gesture starts another`.
- [x] Test `undoing back to the opened draft makes the studio clean again` (`selectIsDirty` false, the draft is
      the baseline object).
- [x] Test `an edit after undo clears redo`.
- [x] Test `history keeps at most HISTORY_LIMIT entries, dropping the oldest`.
- [x] Test `reopening the same clip keeps an unsaved draft; opening another replaces it`.
- [x] Test `a resolution for a stale revision is ignored by selectCurrentResolution`.
- [x] Test `defaultCollapsed folds a flyPath past 8 waypoints and nothing else`.

### Task 1.8: the session saga

**Files:** `packages/studio/src/session/sagas/{studioSessionSaga,resolveDraftSaga}.ts`,
`packages/studio/src/studioEntry.ts` (export `studioSessionSaga`), tests mirrored **review: yes**

**Contract:**
- `studioSessionSaga(id: ClipId)`: `withFrozenClockSaga(simDays => …)`: wait until
  `cameraRuntime()` is non-null (`waitUntilSaga`), pin `PreviewPins` (runtime `from` and `fovYRad`, the frozen
  `simDays`, `selectOrientation`), `put(studioOpened({ clipId: id, draft: clipFactories[id](simDays).data, preview }))`,
  then run `resolveDraftSaga` until cancelled (the takeover ends). Nothing is cleared on exit (A4).
- `resolveDraftSaga`: for each new revision (on `studioOpened`, `paramEdited`, `undone`, `redone`), wait for
  `clipFociReady(draft, selection)`, then
  `resolveClipStart(resolveClipFoci(draft, selection, fovYRad, startPose, simDays, ORIENTATION_FRAMES[frame]), startPose)`
  and `put(draftResolved({ revision, data }))`; a throw lands `{ revision, message }`. A newer revision
  supersedes a pending wait (latest wins). The same calls `clipBodySaga` makes, cited there.

- [x] Test `the session opens the clip at the frozen instant with the pinned preview`.
- [x] Test `each edit is resolved and tagged with its revision`.
- [x] Test `a revision still waiting for foci is superseded by a newer one`.
- [x] Test `ending the takeover keeps the draft in the slice`.

---

## G2: Model and registry (pure)

### Task 2.1: naming-table formatters

**Files:** `packages/studio/src/utils/format/{formatDuration,formatQuantity,formatNameList,formatTimecode}.ts`, tests

Rules (round-1 naming table): a space before units; one decimal only below 10; a true minus `−`; lists show two
names then `+N`. Reuse `src/utils/format/formatDistance.ts` for Mpc if its ladder gives `300 Mpc` / `0.78 Mpc`;
otherwise `formatQuantity` covers it. Do not add a formatter without a caller in this group.

- `formatDuration(sec: number): string`: `4 s`, `1.5 s`, `11 s`, `0 s`.
- `formatQuantity(value: number, unit: string): string`: `300 Mpc`, `5.2°`, `−20°`, `1.4°/s`, `0 %`.
- `formatNameList(names: readonly string[]): string`: `flow`, `flow, labels`, `flow, labels +2`.
- `formatTimecode(sec: number): string`: `7.4 s` below 60, `1:47.5` from 60 (ruler head and readout).

- [x] One test per function on hand-computed cases above, plus `formatQuantity(-0.0, '°')` → `0°` (no `−0`).

### Task 2.2: channel families

**Files:** `packages/studio/src/data/channelFamilies.ts`, `packages/studio/tests/data/channelFamilies.test.ts`

`CHANNEL_FAMILY: Record<Channel, ChannelFamily>` (`distance`, `fov` → distance; `target` → lookAt; `yaw`,
`pitch`, `roll` → turn) and `CHANNEL_FAMILY_LEGEND: readonly { family; name; glyph }[]` in legend order
(Distance, Look-at, Turn · tilt, Layers, Settings · focus).

- [x] Test `the legend lists every family exactly once` (structural invariant).

### Task 2.3: the row-kind registry

**Files:** `packages/studio/src/kinds/data/{cameraKinds,subjectKinds,sceneKinds,structureKinds,rowKinds}.ts`,
`packages/studio/tests/kinds/data/rowKinds.test.ts`

- Family files type their part as `Pick<RowKindRegistry, …>`: camera (`set`, `setVec`, `spin`, `rate`, `osc`,
  `aimAlong`, `flyPath`, `geodesic`), subject (`moveTargetId`, `dollyToId`, `lookAtId`, `strafeId`,
  `spinToId`, `focusId`), scene (`show`, `hide`, `fade`, `scene`, `focus`, `frameTo`), structure (`hold`,
  `wait`, `seq`, `all`, `fork`). `rowKinds.ts` spreads them plus `start` and `waypoint` into
  `ROW_KINDS: RowKindRegistry`.
- Labels follow the owner's naming table (Name | Op Value | Dur; the latest form is the mock's `stepsD.ts`
  rows): `set` by channel → Distance / Turn / Tilt / Roll / FOV; `spin` → Turn / Tilt with
  `+`; `rate` → Turn speed / Tilt speed; `osc` → Bob turn / Bob tilt with `±` and `amp /period`; `setVec` →
  Look-at; `aimAlong` → Aim; `flyPath` → Fly `via a, b +N`; `geodesic` → Zoom-pan; subject kinds →
  Look-at / Distance / Aim / Strafe / Turn / Focus with `subject`; `show`/`hide` → Show / Hide with the address
  list; `fade` → Fade `→ 0 %` · qualifier addresses; `scene` → Set; `focus` → Focus; `frameTo` → Frame;
  `hold`/`wait` → Hold / Wait; `seq` → In order, `all` → Together, `fork` → Background; group values list
  child names (`Distance ×2 · blend 1 s` for an overlapped seq); `start` → Start `saved view` / `live view`;
  `waypoint` → Pass, the last one Settle.
- Fields per kind: every numeric param a person tunes (`over`, `to`, `by`, `amp`, `period`, `fade`, `sec`,
  scalar `overlap`, flyPath's `align`, `rampSec`, `linger`, `lingerSec`, waypoint `over`/`linger`, …) with the
  control that converts its unit; `ease` and `ch` as picks; Vec3s, address lists, FocusIds, `SettingsAction`s,
  per-join overlap arrays and the start pose as `readout`. Defaults: use the helper defaults in
  `src/services/engine/animation/pathDefaults.ts` as `fallback`, never a copied number.

- [x] Test `every kind labels a helper-built effect with a non-empty name of at most 11 characters` (one
      `effectHelpers`-built sample per kind; the table of samples is the test's fixture).
- [x] Test `labels follow the naming table`: hand-written expectations for `dollyTo(300, 4)` →
      `{ name: 'Distance', op: '→', value: '300 Mpc' }`; `fade(['flow'], 0, 3)` →
      `{ name: 'Fade', op: '→', value: '0 %', qualifier: 'flow' }`; `oscillate('pitch', …)` → `Bob tilt`, `±`;
      `moveTargetId(focusId('m31'), 3)` → `{ name: 'Look-at', op: '→', subject: 'm31' }`; an overlapped seq →
      `In order`, value `Distance ×2 · blend 1 s`.
- [x] Test `every field's param exists on its kind's helper-built sample or is an optional param of that arm`
      (catches a misspelt `param` the `Extract<keyof …>` cannot, for union-typed controls).

### Task 2.4: `buildTimeline`

**Files:** `packages/studio/src/timeline/utils/buildTimeline.ts`, `packages/studio/tests/timeline/utils/buildTimeline.test.ts`

**Signature:** `buildTimeline(draft: ClipData, compile: TimelineCompile | null, collapsed: readonly string[]): Timeline`

Walks the draft (Start row first, then the timeline in order; flyPath waypoints as child rows), applies
collapse, takes times from `compile.spans` by path (`null` while `compile` is `null`), waypoint windows from the
flyPath span's `knotSecs` (`[previous knot, this knot]`), tails from the effect's own `over`/window (perpetual
osc to `durationSec`), `errors` from `compile.error.paths`, each trimmed to its longest prefix that exists in the draft (Task 0.4: an
error can name a child of a resolved `aimAt`), duration strings via `formatDuration` (`end` for a
perpetual osc, `∞` for a looping spin, `–` unresolved), label/writes/family from `ROW_KINDS`, and `cueSecs`
from step starts, cue times and End.

- [x] Test (fixtures compile with the real `compileClip`) `an overlapped seq's second child starts overlap
      seconds early`.
- [x] Test `collapsing a group hides its descendants and keeps the group row`.
- [x] Test `fork children are background rows with their own window`.
- [x] Test `waypoint rows span consecutive knot times and the last is Settle`.
- [x] Test `a group writes the union of its children's families`.
- [x] Test `an invalid compile marks exactly the culprit rows` (`all([dollyTo(300, 4), dollyTo(500, 6)])`).
- [x] Test `without a compile every row is unresolved` (`startSec` null, duration `–`).
- [x] Test `an error inside a resolved lookAtId marks the lookAtId row` (two `lookAtId`s overlapping in one `all`).

### Task 2.5: ruler steps and snapping

**Files:** `packages/studio/src/timeline/utils/{rulerSteps,snapTime}.ts`, tests

- `rulerSteps(spanSec: number, trackPx: number): { major: number; minor: number }`: port of
  `src/dev/mocks/studio/rulerSteps.ts` (ladder, ≥ 64 px between labels, minor a fifth).
- `snapTime(sec: number, targets: readonly number[], secPerPx: number): { sec: number; snapped: number | null }`:
  snaps within 6 px.

- [x] Test `rulerSteps: 24 s over 900 px is 2 s / 0.4 s; 40 s is 5 s / 1 s`.
- [x] Test `snapTime snaps within 6 px to the nearest target and not beyond`.

### Task 2.6: composed selectors

**Files:** `packages/studio/src/timeline/utils/compileTimeline.ts`,
`packages/studio/src/timeline/state/{selectTimelineCompile,selectTimeline,selectSelectedRow}.ts`, tests

- `compileTimeline(resolved: ClipData, frame: OrientationFrameId): TimelineCompile`: `compileClip` with
  `ORIENTATION_FRAMES[frame]`; a `ClipCompileError` becomes `{ ok: false, … }`; any other throw rethrows.
- `selectTimelineCompile`: `createSelector` over `selectCurrentResolution` and `selectPreview`; `null` while
  unresolved or failed to resolve.
- `selectTimeline`: over draft, compile, collapsed → `buildTimeline`; `null` with no draft.
- `selectSelectedRow`: the selected `TimelineRow` or `null`.

- [x] Test `the timeline is unresolved until the current revision resolves, then timed`.
- [x] Test `an edit that breaks the clip yields an error timeline with the culprits marked` (store-level:
      open, resolve, `paramEdited` an overlap past its step, resolve again).

---

## G3: Primitives

All components: CSS module beside the `.tsx`, tokens only, hover behind `@media (hover: hover)`, focus ring
visible. Component and hook files hold only their symbol and `Props` (constants to `<Name>.constants.ts`).

### Task 3.1: glyph registry and `Glyph`

**Files:** `packages/studio/src/primitives/data/glyphPaths.ts`, `packages/studio/src/primitives/components/Glyph/{Glyph.tsx,Glyph.module.css}`

`GLYPH_PATHS: Record<GlyphId, string>`: one 16-unit stroke path `d` per id, ported from the mock's
`StudioDGlyph` table (add `aimAlong`). `Glyph({ id, className })` renders an `aria-hidden` svg. No test
(a rendered path restates the table).

### Task 3.2: `StudioTip`

**Files:** `packages/studio/src/primitives/components/StudioTip/{StudioTip.tsx,StudioTip.module.css,StudioTip.constants.ts}`,
`packages/studio/src/primitives/data/tipWarmth.ts` (the shared warm-up deadline, a one-field mutable record),
`packages/studio/tests/primitives/components/StudioTip.test.tsx`

Port of the mock (name, meaning, keys, state line; manual popover; 150 ms open, warm reopen; focus-visible
opens; Escape closes; the pointer can rest on the tip). jsdom lacks the Popover API: stub
`showPopover`/`hidePopover` in the test file.

- [x] Test `focus-visible opens the tip and Escape closes it`.
- [x] Test `moving the pointer from the anchor onto the tip keeps it open`.

### Task 3.3: `Kbd`

**Files:** `packages/studio/src/primitives/components/Kbd/{Kbd.tsx,Kbd.module.css}`. A dim key chip; a
`onPrimary` prop keeps 4.5:1 on primary buttons. No test.

### Task 3.4: inspector grid primitives

**Files:** `packages/studio/src/primitives/components/{InspectorPanel,InspectorHead,InspectorSection,InspectorRow,NumberField,PickField,SegmentedField,ReadoutField,AlertChip}/` (each `.tsx` + `.module.css`),
`packages/studio/tests/primitives/components/{NumberField,InspectorRow}.test.tsx`

Split of the mock's `InspectorGrid.tsx` into one component per file; the panel defines the
`label | control | unit | reset` grid columns, rows use subgrid. `InspectorRow` dots its label and opens a
`StudioTip` when it has a `tip`; shows `↺` when `onReset` is given; `dim` styles a default value.
`NumberField({ value, step, min, onCommit(value, gesture) })`: click or Enter to type, Enter commits, Escape
reverts, ↑/↓ step (⇧ ×10); one gesture id per focus session; unparsable text stays in the field with
`aria-invalid`. `PickField` is a styled native `<select>`.

- [x] Test `NumberField commits the typed value on Enter and reverts on Escape`.
- [x] Test `NumberField arrow steps share one gesture id until blur`.
- [x] Test `NumberField keeps unparsable text and marks it invalid without committing`.
- [x] Test `InspectorRow reset calls onReset and is labelled for its field`.

---

## G4: Shell and timeline view

Design reference: the mock's `StudioD.tsx`, `StudioDTrack.tsx`, `TopBar.tsx` and the round-2 shots. Copy per
ui-ux.md and the naming table: no sentences anywhere. Components read through `useAppSelector` /
`useAppDispatch` from `src/store/hooks.ts`.

### Task 4.1: outline rows and track lanes

**Files:** `packages/studio/src/timeline/components/{TimelinePane,OutlineRow,TrackLane}/`,
`packages/studio/src/timeline/components/marks/{StartMark,BarMark,CueMark,GapMark,GroupMark,RateMark,OscMark,CompositeMark,KnotMark}/`,
`packages/studio/src/timeline/components/TrackLane/TrackLane.constants.ts` (`TRACK_MARKS: Record<MarkShape, ComponentType<MarkProps>>`),
`packages/studio/tests/timeline/components/TimelinePane.test.tsx`

Columns: rails + twisty | glyph | Name | Op Value | Dur | channel slots, then the lane. Value sits at one x at
every depth; Dur right-aligned, dim, `tabular-nums`. Lanes draw ancestor group bands, then the row's mark at its
true window; a cue with a tail draws its fade/show/hide extent; rows inside a fork carry the background tag.
Slice 1 draws overlapping steps as plain bars: the crossfade treatment waits on Q14. A composite is a flat lane
with labelled knots (the speed curve, Q19, needs evaluation; slice S5). Unresolved rows draw no mark. Rows with
errors get `aria-invalid`, `⚠` in Dur and an error outline on the mark.

- [x] Test `clicking a row selects it; clicking its twisty toggles collapse without selecting`.
- [x] Test `an invalid row is marked invalid and shows the warning in its duration`.

### Task 4.2: ruler, playhead and scrub

**Files:** `packages/studio/src/timeline/components/{Ruler,Playhead,ZoomControls}/`, `packages/studio/tests/timeline/components/Ruler.test.tsx`

Sticky ruler: ticks from `rulerSteps`, first label carries the unit, channel-tinted notches at `cueSecs`, End
flag (`End 20 s`, or `Loop` for a looping clip) with an `after end` zone, the head showing `formatTimecode`.
Click to seek, drag to scrub; snap to `cueSecs` (⌥ off, ⇧ fine ×0.1); Home/End. Zoom −/Fit/+ beside the
ruler, `viewportSet`. The playhead line is 1 px `--color-fg` with a `--surface-card-strong` halo, above marks.

- [x] Test `clicking the ruler near a step edge seeks to the edge`.
- [x] Test `holding Alt seeks to the exact pointer time`.

### Task 4.3: top bar

**Files:** `packages/studio/src/shell/components/TopBar/`, `packages/studio/tests/shell/components/TopBar.test.tsx`

Left: clip label (`clipRegistry[id].label`), `Hand-written` tag, status (`● Unsaved` `role="status"` when dirty;
`Resolving subjects` while unresolved; a compile error as one compact line `role="alert"` built from
`reason`/`channel`/the culprit rows' names and times, e.g. `⚠ Distance · 2 writers · 4–10 s`). Right: Undo /
Redo naming their edit, Close (`exitTakeover`) with `Esc`. Icon-only where the glyph is unambiguous, keys in
`Kbd`, one primary action (none in slice 1: saving is S8).

- [x] Test `Undo names the last edit and is disabled with nothing to undo`.
- [x] Test `Close ends the takeover`.
- [x] Test `a compile error shows one alert line naming the culprit`.

### Task 4.4: keys

**Files:** `packages/studio/src/shell/data/studioKeys.ts`, `packages/studio/src/shell/hooks/useStudioKeys.ts`,
`packages/studio/src/shell/components/KeyBar/`, `packages/studio/tests/shell/hooks/useStudioKeys.test.tsx`

One key table feeds both the handler and the key bar (Interaction rule 6: a key is printed where it is used):
↑/↓ select previous/next visible row, ←/→ fold/unfold, ⌘Z / ⇧⌘Z undo/redo, Home/End playhead, Escape clears the
selection. The handler sits on the dock root and stops propagation only for keys it handled, so the app's
document-level shortcuts never see them; an unhandled Escape (nothing selected) bubbles to the app, which ends
the takeover. Ignored while typing in a field. The key bar also carries the channel-family legend and the mark
legend.

- [x] Test `ArrowDown selects the next visible row`.
- [x] Test `Escape with a selection clears it and does not reach a document listener`.
- [x] Test `Escape with no selection reaches the document`.
- [x] Verify (and say in the reply) whether the app's keyboard listener runs in the capture phase; if it does,
      stop-propagation cannot pre-empt it: report instead of working around it.

### Task 4.5: the dock

**Files:** `packages/studio/src/shell/components/{StudioDock,DockGrabber,NarrowNotice}/`,
`packages/studio/src/shell/hooks/useDockHeight.ts`, `packages/studio/tests/shell/components/StudioDock.test.tsx`

`StudioDock({ clipId })` composes top bar, timeline pane and key bar in an opaque `--surface-card-strong` dock
(no renderer bleed); Task 6.1 adds the inspector column. `DockGrabber` is a `role="separator"` with drag and
↑/↓ keys; `useDockHeight` remembers the height per viewer through `src/utils/storage/readPersisted.ts` /
`persistValues.ts` (wrapped reads), clamped so the 3D view keeps ≥ 35% (Q12). Below the narrow breakpoint
(`useIsMobile`), `NarrowNotice` replaces the body: `Needs a wider screen` and Close (Q13; Play arrives in S4).
Empty timeline: `No steps`. Unresolved: rows render, lanes empty, the top bar says so.

- [x] Test `the grabber's arrow keys resize the dock within its clamp`.
- [x] Test `a narrow viewport shows the notice with Close`.

---

## G5: Inspector

### Task 5.1: field controls

**Files:** `packages/studio/src/inspector/data/fieldControls.ts`, `packages/studio/tests/inspector/data/fieldControls.test.ts`

`FIELD_CONTROLS: Record<FieldControl, { widget: 'number' | 'pick' | 'toggle' | 'readout'; unit?: string; step?: number; min?: number; toDisplay?(stored): number | string; fromDisplay?(shown): number | string }>`.
`degrees`/`degreesPerSec` store radians, `percent` stores 0–1, `seconds` and `mpc` store as shown. Pick options
for `ease` (the `Ease` union) and `channel` (`Channel`) come from data the engine already exports, not a copy.

- [x] Test `degrees round-trip: 63° stores 1.0996 rad and shows 63°` (hand-computed).
- [x] Test `percent round-trip: 40 % stores 0.4`.

### Task 5.2: `FieldRow`

**Files:** `packages/studio/src/inspector/components/FieldRow/`, `packages/studio/tests/inspector/components/FieldRow.test.tsx`

Renders one `FieldSpec` against a subject with the widget from `FIELD_CONTROLS`; absent param shows
`fallback` dim; editing dispatches `paramEdited({ ref, param, value: fromDisplay(shown), label: spec.label, gesture })`;
`↺` dispatches `value: undefined`; `readOnly` or `readout` renders `ReadoutField`.

- [x] Test `editing Distance to 950 dispatches one paramEdited with 950 and the field label`.
- [x] Test `reset clears an optional param` (`fade` on an `osc`).
- [x] Test `a degrees field dispatches radians`.

### Task 5.3: `Inspector`

**Files:** `packages/studio/src/inspector/components/Inspector/`, `packages/studio/src/inspector/utils/rowContext.ts`,
tests mirrored

Selected row → head (glyph tinted by family, eyebrow `<Name> · <parent name> i/n` from `rowContext`, range
`7.0–11.0 s`, title from the label), fields grouped by `section`, the Resolved line for subject kinds
(`ROW_KINDS[kind].resolved` over `effectAt(resolution.data, path)`), and an `AlertChip` per error on the row.
Nothing selected → the clip head (label, duration, `Start` readout). Dense property grid, no helper sentences.

- [x] Test `rowContext names the parent and the position among its siblings`.
- [x] Test `selecting a subject-bound row shows its Resolved line`.
- [x] Test `a selected invalid row shows its error chip as an alert`.

---

## Task 6.1: mount and finish (controller)

**Files:** `src/components/StudioHost/StudioHost.tsx` (new), `src/components/App/App.tsx`,
`packages/studio/src/studioEntry.ts`, `packages/studio/src/shell/components/StudioDock/StudioDock.tsx`,
`docs/BACKLOG.md`, `docs/backlog/2026-11-10-clip-studio-engine-groundwork.md` (new)

- `StudioHost`: when `selectTakeoverSource(state)?.kind === 'studio'`, render a `React.lazy` `StudioDock` from
  `studioEntry` inside `Suspense` (fallback `null`). `App` mounts it once.
- `studioEntry` exports `StudioDock`; the dock gains the `Inspector` column.
- Backlog: one index line `Clip studio engine groundwork (scene tracks, seek, PiP rig, detach, save) — ready
  after slice 1 → [details]`; the detail file carries the Later slices table below.
- DoD smoke (below), shots to the user as a dash check.

---

## Later slices (outline, each its own plan)

| Slice | Content | Why it is separate |
| --- | --- | --- |
| S2 Structure edits | Add from a palette, delete, duplicate, wrap/unwrap (seq/all), reorder (keys + drag), edge-drag `over`, blend-overlap drag, join objects and the crossfade treatment once Q14 is ruled | Pure reducers over the draft; needs the Q14 ruling and drag affordances, no engine |
| S3 Scene as pure tracks (Q1, Q2) | Compile cues into per-address tracks evaluated every frame; replaces edge-triggered cue firing for every clip; clips revert their scene at end (`cosmicFlows` behaviour change called out) | Engine change with app-wide reach; scrubbing is only truthful after it |
| S4 Seek and transport | `clipPlayer` pause/seek, the studio drives the preview from the playhead, Play/Pause/Loop, after-end frame, "Use current view" on camera steps (Q6, Q23), Play on the narrow notice | Needs S3; first slice where the 3D view follows the timeline |
| S5 Path overlay | The clip-path inspector's route, look-at line and frustum at the playhead, fed by the studio's resolved draft; Fly tuning in the inspector; the composite speed-curve lane (Q19) and knot drags (Q18) | Reuses `computeClipPath`; needs evaluation at the playhead (S4) |
| S6 PiP view rig (Q21) | A third view rig: edit camera main view plus an inset camera into its own texture and a composite pass; per-view scale-band fades, LOD, data demand, body slabs; `views` state, swap | Engine groundwork on the view-rig seam, priced with `npm run perf` |
| S7 Detached window (Q24, Q25) | Either view into a popup whose canvas is configured on the main device | Spike first: cross-window canvas context, rAF throttling when hidden |
| S8 Save to TS (Q4, Q5, Q11) | `ClipData` → `effectHelpers` source codegen with `@generated` header, dev-server write endpoint, in-place overwrite of hand-written clips with the one-time inline note, save status states, reopen by evaluation; the studio mocks under `src/dev/mocks/studio*` are deleted in this slice's PR | Dev-only file writes; needs the round-trip proven on every registry clip |

---

## Definition of Done

**Deliverables**
- `packages/studio/` with README; root typecheck, lint and test cover it; `studioImportBoundary` green.
- `CompiledClip.spans`, `EffectSpan.knotSecs`, `ClipCompileError` (paths, reason, partial spans).
- Root reducer on `combineSlices`; ADR 0016; `withFrozenClockSaga`; `#studio=<clipId>` takeover route.
- `ROW_KINDS` covering every `Effect['kind']` plus `start` and `waypoint`.
- Backlog index line + detail file for the engine groundwork.

**Smoke** (cloud: `VITE_DATA_BASE_URL=https://skymap-data.rulkens.com npm run dev`; shoot each with
`npm run shot -- 'http://localhost:5173/#studio=<id>' --url http://localhost:5173 --size 1728x1000`, then
`--size 400x850`)
- `#studio=cosmicFlows`: rows Start, Wait, Hide, Fade, Set, Bob tilt (background, to End), Turn speed,
  Together groups; bars at the compiler's times; End flag at the clip's duration.
- `#studio=famousFlythrough`: Fly row with 12 knots on its lane; waypoint rows folded; unfold shows Pass ×11 and
  Settle with consecutive windows.
- `#studio=flowOrbit`: the End flag reads Loop.
- `#studio=tourApproachM31`: bound steps show `→ ◎M31`; the inspector's Resolved line gives numbers.
- `#studio=earthFlyout`: opens at the frozen instant; the clock stays paused while open and resumes on Close.
- `#studio=tourCosmicWeb`: a long clip; ruler labels switch to `m:ss` past 60 s; zoom +/Fit/− keep the head
  visible.
- `#studio=nope`: nothing opens.
- Select a Distance step, type a new value: bar, Dur and `● Unsaved` update; Undo names it and restores; Undo
  back to the start clears `● Unsaved`; Redo.
- On cosmicFlows, raise the inner seq's Blend past its step: the seq row and the top bar show the error, bars stay
  at true times; Undo clears it.
- Keyboard only: ↑/↓ moves the selection, ←/→ folds, Escape clears the selection, a second Escape closes the
  studio; reopening the same link shows the unsaved draft.
- Drag the dock's top edge; reload: the height is kept; it never covers more than 65% of the viewport.
- 400 px wide: `Needs a wider screen` with Close.

**Deferral boundary** (do not chase): the 3D view following the playhead, Play/Loop, scene scrubbing,
structure edits, crossfade/join treatment (Q14 open), speed-curve lane, path overlay, PiP and detach, saving
and the save states, subject display names (slice 1 shows the FocusId), "Use current view", Close-with-unsaved
dialog.
