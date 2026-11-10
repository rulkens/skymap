# Clip studio S2 (structure edits): implementation plan

> **For agentic workers:** execute with `subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md): the dispatches below group consecutive tasks by cognitive
> locality; one commit per task; one whole-branch review at the end; CI is the gate.

**Goal:** add, delete, duplicate, wrap, unwrap and reorder steps (one row or a multi-row selection), drag a step's
length, and select and set the joins of a Sequence with the T1 crossfade treatment, every edit one named undo step.

**Spec:** [`docs/superpowers/specs/2026-11-10-clip-studio-s2-structure-edits.md`](../specs/2026-11-10-clip-studio-s2-structure-edits.md)
(the reviewer's document). **Decisions:** [`docs/grill-sessions/clip-studio-2026-11-07.md`](../../grill-sessions/clip-studio-2026-11-07.md).
**Slice 1:** [`2026-11-10-clip-studio-package.md`](2026-11-10-clip-studio-package.md) (A1–A8 vocabulary).

**Follows the spec's recommendations on Q-A to Q-K** until the owner rules otherwise; a ruling that differs changes
the tasks named beside it in the spec's §9.

**Starts after** the object-picker work on `feat/clip-studio` is committed (it edits `FieldRow`, `RowInspector`,
`OutlineRow`, `TimelinePane`, `BarMark`, `rowKinds`, `subjectKinds`). Run the pre-flight conflict scan against
whatever is uncommitted then. P1 and the S3 plan
([`2026-11-10-clip-studio-s3-scene-tracks.md`](2026-11-10-clip-studio-s3-scene-tracks.md)) both edit
`compileClip.ts`; whichever lands second adapts its walk change to the other's.

**Tech:** as slice 1. Component tests opt into jsdom per file. Store-level tests use
`packages/studio/tests/helpers/openStudioStore.ts`.

---

## Dispatches

| # | Tasks | Model | Why together |
| --- | --- | --- | --- |
| D1 | P1–P4 (ground preparation) | Opus | each its own commit, before any feature commit; three are `review: yes` |
| D2 | 1.1–1.6 (structure core) | Opus | pure draft utils and the slice that commits them; one mental model (lists, remap, joins, history) |
| D3 | 2.1–2.5 (selection, actions, keys, palette, leftovers) | Sonnet | inspector and shell surfaces over D2's actions |
| D4 | 3.1–3.6 (joins, taper, lane drags, row drag) | Sonnet | the timeline's lanes and pointer gestures |
| D5 | 4.1 (controller) | — | docs, smoke, shots |

PR packaging of D1 (own PR or on this branch) is the owner's call at the checkpoint (spec Q-J); either way P1–P4
are their own commits, first.

---

## File structure

**Created**

```
src/@types/animation/SeqOverlapEntry.d.ts                         P1
packages/studio/src/@types/rows/RowDetail.d.ts                     P2
packages/studio/src/timeline/utils/detailsOf.ts                    P2
packages/studio/src/@types/session/StudioSelection.d.ts            P3
packages/studio/src/@types/rows/{JoinRef,ListSlot,DraftList,StructureEdit,WrapGroup}.d.ts   1.1
packages/studio/src/@types/session/{DraftChange,SelectionEditId,SelectionEditResult}.d.ts   1.1
packages/studio/src/draft/utils/lists/{slotOf,listAt,canPlace,topMost,insertRows,removeRows,moveRows,
  duplicateRows,insertionSlot}.ts                                  1.2, 1.4
packages/studio/src/draft/utils/groups/{wrapRows,unwrapRow}.ts     1.4
packages/studio/src/draft/utils/joins/{joinEntry,joinPairs,realignJoins,setJoins}.ts      1.3
packages/studio/src/session/utils/{commitStructure,selectionEdit,editLabel}.ts            1.5, 1.6
packages/studio/src/timeline/utils/{clickSelection,clickJoinSelection}.ts                  2.1
packages/studio/src/kinds/data/paletteDefaults.ts                  2.2
packages/studio/src/kinds/utils/paletteItems.ts                    2.2
packages/studio/src/@types/kinds/PaletteItem.d.ts                  2.2
packages/studio/src/inspector/components/{SelectionActions,MultiInspector,JoinInspector}/  2.3, 3.3
packages/studio/src/timeline/components/AddPalette/                2.5
packages/studio/src/timeline/utils/{seqJoinDetails,edgeValue,joinDragEntry}.ts             3.1, 3.4, 3.5
packages/studio/src/timeline/utils/drop/dropTarget.ts              3.6
packages/studio/src/timeline/components/TrackLane/{useEdgeDrag,useJoinDrag}.ts             3.4, 3.5
packages/studio/src/timeline/components/TimelinePane/useRowDrag.ts 3.6
packages/studio/tests/…  mirrors of the above that the tasks name
```

**Modified**

```
src/@types/animation/{SeqOverlap,SeqSteps}.d.ts, src/services/engine/animation/{validateSeqOverlap,
  compileClip,resolveSeqJoins}.ts, docs/animation/clip-primitives.md                        P1
packages/studio/src/kinds/utils/blendOf.ts                                                   P1
packages/studio/src/@types/rows/TimelineRow.d.ts, timeline/utils/buildTimeline.ts,
  timeline/components/marks/{CompositeMark,OscMark}/, timeline/components/OutlineRow/       P2
packages/studio/src/@types/session/{StudioState,HistoryEntry}.d.ts, session/state/{studioSlice,
  initialState,selectors}.ts, session/utils/{commitDraft,stepHistory}.ts                     P3, 1.5, 1.6
packages/studio/src/timeline/state/{selectSelectedRow,selectSelectionStandInId}.ts,
  timeline/utils/selectionRelation.ts, timeline/components/{TimelinePane,OutlineRow,TrackLane}/   P3, 2.1
packages/studio/src/session/sagas/resolveDraftSaga.ts                                        P4
packages/studio/src/@types/kinds/RowKindSpec.d.ts, kinds/data/{cameraKinds,subjectKinds,sceneKinds,
  structureKinds,rowKinds}.ts                                                                2.2, 3.3
packages/studio/src/inspector/components/{Inspector,RowInspector}/,
  primitives/components/{InspectorHead,AlertChip}/                                           2.3
packages/studio/src/shell/{data/studioKeys.ts,@types/StudioKey.d.ts,@types/StudioKeyId.d.ts,
  utils/runStudioKey.ts,hooks/useStudioKeys.ts,components/KeyHelp/}                          2.4
packages/studio/src/timeline/components/marks/{BarMark,GroupMark}/                           3.2
packages/studio/README.md, docs/design/clip-studio/HANDOFF.md (if still present)             4.1
```

---

## D1: Ground preparation

### Task P1: a seq join can be `'stop'` **review: yes**

**Files:** `src/@types/animation/SeqOverlapEntry.d.ts` (new), `src/@types/animation/SeqOverlap.d.ts`,
`src/@types/animation/SeqSteps.d.ts`, `src/services/engine/animation/validateSeqOverlap.ts`,
`src/services/engine/animation/compileClip.ts` (`walkOverlappedSeq`, ~line 171),
`src/services/engine/animation/resolveSeqJoins.ts` (`joinOf`, ~line 75),
`packages/studio/src/kinds/utils/blendOf.ts`, `docs/animation/clip-primitives.md` ("Blending a seq" table and the
overlap paragraph), `tests/services/engine/animation/{compileClip,resolveSeqJoins}.test.ts`

**Contract:**

```ts
/** One join of an overlapped seq: seconds the next step starts early (0 = abutting, a matched join), or 'stop'
 *  (abutting, and every channel rests there, as in a seq without overlap). */
export type SeqOverlapEntry = number | 'stop';
export type SeqOverlap = number | SeqOverlapEntry[];   // a scalar stays a number: absent already means every join stops
// SeqSteps gains:
readonly stops: readonly boolean[];   // one per join, true where the entry is 'stop'
```

- `'stop'` times exactly like `0`; it counts as one array entry (the entry-count rule is unchanged).
- `resolveSeqJoins`: a writer pair that parts at a join whose entry is `'stop'` (any join between their two spans)
  keeps today's rest rule, as a pair parting in no overlapping seq does: no `blendIn`, no Hermite curve, no refusal.
- `blendOf` ignores `'stop'` entries. `effectHelpers.seq` needs only the widened type.

- [ ] Test `a 'stop' join times like 0 and rests`: `seq([dollyTo(300, 4), dollyTo(900, 4)], { overlap: ['stop'] })` →
      child spans `[0,4]` and `[4,8]`; both distance segments keep their `ease` curve (with `[0]` they turn Hermite,
      the existing matched-join test).
- [ ] Test `a 'stop' join beside a blend`: three `dollyTo` steps of 4 s with `overlap: [1, 'stop']` → the second
      segment carries `blendIn` `[3,4]`; the third starts at 7, has no `blendIn` and keeps `ease`.
- [ ] Test `a 'stop' entry counts as a join entry`: `overlap: ['stop']` over three steps with a duration throws
      reason `seqOverlap` ("1 entries but the seq has 2 joins").
- [ ] Docs: the table gains a row "abutting at a `'stop'` entry → rest"; the example block shows
      `{ overlap: [1, 'stop', 0] }`.
- [ ] `npm test -- animation` green.

### Task P2: per-kind row extras become one `details` list

**Files:** `packages/studio/src/@types/rows/RowDetail.d.ts` (new), `packages/studio/src/@types/rows/TimelineRow.d.ts`,
`packages/studio/src/timeline/utils/detailsOf.ts` (new), `packages/studio/src/timeline/utils/buildTimeline.ts`,
`packages/studio/src/timeline/components/marks/{CompositeMark,OscMark}/*.tsx`,
`packages/studio/src/timeline/components/OutlineRow/OutlineRow.tsx`, the tests that read `knotSecs`, `wave` or
`members` (`buildTimeline.test.ts`, `oscWaveAt.test.ts`, `TimelinePane.test.tsx`)

**Contract:**

```ts
/** Kind-specific data a row's views draw; a closed union, so a view picks its kinds and never null-checks fields. */
export type RowDetail =
  | { readonly kind: 'knot'; readonly sec: number; readonly waypoint: number }
  | { readonly kind: 'wave'; readonly wave: OscWave }
  | { readonly kind: 'members'; readonly members: readonly RowMember[] };
// TimelineRow: knotSecs?, wave?, members? → readonly details: readonly RowDetail[]   ([] for most rows)
export function detailsOf<K extends RowDetail['kind']>(row: TimelineRow, kind: K): Extract<RowDetail, { kind: K }>[];
```

Pure refactor, no behaviour change: no new test; the existing assertions move to `detailsOf`.

- [ ] Replace the three fields; `buildTimeline`'s `extra` parameter becomes `details`.
- [ ] `npm test -- packages/studio` green for the touched files.

### Task P3: the selection becomes a set (rows arm) **review: yes**

**Files:** `packages/studio/src/@types/session/StudioSelection.d.ts` (new), `.../session/StudioState.d.ts`,
`packages/studio/src/session/state/{studioSlice,initialState}.ts`,
`packages/studio/src/timeline/state/{selectSelectedRow,selectSelectionStandInId}.ts` (the latter renamed, file and
test mirror included, with `npm run refactor -- rename packages/studio/src/timeline/state/selectSelectionStandInId.ts#selectSelectionStandInId selectSelectionStandInIds`),
`packages/studio/src/shell/utils/runStudioKey.ts`, `packages/studio/src/timeline/components/TimelinePane/TimelinePane.tsx`,
the tests that read `selectSelection` or the stand-in

**Contract:**

```ts
export type StudioSelection = {
  readonly kind: 'rows';
  /** Outline order. */
  readonly refs: readonly RowRef[];
  /** Where a ⇧-click range starts and ↑/↓ move from. */
  readonly anchor: RowRef;
};
// StudioState.selection: StudioSelection | null
// rowSelected(RowRef | null) keeps its payload: stores { kind: 'rows', refs: [ref], anchor: ref } or null.
// selectSelectedRow: the row when exactly one row is selected, else null (the inspector's single-row read).
// selectSelectionStandInIds: readonly string[], one id per selected row (its folded stand-in), deduped.
// runStudioKey: ↑/↓ move from the anchor's stand-in; Escape clears a non-null selection.
```

Behaviour unchanged (every selection still has one row): no new test.

- [ ] Sweep the five consumers; `TimelinePane` marks a row selected when its id is in the stand-in list.
- [ ] `npm run typecheck:fast`, studio tests green.

### Task P4: resolution follows the revision **review: yes**

**Files:** `packages/studio/src/session/sagas/resolveDraftSaga.ts`,
`packages/studio/tests/session/sagas/resolveDraftSaga.test.ts` (new)

**Contract:** `resolveDraftSaga` resolves the opening revision, then after every action compares `selectRevision`
with the last one it started; on a change it cancels the pending resolve and starts the new one. `REVISION_ACTIONS`
goes. Any reducer that bumps `revision` is resolved with no list to keep.

- [ ] Test (fails before the change) `switching the start mode resolves the new revision`: open, resolve,
      `startModeSet('live')` → `selectCurrentResolution` is non-null for the new revision.
- [ ] Test `an action that keeps the revision starts no resolve`: after a resolve, `rowSelected(…)` lands no
      `draftResolved`.
- [ ] Existing session-saga tests stay green.

---

## D2: Structure core (pure, then the slice)

### Task 1.1: contract types

**Files:** new `.d.ts` files, one type each. No test (types).

```ts
// @types/rows/
/** The `index`-th join of the Sequence at `seq`, counted between its children that have a duration. */
export type JoinRef = { readonly seq: EffectPath; readonly index: number };
/** Before `index` in the list `owner` holds: [] the top level, a seq/all/fork path its children, a flyPath path its waypoints. */
export type ListSlot = { readonly owner: EffectPath; readonly index: number };
export type DraftList =
  | { readonly kind: 'effects'; readonly items: readonly Effect[]; readonly max: number }   // Infinity; 1 for a fork
  | { readonly kind: 'waypoints'; readonly items: readonly PathWaypoint[] };
export type WrapGroup = 'seq' | 'all' | 'fork';
/** A structure edit's result; utils return null when the edit is refused. */
export type StructureEdit = {
  readonly draft: ClipData;
  /** Where each effect path of the old draft went: its new path, or null when the edit removed it. */
  readonly remap: (path: EffectPath) => EffectPath | null;
  /** The rows to select after the edit, in outline order; [] selects nothing. */
  readonly selected: readonly RowRef[];
};
// @types/session/
// StudioSelection gains:  | { readonly kind: 'joins'; readonly refs: readonly JoinRef[] }
/** Path-keyed state belongs to its draft, so a commit and an undo entry carry all three. */
export type DraftChange = {
  readonly draft: ClipData;
  readonly selection: StudioSelection | null;
  readonly collapsed: readonly string[];
};
export type SelectionEditId =
  | 'delete' | 'duplicate' | 'wrapSeq' | 'wrapAll' | 'wrapFork' | 'unwrap' | 'moveUp' | 'moveDown';
export type SelectionEditResult = { readonly action: UnknownAction } | { readonly refused: string };
```

### Task 1.2: list utils: place, insert, remove, move

**Files:** `packages/studio/src/draft/utils/lists/{slotOf,listAt,canPlace,topMost,insertRows,removeRows,moveRows}.ts`,
mirrors in `packages/studio/tests/draft/utils/lists/`

**Signatures:**

- `slotOf(ref: RowRef): ListSlot | null` (Start → null; an effect at P → owner `P[:-1]`; a waypoint → owner its path).
- `listAt(draft: ClipData, owner: EffectPath): DraftList | null` (null for a leaf that holds no list).
- `topMost(refs: readonly RowRef[]): RowRef[]` (drops refs inside another selected ref; keeps outline order).
- `canPlace(draft, kind: DraftList['kind'], slot: ListSlot, moving?: readonly RowRef[]): boolean`: the list kind
  matches, the index is in range, the list has room (a fork's list counts its own child as free when that child is
  moving), and the slot is not inside a moving block. Every insert, move and drop asks this; nothing else decides
  placement.
- `insertRows(draft, slot, items: readonly (Effect | PathWaypoint)[]): StructureEdit | null`
- `removeRows(draft, refs): StructureEdit | null`: top-most refs; Start ignored; null when nothing removable is left
  (only Start, or a fork's lone child whose fork is not also selected).
- `moveRows(draft, refs, to: ListSlot): StructureEdit | null`: `to` addresses the draft **before** the move; the rows
  land where that slot was.

Every util copies only the spines it changes (the `updateEffectAt` discipline) and, for each Sequence list it changes,
calls `realignJoins` (Task 1.3; land 1.2 with a pass-through and wire it in 1.3, or order 1.3 first: implementer's
choice, one commit each).

- [ ] Test `removeRows deletes a nested step and remaps later siblings`: `seq([A, B, C])`, remove `[0,1]` → children
      `[A, C]`; `remap([0,2])` → `[0,1]`, `remap([0,1])` → null, `remap([0])` → `[0]`; selected → `[0,1]` (C).
- [ ] Test `removeRows keeps untouched subtrees by identity`.
- [ ] Test `removeRows refuses a fork's lone child, and deletes it with its fork`.
- [ ] Test `removeRows deletes one waypoint and leaves effect paths alone`.
- [ ] Test `insertRows puts items before the index, shifts the rest and selects the new rows`.
- [ ] Test `insertRows refuses an effect in a waypoint list and a second child in a fork`.
- [ ] Test `moveRows carries a block and its descendants`: move `seq` at `[1]` (one child) to slot `{ owner: [2],
      index: 0 }` of an `all` → `remap([1,0])` is the child's new path; the fold remap of `[1]` follows.
- [ ] Test `moveRows to a later slot in the same list lands before that slot's row`: `[A, B, C, D]`, move A to
      `{ owner: [], index: 3 }` → `[B, C, A, D]`.
- [ ] Test `moveRows refuses a block into its own descendant`.

### Task 1.3: joins follow structure

**Files:** `packages/studio/src/draft/utils/joins/{joinEntry,joinPairs,realignJoins,setJoins}.ts`, the 1.2 utils
(wire-in), mirrors in tests

**Signatures:**

- `joinEntry(seq: Extract<Effect, { kind: 'seq' }>, index: number): SeqOverlapEntry` (absent → `'stop'`, a number →
  it, an array → its entry).
- `joinPairs(draft: ClipData): (a: Effect, b: Effect) => SeqOverlapEntry | undefined`: every array-overlap seq's
  joins keyed by the two children's object identity.
- `realignJoins(seq, pairs): SeqOverlap | undefined`: a number or absent overlap is returned as is; an array gets one
  entry per join of the new children, `pairs(a, b)` where the two were neighbours, `'stop'` for a new pair; all
  `'stop'` → `undefined`. Zero-length children never form a join (the compiler's `hasDuration`).
- `setJoins(draft, joins: readonly JoinRef[], entry: SeqOverlapEntry): ClipData`: expands a number or absent overlap
  to an array first; all `'stop'` afterwards removes `overlap`.

- [ ] Test `neighbours keep their join and a new pair starts at stop`: four steps, `overlap: [1, 0.5, 0.25]`, remove
      the second → `['stop', 0.25]`.
- [ ] Test `a number overlap is left alone when steps come and go`.
- [ ] Test `a cue added between two blended steps changes no join`.
- [ ] Test `setJoins expands a number to an array and sets one join`: overlap `1`, three steps, join 1 → `[1, 'stop']`.
- [ ] Test `setJoins that leaves every join stop removes overlap`.

### Task 1.4: duplicate, wrap, unwrap, insertion slot

**Files:** `packages/studio/src/draft/utils/lists/{duplicateRows,insertionSlot}.ts`,
`packages/studio/src/draft/utils/groups/{wrapRows,unwrapRow}.ts`, mirrors in tests

**Signatures:**

- `duplicateRows(draft, refs): StructureEdit | null`: per list, copies of its top-most targets in order, inserted
  after its last target; copies are `structuredClone`s; selected = the copies.
- `wrapRows(draft, refs, group: WrapGroup): StructureEdit | null`: one list only; gathered at the first target's
  index in outline order; `fork` takes exactly one ref; selected = the new block.
- `unwrapRow(draft, ref): StructureEdit | null`: a seq/all/fork only; children spliced in place; selected = them.
- `insertionSlot(draft, anchor: RowRef | null, kind: DraftList['kind']): ListSlot`: right after the anchor in the
  nearest enclosing list that `canPlace` the kind (after a fork's child → after the fork; after a waypoint, for
  effects → after its flyPath); Start → `{ owner: [], index: 0 }`; null → the top level's end.

- [ ] Test `duplicateRows puts copies after the last selected row of each list and selects them`.
- [ ] Test `wrapRows gathers non-adjacent siblings at the first one's place`: `[A, B, C, D]` wrap `[0]`, `[2]` in
      `seq` → `[seq(A, C), B, D]`; `remap([2])` → `[0,1]`, `remap([3])` → `[2]`.
- [ ] Test `wrapping two blended steps carries their join into the new Sequence`: `seq([A, B, C], { overlap: [1, 2] })`,
      wrap B and C → the inner seq's overlap is `[2]`, the outer's `['stop']`.
- [ ] Test `wrapRows refuses rows from different lists and a Fork of two`.
- [ ] Test `unwrapRow splices the children in place and selects them`.
- [ ] Test `insertionSlot after a fork's child is after the fork; after a waypoint is after its flyPath`.

### Task 1.5: undo carries selection and folds **review: yes**

**Files:** `packages/studio/src/@types/session/HistoryEntry.d.ts`, `packages/studio/src/session/utils/{commitDraft,stepHistory}.ts`,
`packages/studio/src/session/state/studioSlice.ts` (`paramEdited`, `startModeSet` pass the current selection and
folds), `packages/studio/tests/session/state/studioSlice.test.ts`

**Contract:** `HistoryEntry` gains `selection: StudioSelection | null` and `collapsed: readonly string[]`, the values
**with** its draft. `commitDraft(state, change: DraftChange, label, gesture)` pushes the current three and installs
`change`; `stepHistory` swaps all three. Gesture coalescing is unchanged.

- [ ] Test `undoing a param edit reselects the edited row` (select another row after the edit, undo → the edited row).
- [ ] Test `redo brings back the selection and folds the edit left`.
- [ ] Existing history tests stay green (clean-after-undo still holds by identity).

### Task 1.6: the slice's structure actions and `selectionEdit` **review: yes**

**Files:** `packages/studio/src/session/state/studioSlice.ts`, `packages/studio/src/session/utils/{commitStructure,selectionEdit,editLabel}.ts`,
`packages/studio/tests/session/state/studioSlice.test.ts`, `packages/studio/tests/session/utils/selectionEdit.test.ts`

**Actions** (each structure reducer: run its util on the draft; `null` → no-op, no history, no revision bump; else
`commitStructure`):

| Action | Payload | Util |
| --- | --- | --- |
| `selectionSet` | `StudioSelection \| null` | none (no history) |
| `rowsInserted` | `{ slot; items: readonly (Effect \| PathWaypoint)[]; label }` | `insertRows` |
| `rowsDeleted` | `{ refs; label }` | `removeRows` |
| `rowsDuplicated` | `{ refs; label }` | `duplicateRows` |
| `rowsWrapped` | `{ refs; group: WrapGroup; label }` | `wrapRows` |
| `rowUnwrapped` | `{ ref; label }` | `unwrapRow` |
| `rowsMoved` | `{ refs; to: ListSlot; label }` | `moveRows` |
| `joinsSet` | `{ joins: readonly JoinRef[]; entry: SeqOverlapEntry; label; gesture: string \| null }` | `setJoins`, selection unchanged |

- `commitStructure(state, edit: StructureEdit, label): StudioState`: folds carried through `edit.remap` over
  `effectPaths(old draft)` (dropped when removed); selection from `edit.selected` (anchor = first; `[]` → null);
  then `commitDraft`.
- `editLabel(verb: string, draft: ClipData, refs: readonly RowRef[]): string`: `Delete Distance`, `Delete 3 steps`
  (Names from `ROW_KINDS[kind].label(subject).name`).
- `selectionEdit(id: SelectionEditId, state: RootState): SelectionEditResult`: builds the action for the current
  selection (move: one slot past the block's neighbour) and returns it only when its util accepts the current draft;
  otherwise `{ refused }` in a few words per spec §3.2 (`Select steps in one block`, `Delete the Fork, or unwrap
  it`, …). The key handler and the action row both call it; nothing else builds these actions.

- [ ] Test `a refused structure edit changes nothing` (same state object; history and revision unchanged).
- [ ] Test `undoing a delete restores the row, its fold and the selection it had`.
- [ ] Test `moving a folded group carries its fold to the new path`.
- [ ] Test `joinsSet edits with one gesture coalesce into one Blend entry`.
- [ ] Test `selectionEdit labels a delete by the row's Name, and several rows as N steps`.
- [ ] Test `selectionEdit refuses a wrap across blocks with its reason`.

---

## D3: Selection, actions, keys, palette, leftovers

UI tasks follow ui-ux.md: tokens only, every control's states, hover behind `@media (hover: hover)`, StudioTip
names each icon button and its key (Q30), no sentences in labels. Component and hook files hold only their symbol
and `Props`.

### Task 2.1: click selection and multi-row marks

**Files:** `packages/studio/src/timeline/utils/{clickSelection,clickJoinSelection}.ts`,
`packages/studio/src/timeline/utils/selectionRelation.ts`, `packages/studio/src/timeline/components/{TimelinePane,OutlineRow,TrackLane}/*.tsx`,
tests: `tests/timeline/utils/clickSelection.test.ts`, `tests/timeline/utils/selectionRelation.test.ts`,
`tests/timeline/components/TimelinePane.test.tsx`

```ts
export function clickSelection(
  current: StudioSelection | null,
  clicked: RowRef,
  modifiers: { readonly toggle: boolean; readonly range: boolean },   // ⌘/Ctrl, ⇧
  visible: readonly RowRef[],                                          // outline order
): StudioSelection | null;
export function clickJoinSelection(current: StudioSelection | null, clicked: JoinRef, toggle: boolean): StudioSelection | null;
```

Plain clicks keep dispatching `rowSelected`; modified clicks dispatch `selectionSet(clickSelection(…))`.
`selectionRelation` takes the selected indices (a list) and marks per spec Q47 for each.

- [ ] Test `shift-click selects the visible rows from the anchor to the row and keeps the anchor`.
- [ ] Test `cmd-click toggles a row and makes it the anchor; toggling the last one off clears`.
- [ ] Test `a row click while joins are selected replaces them`.
- [ ] Test `a block holding either of two selected rows is marked as holding the selection`.
- [ ] Test (pane) `cmd-click adds a second row and both rows read selected`.

### Task 2.2: registry growth: palette makers and length params

**Files:** `packages/studio/src/@types/kinds/{RowKindSpec,PaletteItem}.d.ts`,
`packages/studio/src/kinds/data/{cameraKinds,subjectKinds,sceneKinds,structureKinds,rowKinds,paletteDefaults}.ts`,
`packages/studio/src/kinds/utils/paletteItems.ts`, `packages/studio/tests/kinds/data/rowKinds.test.ts`

**Contract:**

```ts
// RowKindSpec<T> gains (required, so every kind decides):
/** The Add palette's makers for this kind, one per entry (set: one per channel); [] = not offered. They call effectHelpers. */
readonly palette: readonly ((pins: PreviewPins) => T)[];
/** The param a right-edge drag changes, or null when the row has no draggable end. */
readonly lengthParam: (subject: T) => 'over' | 'sec' | null;
// kinds/@types
export type PaletteItem = {
  readonly key: string;            // `${kind}:${n}`
  readonly section: string;        // channel-family legend name, or 'Timing' for steps that write no channel
  readonly glyph: GlyphId;
  readonly family: ChannelFamily | null;
  readonly name: string;           // ROW_KINDS[kind].label(made).name
  readonly make: () => Effect;
};
export function paletteItems(pins: PreviewPins): readonly PaletteItem[];   // sections in legend order, Timing last
```

Offered per spec §3.3 (Q-I). Defaults: the pinned start's distance and angles where a value is needed,
`focusId('milkyWay')` for subjects, durations from named constants in `paletteDefaults.ts`. `lengthParam`: `'over'`
for timed moves, subject steps and cues with a tail; `'sec'` for Hold and Wait; `null` for Start, waypoints, blocks,
Fork, Set, Focus and a perpetual Bob (`over` unset).

- [ ] Test `every palette maker builds a step of its own kind with a non-empty Name` (all kinds, fixture pins).
- [ ] Test `every lengthParam names a numeric param of its kind's sample, or is null` (catches a misspelt param).

### Task 2.3: inspector action row, multi-row head, leftovers

**Files:** `packages/studio/src/inspector/components/{SelectionActions,MultiInspector}/` (new),
`packages/studio/src/inspector/components/{Inspector,RowInspector}/*.tsx`,
`packages/studio/src/primitives/components/{InspectorHead,AlertChip}/*.tsx`,
`packages/studio/tests/inspector/components/Inspector.test.tsx`

- `SelectionActions`: icon buttons Duplicate, Sequence, All, Fork, Unwrap, Delete; each calls `selectionEdit` for
  its id; a refusal disables it and its StudioTip shows the reason.
- `Inspector` dispatches on the selection: one row → `RowInspector` (actions in its head); several rows →
  `MultiInspector` (head `N steps`, actions, no fields); joins → `JoinInspector` (Task 3.3).
- Leftover: `InspectorHead` takes `family: ChannelFamily | null` and tints its glyph through `familyStyle`.
- Leftover: `AlertChip` takes `action?: { readonly label: string; readonly onAction: () => void }`; `RowInspector`
  passes `Select both` / `Select all` selecting every culprit row of the compile error (rows with errors in the full
  timeline).

- [ ] Test `the action row's Delete removes the selected step and Undo names it`.
- [ ] Test `a refused action is disabled and its tip says why` (two rows in different blocks → Sequence disabled).
- [ ] Test `an error chip's Select both selects the two culprit rows`
      (`all([dollyTo(300, 4), dollyTo(500, 6)])`).

### Task 2.4: keys

**Files:** `packages/studio/src/shell/@types/{StudioKey,StudioKeyId}.d.ts`, `packages/studio/src/shell/data/studioKeys.ts`,
`packages/studio/src/shell/utils/runStudioKey.ts`, `packages/studio/src/shell/hooks/useStudioKeys.ts`,
`packages/studio/tests/shell/hooks/useStudioKeys.test.tsx`

`StudioKeyId` gains `add`, `delete`, `duplicate`, `wrapSeq`, `wrapAll`, `unwrap`, `moveUp`, `moveDown`; group `Edit`
joins `StudioKey['group']`. Keys: A, Delete and Backspace, ⌘D, ⌘G, ⌥⌘G, ⇧⌘G, ⌥↑, ⌥↓ (spec Q-K). Edit ids run
through `selectionEdit` (a refusal returns null, so the key keeps its default); `add` is the hook's, like `help`
(`useStudioKeys(onToggleKeys, onAdd)`). The `?` overlay lists the Edit group from the table.

- [ ] Test `Delete and Backspace delete the selected step`.
- [ ] Test `Alt+ArrowDown moves the selected step down one place`.
- [ ] Test `Cmd+G wraps the selection in a Sequence`.
- [ ] Test `Backspace while typing in a field deletes no step`.

### Task 2.5: the Add palette

**Files:** `packages/studio/src/timeline/components/AddPalette/` (new: `.tsx`, `.module.css`, `.constants.ts` if
needed), `packages/studio/src/timeline/components/TimelinePane/TimelinePane.tsx` (the `+` button in the outline
head), `packages/studio/src/shell/components/StudioDock/StudioDock.tsx` (opens it on A),
`packages/studio/tests/timeline/components/AddPalette.test.tsx`

Popover under `+`, filter field focused, items from `paletteItems(preview)` grouped by `section`, ↑/↓, Enter or click
dispatches `rowsInserted({ slot: insertionSlot(draft, anchor, 'effects'), items: [item.make()], label: 'Add <name>' })`,
Escape or an outside click closes and returns focus. Reuse `ObjectPicker`'s list behaviour; if it is still
object-specific, extract its list into a primitive in this task's first commit (its own commit).

- [ ] Test `typing filters the palette and Enter adds the match right after the selected step, selected`.
- [ ] Test `Escape closes the palette and focus returns to the + button`.

---

## D4: Joins, taper and lane gestures

### Task 3.1: join and taper details

**Files:** `packages/studio/src/@types/rows/RowDetail.d.ts`, `packages/studio/src/timeline/utils/seqJoinDetails.ts`
(new), `packages/studio/src/timeline/utils/buildTimeline.ts`, `packages/studio/tests/timeline/utils/buildTimeline.test.ts`

```ts
// RowDetail gains:
| { readonly kind: 'join'; readonly join: JoinRef; readonly entry: SeqOverlapEntry; readonly window: TimeWindow }
| { readonly kind: 'taper'; readonly side: 'in' | 'out'; readonly window: TimeWindow }
export function seqJoinDetails(
  seq: Extract<Effect, { kind: 'seq' }>, path: EffectPath, spanAt: (path: EffectPath) => EffectSpan | undefined,
): { readonly own: readonly RowDetail[]; readonly children: ReadonlyMap<number, readonly RowDetail[]> };
```

Join window: `[incoming start, outgoing end]` for a blend, the join instant (zero width) otherwise. A blended join
tapers its outgoing child (`out`) and incoming child (`in`) over that window. Children without spans give no detail.

- [ ] Test `a blended join gives the Sequence a join over the overlap window and tapers both steps`:
      `seq([dollyTo(300, 4), dollyTo(950, 4)], { overlap: [1] })` → join `{ index: 0, entry: 1, window: [3,4] }`,
      child 0 taper `out` `[3,4]`, child 1 taper `in` `[3,4]`.
- [ ] Test `stop and no-stop joins sit on the join instant and taper nothing`.
- [ ] Test `joins skip zero-length children`: `seq([dollyTo(1, 2), show(['flow']), dollyTo(2, 2)], { overlap: 0 })`
      → one join, index 0.

### Task 3.2: T1 taper and join chips

**Files:** `packages/studio/src/timeline/components/marks/{BarMark,GroupMark}/*`,
`packages/studio/src/timeline/@types/MarkProps.d.ts` (a chip click callback), `packages/studio/src/timeline/components/TrackLane/TrackLane.tsx`,
`packages/studio/tests/timeline/components/TimelinePane.test.tsx`

`BarMark` draws its `taper` details per spec §3.7 (linear across exactly the window, no rounded cap, hairlines at the
window edges); replace its "taper is slice S5" comment. `GroupMark` draws a Sequence's `join` details as chips
(`jblend` + `1 s`, `jnostop` + `No stop`, `jstop` + `Stop`; glyph only when narrower than its words; StudioTip
names it); a click calls `clickJoinSelection`. Visual details are checked by shots in 4.1; the test covers behaviour.

- [ ] Test `clicking a join chip selects that join and the inspector shows the join`.

### Task 3.3: the join inspector and the Sequence's joins list

**Files:** `packages/studio/src/inspector/components/JoinInspector/` (new), `packages/studio/src/inspector/components/Inspector/Inspector.tsx`,
`packages/studio/src/kinds/data/structureKinds.ts` (the seq's `overlap` Blend field goes, spec Q-D),
`packages/studio/src/inspector/components/RowInspector/RowInspector.tsx` (a Sequence lists its joins as buttons),
`packages/studio/tests/inspector/components/JoinInspector.test.tsx`

Per spec §3.7: head, `Stop | No stop | Blend` segment (`SegmentedField`), the Blend field (`RangedNumberField`,
0 to the shorter neighbouring step), several joins → `N joins` and no active option while they differ. Choosing
Blend from Stop or No stop sets `min(1, shorter / 2)` s. Each change dispatches `joinsSet` (label `Stop`, `No stop`,
`Blend`; the slider's gesture id).

- [ ] Test `choosing Stop on a blended join sets its entry to stop, and Undo names it Stop`.
- [ ] Test `with two joins selected, Blend sets both`.
- [ ] Test `a Sequence's join button selects that join`.

### Task 3.4: right-edge drag

**Files:** `packages/studio/src/timeline/utils/edgeValue.ts` (new), `packages/studio/src/timeline/components/TrackLane/useEdgeDrag.ts`
(new), `packages/studio/src/timeline/components/TrackLane/TrackLane.tsx`, `TrackLane.module.css`,
`packages/studio/tests/timeline/utils/edgeValue.test.ts`, `packages/studio/tests/timeline/components/TimelinePane.test.tsx`

```ts
/** The length param after a drag: its value at press (or the visible length when unset) plus the delta, floored at 0. */
export function edgeValue(atPress: number | undefined, visibleSec: number, deltaSec: number): number;
```

Handle per spec §3.6 on rows whose `lengthParam` is non-null and whose visible end is known. Pointer down selects
the row; each move snaps the end with `snapTime` (⌥ free, ⇧ a tenth) and dispatches `paramEdited({ ref, param, value,
label: <the length field's label>, gesture })` with one gesture id per drag.

- [ ] Test `edgeValue adds the delta to the value at press and floors at 0`.
- [ ] Test `edgeValue starts an unset param from the visible length`.
- [ ] Test `dragging a bar's right edge commits one undo entry however many moves`.

### Task 3.5: left-edge join drag

**Files:** `packages/studio/src/timeline/utils/joinDragEntry.ts` (new), `packages/studio/src/timeline/components/TrackLane/useJoinDrag.ts`
(new), `packages/studio/src/timeline/components/TrackLane/TrackLane.tsx`, tests

```ts
/** The join after dragging the incoming step's left edge: left of its start blends by the drag; at or right of it, the entry at press. */
export function joinDragEntry(atPress: SeqOverlapEntry, deltaLeftSec: number): SeqOverlapEntry;
```

Handle on every child with a duration of a Sequence except its first (the row's incoming `join`, found from its
parent's `join` details). Snap applies to the incoming start. One `joinsSet` gesture, label `Blend`.

- [ ] Test `dragging left from stop blends by the drag`, and `from Blend 1 s adds to it`.
- [ ] Test `a drag that ends at or right of its start gives back the entry at press`.
- [ ] Test `dragging the second step's left edge 1 s left sets Blend 1 s as one undo entry`.

### Task 3.6: drag to reorder

**Files:** `packages/studio/src/timeline/utils/drop/dropTarget.ts` (new), `packages/studio/src/timeline/components/TimelinePane/useRowDrag.ts`
(new), `packages/studio/src/timeline/components/{TimelinePane,OutlineRow}/*`, tests

```ts
/** The slot a drop over row `overIndex` at `fraction` (0 top – 1 bottom of the row) lands in, or null when none takes the rows. */
export function dropTarget(
  draft: ClipData, rows: readonly TimelineRow[], overIndex: number, fraction: number, dragged: readonly RowRef[],
): ListSlot | null;
```

Per spec §3.5: top quarter before, bottom quarter after; the middle half of an expanded or empty Sequence/All row as
its last child; every candidate checked with `canPlace`. 4 px threshold; dragged rows dim; drop line at the slot's
depth; edge autoscroll; Escape cancels; release dispatches one `rowsMoved` (`Move …` via `editLabel`).

- [ ] Test `the upper quarter of a row drops before it and the lower quarter after it`.
- [ ] Test `the middle of an expanded group drops as its last child`.
- [ ] Test `no slot inside a dragged block or a full fork`.
- [ ] Test `waypoints drop only inside their own flyPath`.
- [ ] Test (pane) `dragging a row below another moves it as one Move entry, and Escape cancels a drag`.

---

## D5: Task 4.1: finish (controller)

**Files:** `packages/studio/README.md` (structure edits in the summary line; "neither saves nor seeks" stays true),
the spec and this plan (tick boxes, rulings recorded)

- [ ] Smoke per the Definition of Done; shots at 1728 × 1000 of: the palette open, a multi-row selection with the
      action row, a join selected with its inspector, a blend taper, a drag in flight, a refused action's tip. Send
      them as dash checks, one section each.
- [ ] ui-ux.md self-check, one line per item, in the PR body.

---

## Definition of Done

**Deliverables**

- `SeqOverlapEntry` with `'stop'`, compiled as a rest; the docs table shows it.
- `TimelineRow.details` (`knot`, `wave`, `members`, `join`, `taper`); `StudioSelection` (rows, joins);
  `HistoryEntry` with selection and folds; `resolveDraftSaga` keyed on the revision.
- `draft/utils/lists`, `draft/utils/groups`, `draft/utils/joins`; the eight slice actions; `selectionEdit`.
- Registry `palette` and `lengthParam` on every kind; `AddPalette`, `SelectionActions`, `MultiInspector`,
  `JoinInspector`; the Edit key group in `?`.
- The backlog's S2 row points at this plan; the slice-1 leftovers line is gone.

**Smoke** (`npm run dev`; `#studio=cosmicFlows` unless named)

- `+` (and A) opens the palette; typing `dist` and Enter adds a Distance step after the selected row, selected;
  `Undo Add Distance` removes it.
- Click, ⌘-click and ⇧-click build a selection; the inspector reads `3 steps`; Delete removes them; Undo restores
  rows, folds and the selection.
- ⌘D duplicates after the last selected row; ⌘G wraps two steps in a Sequence; ⇧⌘G unwraps it; ⌥↑/⌥↓ move a row;
  each names itself in Undo.
- Wrap two Distance steps in an All: both rows show `⚠ 2 writers`; the chip's `Select both` selects them; Undo
  clears the error.
- Drag a row into another block and back; Escape mid-drag cancels.
- Drag a bar's right edge: later steps shift live, one `Undo Duration`.
- In a Sequence of two moves: drag the second's left edge left 1 s → `✕ 1 s` chip, both bars taper across the
  window; click the chip → join inspector; choose Stop → `⌃ Stop` and abutting bars; Undo, Redo.
- Select two joins (⌘-click chips) and set Blend on both.
- `#studio=famousFlythrough`: unfold the waypoints; delete one, duplicate one, ⌥↑ one; none leaves the Fly.
- Delete a Fork's child alone: Delete is disabled with `Delete the Fork, or unwrap it`.
- Toggle Start saved/live: the timeline stays timed (P4).
- The inspector head glyph carries the row's family tint.

**Deferral boundary** (do not chase): T3 value curve (S5), knot drags and leg pinning (S5), the Fly inspector's
fields and its waypoint add control (Fly redesign), moving a bar in time, ⇧↑/⇧↓ range extend, indent/outdent keys,
palette drag-to-insert, multi-row unwrap, reason-specific error fixes, seek/play (S4), saving (S8).
