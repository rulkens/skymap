# Clip studio S2: structure edits — design spec

**Decisions:** [`docs/grill-sessions/clip-studio-2026-11-07.md`](../../grill-sessions/clip-studio-2026-11-07.md)
(Q6 structure edits in v1, Q14/Q32 crossfade treatment, Q17 snap, Q18 waypoint drags, Q28 memory only, Q30 keys,
Q38 sliders, Q46 names, Q47 selection marks; this spec's own rulings Q54–Q64). **Slice 1:** [`docs/superpowers/plans/2026-11-10-clip-studio-package.md`](../plans/2026-11-10-clip-studio-package.md)
(architecture A1–A8; this spec uses its vocabulary). **Design reference:** the round-3 mock states `join-selected`,
`deep` and the T1 crops (`docs/design/clip-studio/review-round-3.md`, "Crossfades and joins"). **Plan:**
[`docs/superpowers/plans/2026-11-10-clip-studio-s2-structure-edits.md`](../plans/2026-11-10-clip-studio-s2-structure-edits.md).

This spec is written against the architecture after the prep in **Ground preparation**. Its open questions were ruled
by the owner on 2026-11-10 (§9).

## 1. Goals and non-goals

**Person and job.** As someone authoring a clip in the studio, I need to add, remove, copy, group and reorder steps,
set their length and how they join, so that I can build a clip's structure without writing TypeScript.

**Goals**

- Add a step from a palette; delete; duplicate; wrap in Sequence, All or Fork; unwrap; reorder by key and by drag.
- Multi-select rows with ⇧-click (range) and ⌘/Ctrl-click (toggle); every structure edit acts on the selection.
- Drag a step's right edge to change its length.
- Joins as objects: each join of a Sequence is a chip on its row (`Stop`, `No stop`, `Blend 1 s`) that can be
  selected and set; dragging a step's left edge inside a Sequence sets the blend before it.
- The T1 crossfade treatment (Q32): bars taper linearly across exactly the overlap window.
- Every edit is one undo step with a named label, and undo brings back the selection and the folds it had.
- Waypoints: add one from the Fly inspector's chip list, delete, duplicate and reorder them as rows (§3.11).
- Slice-1 leftovers: error chips get an action; the inspector head glyph is tinted by family. (The third leftover,
  the `--ch-*` hues, already moved to `src/styles/tokens.css` as `--color-channel-*` in bf24b7d19.)

**Non-goals** (each is a later slice or out of scope)

- Seek, play, loop, "Use current view" (S4). The 3D view still does not follow the playhead.
- Knot drags and per-leg pinning on a Fly (Q18) and the speed-curve lane (Q19): S5.
- The T3 value curve in the join inspector (Q-F): S5, beside the speed-curve lane that needs the same channel
  evaluation.
- The Fly inspector's own fields and its chip list's display and selection: the Fly redesign (neighbour, see §6).
- Saving (S8). Edits stay in memory (Q28).
- Moving a step in time by dragging its bar body. Time comes from structure; a delay is a Wait row.
- Keyboard range-extend (⇧↑/⇧↓), indent/outdent keys, drag from the palette, multi-row unwrap.

## 2. What the edits work on

Facts of the clip model that shape every interaction (`docs/animation/clip-primitives.md`, "Blending a seq"):

- A clip's `timeline` is a plain list that plays in order and **cannot blend**: only a `seq` effect has `overlap`.
  Joins, chips and left-edge handles therefore exist on Sequence rows only. Wrapping steps in a Sequence is how a
  person makes a blendable run. This is essential to the model, not a studio rule.
- A join is counted between consecutive children **that have a duration**; cues between them do not count and fire
  at the next step's start.
- A Fork holds exactly one child. Its child list has one slot.
- A Fly owns an ordered list of waypoints; each is a row (Pass, Settle).
- The compiler is the only judge of a valid clip. Its refusals already surface as row errors (`⚠` in Dur, an error
  outline on the mark, an alert line in the top bar) with the bars drawn at true times.

**Rule for invalid results.** An edit is refused (its control disabled, its key a no-op) only when `ClipData`'s type
cannot hold the result or the result is meaningless: a Fork with no child or two, a Fly with no waypoint, a group
moved into itself, a waypoint outside its own Fly, an effect inside a waypoint list, the Start row deleted or moved. Everything the type
can hold is committed, and the compiler marks what is wrong; Undo takes it back. A drag never clamps to a valid
value, with one exception: a length or blend cannot go below 0, because a negative one means nothing.

## 3. Interaction design

### 3.1 Selection

| Gesture | Result |
| --- | --- |
| Click a row (outline or lane) | Selects that row alone; it becomes the **anchor** |
| ⌘/Ctrl-click a row | Adds or removes it; it becomes the anchor; removing the last one clears the selection |
| ⇧-click a row | Selects every visible row from the anchor to it, in outline order; the anchor stays |
| Click a join chip | Selects that join alone |
| ⌘/Ctrl-click a join chip | Adds or removes the join (joins only; clicking a chip while rows are selected replaces them) |
| ↑ / ↓ | Selects the previous / next visible row from the anchor, alone (slice-1 behaviour) |
| Escape | Clears the selection, then closes the studio (slice-1 behaviour) |

A selection is either rows or joins, never both. Q47's marks hold for every selected row: the steps inside a
selected block are marked, and so are the blocks around a selected step. A folded block stands in for a selected row
it hides, as in slice 1.

The inspector shows: one row → that row's inspector (slice 1) with the action row in its head; several rows → a head
`3 steps` with the action row and no fields; one or more joins → the join inspector (§3.7).

### 3.2 The edits at a glance

Every edit acts on the selected rows it applies to and ignores the rest (a range that starts at Start still deletes
the steps in it). It is disabled only when none apply; its tooltip then says why in a few words.

| Edit | Mouse | Key | Undo label | Selected after | Refused when |
| --- | --- | --- | --- | --- | --- |
| Add | `+` in the outline head, then a palette item | A | `Add Distance` | The new step | never (§3.3 picks the place) |
| Add waypoint | Fly chip list `+`, or a waypoint's Add after, then an object (§3.11) | — | `Add Pass`, `Add Settle` | The new waypoint | never |
| Delete | Action row: Delete | Delete, Backspace | `Delete Distance`, `Delete 3 steps` | The row now in the first deleted row's place, else the one before, else its block, else nothing | Only Start, a Fork's lone child, or a Fly's only waypoint is selected |
| Duplicate | Action row: Duplicate | ⌘D | `Duplicate Distance` | The copies | The only targets are a Fork's child |
| Wrap in Sequence | Action row: Sequence | ⌘G | `Wrap in Sequence` | The new block | Targets are in different blocks |
| Wrap in All | Action row: All | ⌥⌘G | `Wrap in All` | The new block | Targets are in different blocks |
| Wrap in Fork | Action row: Fork | — | `Wrap in Fork` | The new Fork | More than one target |
| Unwrap | Action row: Unwrap | ⇧⌘G | `Unwrap Sequence` | The former children | Not exactly one Sequence, All or Fork |
| Move up / down | Drag (§3.5) | ⌥↑ / ⌥↓ | `Move Distance`, `Move 3 steps` | The moved rows | Targets are in different lists; the block is at the list's end |
| Length | Right-edge drag (§3.6) | — (inspector field) | the length field's label, e.g. `Duration` | unchanged | the row has no draggable end |
| Join | Chip segment, left-edge drag (§3.7) | — (inspector) | `Stop`, `No stop`, `Blend` | the join(s) | never |

Names in labels are the row's Name from the naming table (`Distance`, `Pass`, `Sequence`); several rows read
`N steps`. Where a selected block and a row inside it are both selected, the edit acts on the block.

**Where the actions live.** The action row sits in the inspector head, over the selection it acts on (the Q29
principle): icon buttons Duplicate, Sequence, All, Fork, Unwrap, Delete, each with a StudioTip naming it and its key.
Add is the `+` button at the left of the outline head, because it makes a row there. Keys appear in tooltips and the
`?` overlay only (Q30), under a new `Edit` group.

### 3.3 Add from the palette

`+` or A opens the palette as a popover under the `+` button; focus moves into its filter field. Typing filters by
name; ↑/↓ moves; Enter or a click adds; Escape closes and returns focus to where it was. It is not modal: a click
elsewhere closes it. Items are grouped by channel family in legend order (Distance, Look-at, Turn · tilt, Layers,
Settings · focus), then `Timing` for steps that write no channel (Hold, Wait, Sequence, All). Each item is a glyph in
its family tint and the Name the registry gives the default step, so the palette's words are the outline's words.

The new step goes **right after the anchor**, as its sibling, in the nearest enclosing list that can hold it: after
a Fork's child means after the Fork (its one slot is full); after a waypoint means after its Fly. With Start as the
anchor it goes first; with nothing selected, last. Its defaults come from the registry (§5): the pinned preview
start's distance and angles where a step needs a value, `focusId('milkyWay')` for a subject (the Subject field's
object picker changes it), short helper-built durations.

What the palette offers (Q-I): Distance, Turn, Tilt, Roll, FOV (`set` per channel); Turn +, Tilt + (`spin`);
Turn speed (`rate`); Bob tilt (`osc`); Look-at to a point (`setVec`); the subject steps Look-at, Distance, Aim, Strafe,
Turn, Focus; Show, Hide, Fade, Set, Frame; Hold, Wait, empty Sequence, empty All, and Fly with one waypoint at the
palette's default subject (more come from its chip list, §3.11). Not offered: Zoom-pan (`geodesic`, built by makers), `aimAlong`, the resolved `focus` arm, Fork (made by
wrapping).

### 3.4 Delete, duplicate, wrap, unwrap

- **Delete** removes the top-most targets. A Fork's lone child cannot be deleted on its own (the Fork would be
  empty); the tip says `Delete the Fork, or unwrap it`.
- **Duplicate** copies each list's targets, in order, right after the last target of that list. Copies are new
  objects; a copied Sequence keeps its own joins.
- **Wrap** gathers the targets (one list) into a new block at the first target's place, in outline order. Fork wraps
  one row only.
- **Unwrap** replaces a block by its children in place. A Sequence's own joins do not survive into an All or the top
  level; into a parent Sequence they carry over by the rule in §3.8.

### 3.5 Reorder

**Keys.** ⌥↑/⌥↓ move the targets (one list) past the neighbour above or below as a block, inside their list. At the
list's end the key does nothing; crossing into another block is the drag's job.

**Drag.** Press on a row's outline cell and move 4 px to start; a press without movement stays a click. Dragging a
selected row drags the selection's targets; dragging an unselected row selects it and drags it alone. While dragging:
the dragged rows dim in place; a 2 px drop line marks the slot, indented to its depth; over the middle half of an
expanded or empty Sequence or All row the row itself highlights (drop as its last child). A slot that cannot take the
rows (inside a dragged block, a full Fork, another list kind) shows nothing and the cursor reads not-allowed. Near the
pane's top or bottom edge the rows scroll. Release commits one `Move` edit; Escape or a release over nothing cancels.
Waypoints drag only within their own Fly. The click alternative is ⌥↑/⌥↓ plus wrap/unwrap (ui-ux Interaction 14).

### 3.6 Length: the right edge

A bar whose kind has a length param (`over`, or `sec` for Hold and Wait) gets an 8 px handle straddling its right
edge (`ew-resize`, shown on hover and on the selected row). A cue's handle sits on its tail end (its fade time). Rows
without one: Start, blocks (their length is derived), Fork, Set, Focus, a perpetual Bob, waypoints (Q18, S5).

Dragging selects the row, then each move commits `param = (param at press, or the visible length when the param is
unset) + Δ`, floored at 0, as one gesture (one undo entry, labelled by the field, e.g. `Duration`). The end snaps
to the ruler's notches (step edges, cues, End) within 6 px, ⌥ moves freely, ⇧ moves at a tenth (Q17). The bar
follows the compiler's result, so later steps shift and any refusal shows on its rows while dragging. The
inspector's length field is the click alternative.

### 3.7 Joins

**Chips.** A Sequence row's lane carries one chip per join, centred in the overlap window (a blend) or on the join
instant (No stop, Stop): `✕ 1 s` (glyph `jblend`), `⌒ No stop` (`jnostop`), `⌃ Stop` (`jstop`). A chip narrower
than its words shows the glyph alone; its tooltip names it. Clicking a chip selects the join (§3.1).

**T1 taper** (Q32, as approved in round 3): when a join blends, the outgoing bar tapers linearly to a point across
exactly the overlap window and the incoming bar grows from a point across the same window, with no rounded cap, and
a hairline at each window edge through both rows. Only bar marks taper. A No stop join draws abutting bars; a Stop
join draws them as they fall.

**Left edge in a Sequence** (Q-C): a step's left edge inside a Sequence **is the join
before it**. Every step with a duration except the Sequence's first gets a left-edge handle. Dragging it left by Δ
sets that join to `Blend (b + Δ)`, where `b` is the join's blend at press (0 for Stop and No stop); a drag that ends
at or right of its start leaves the join as it was at press. Snap as in §3.6, applied to the incoming step's start.
One gesture, one `Blend` undo entry. Steps outside a Sequence (top level, in an All, in a Fork) and a Sequence's
first step have no left edge: a delay is a Wait row.

**Join inspector.** Head: the join glyph, `Sequence · join 2`, the window (`7.0–8.0 s`), title `Blend 1 s`. A
`Stop | No stop | Blend` segment and, when Blend, a Blend field (the Q38 slider, 0 to the shorter neighbouring
step). With several joins selected the head reads `3 joins`, the segment shows no option active while they differ, and
a choice sets them all. Choosing Blend from Stop or No stop sets 1 s, or half the shorter neighbouring step when that
is less.

**Keyboard path to joins.** Lanes are `aria-hidden` (slice 1); the Sequence inspector lists its joins (`Join 1 ·
Blend 1 s`), each a button that selects it (⌘/Ctrl-click adds one). This list replaces the Sequence inspector's
seq-wide Blend field (Q-D; Interaction 7, one way to do a thing); setting every join at once is a multi-join
selection.

### 3.8 How joins follow structure edits

A Sequence's `overlap` is one number (every join), an array (one entry per join), or absent (every join Stop).

- A number or absent `overlap` is seq-wide, so it needs nothing when steps come and go.
- An array is realigned after any edit that changes the Sequence's children: each join between two steps that were
  already neighbours keeps its value; every new neighbour pair starts at **Stop**. An array that ends all Stop
  becomes absent.
- Setting one join on a number or absent `overlap` expands it to an array first.

So deleting the middle of three blended steps leaves its neighbours resting, wrapping two blended steps in a Sequence
carries their join into it, and nothing ever blends that the person did not set. Changing a step's length to 0 (it
stops counting as a join) is left to the compiler's `seqOverlap` error.

### 3.9 Undo, selection and folds

Selection and folds are keyed by path, and a path means nothing without its draft, so each undo entry stores the
draft **with** the selection and folds it had. Undo and redo bring the three back together: undoing a delete
restores the row, its fold, and the selection it had; undoing a parameter edit re-selects the edited row. A fold
toggled after an edit is undone with it. A structure edit carries every fold to its row's new path.

### 3.10 Slice-1 leftovers

- **Error chips get an action.** A row's error chip in the inspector gains a `Select all` button (`Select both` for
  two) that selects every culprit row of the compile error, so the person sees the clashing steps together. A
  reason-specific fix such as `Run in order` for two writers in an All is not in S2 (Q-E).
- **Inspector head tint.** `InspectorHead` takes the row's family and tints its glyph with the family hue, as the
  outline does.

### 3.11 Waypoints

Waypoints are rows (Pass, Settle) in their Fly's list, so Delete, Duplicate, ⌥↑/⌥↓ and drag work on them through
the same list machinery as steps, and never move them out of their Fly (Q-G).

- **Add.** The Fly inspector's chip list ends in a dashed `+` chip (appends, so the new waypoint becomes Settle), and
  a waypoint's inspector has a quiet `Add after` button. Either opens the shared `ObjectPicker` in place; a pick
  inserts `{ id }` there (one `rowsInserted`, label `Add Pass` or `Add Settle`) and selects the new waypoint; Escape
  adds nothing and returns focus. No half-made waypoint reaches the draft. The new waypoint carries no leg time,
  linger or angle, so it takes its arc-length share of the travel time, pinned legs keep their seconds, and the
  step grows by one Linger window.
- **Remove** is the action row's Delete (and the key) on a selected waypoint: it goes with its own params, the leg
  into the next one starts from the previous one, and the unpinned legs share the time out again (Q18's rule).
  Refused on a Fly's only waypoint, tip `A Fly needs a waypoint` (`buildPathTrack` throws on zero).
- **Reorder** is §3.5's ⌥↑/⌥↓ and drag; a moved waypoint keeps its own params.

## 4. States

| State | What shows |
| --- | --- |
| Nothing selected | Clip inspector (slice 1); the action row is absent; `+` adds at the end |
| One row, several rows, one or more joins | §3.1 |
| Empty clip | `No steps` (slice 1) with `+` live; the palette adds the first step |
| Empty Sequence or All | A group row with no children; a drop target; deletable |
| Unresolved draft | Edits work; lanes are empty until it resolves, so edge handles and chips are absent |
| Compile error | Rows marked as today; edits stay live; chips and tapers draw from the spans the compiler reached |
| Narrow (400 px) | `Needs a wider screen` (Q13); no edit surface |
| Long clip, many joins at Fit | Chips shrink to glyphs; the selection relation keeps working when folded |

## 5. Data model

All contract types are pinned in the plan; this is their shape.

- **`SeqOverlap` entries gain `'stop'`** (engine, prep P1): `number | (number | 'stop')[]`. A `'stop'` entry times
  like 0 and rests (no matched join). Hand-written clips read `seq([...], { overlap: [1, 'stop', 0] })`.
- **`StudioSelection`**: `{ kind: 'rows'; refs: RowRef[]; anchor: RowRef } | { kind: 'joins'; refs: JoinRef[] }`;
  `JoinRef = { seq: EffectPath; index: number }` (the k-th join counted between children with a duration).
- **`HistoryEntry`** gains `selection` and `collapsed`.
- **`ListSlot = { owner: EffectPath; index: number }`**: `[]` is the top level, a seq/all/fork path its children,
  a flyPath path its waypoints. One `canPlace` check decides every insert, move and drop, and each list's
  capacity (`min`, `max`: a Fork 1–1, a Fly's waypoints 1–∞, others 0–∞) decides every refused removal.
- **`StructureEdit = { draft; remap(path) → path | null; selected: RowRef[] }`**: what every structure util returns
  (or `null` when refused). `remap` carries folds; `selected` sets the selection.
- **Registry growth** (`RowKindSpec`): `palette: ((pins: PreviewPins) => T)[]` (empty = not offered; `set` lists one
  maker per channel; makers call `effectHelpers`) and `lengthParam: (subject: T) => 'over' | 'sec' | null`.
- **`TimelineRow.details: RowDetail[]`** (prep P2), a closed union the views read: `knot`, `wave` and `members`
  (moved from today's optional fields), and S2's `taper` and `join`.
- **Slice actions**: `selectionSet`, `rowsInserted`, `rowsDeleted`, `rowsDuplicated`, `rowsWrapped`, `rowUnwrapped`,
  `rowsMoved`, `joinsSet`; the right-edge drag reuses `paramEdited`. One helper, `selectionEdit(id, state)`, turns
  an edit id into its action or a refusal reason; the key handler and the action row both call it.

## 6. Neighbours and dependencies

- **Shared object selector** (in flight on this branch: `ObjectPicker`, `subjectField`, `pickPositionSaga`). S2's
  palette defaults a subject step to `milkyWay` and relies on the Subject field to change it. The palette's list
  behaviour (filter, ↑/↓, Enter, Escape) is the picker's; the palette task reuses it, extracting a list primitive
  from `ObjectPicker` only if it is still object-specific then. S2 starts after that work is committed, since both
  touch `FieldRow`, `RowInspector`, `OutlineRow`, `TimelinePane` and `BarMark`.
- **Fly inspector redesign** (on this branch before S2). It builds the Fly's fields and the waypoint chip list
  (display, select). S2 adds the list's `+` chip and the waypoint's `Add after` (§3.11); every waypoint add,
  delete, duplicate and reorder goes through S2's list actions, so there is no second list-edit path (Q-G).

## 7. Ground preparation

From the refactor-ground pass over this feature (2026-11-10). The owner's rulings in §9 sign off the checkpoint;
P1–P4 ride the S2 feature PR as its first commits (Q-J).

**Ideal diff.** A structure edit is a pure function over the draft returning a `StructureEdit`, committed by the
slice through the existing `commitDraft` (A7); the registry grows two fields; the timeline grows join and taper
details; keys grow table rows; the resolve saga needs no change because it follows the revision.

**Verdicts per touchpoint**

| Touchpoint | Verdict | Joint |
| --- | --- | --- |
| Palette defaults | growth | a `palette` field on each registry entry |
| Right-edge drag | growth | `paramEdited` + a `lengthParam` field |
| Structure edits | growth | new `draft/utils` functions over `commitDraft` |
| Keys and the action row | growth | rows in `STUDIO_KEYS`; one `selectionEdit` helper |
| Per-join Stop in a blended Sequence | **bolt-on** today: `overlap` has no rest entry, so one Stop beside a blend means splitting the Sequence, or a new neighbour silently becoming No stop | P1 |
| Join chips and tapers on rows | **bolt-on**: a fourth and fifth optional per-kind field beside `knotSecs?`, `wave?` and `members?` (the second-special-case trigger has passed) | P2 |
| Multi-select and join selection | **bolt-on**: `selection: RowRef \| null` is read as one row by five consumers | P3 |
| Resolution of new edit kinds | **bolt-on**: `resolveDraftSaga` takes a hand-kept action list; S2 would add seven terms. The list already missed `startModeSet` once (patched in d7aec2a50 by adding it) | P4 |
| Selection and folds across structure edits | missing joint: history holds drafts only | in-feature (history entry carries both; it changes undo behaviour, so it is not a prep) |
| Joins across structure edits | missing joint | in-feature: one `realignJoins` helper every list util calls |

**Prep commits, in order** (each its own commit, before any feature commit):

| # | Prep | Removes |
| --- | --- | --- |
| P1 | `SeqOverlap` entries may be `'stop'`: validator, overlapped-seq walk, `resolveSeqJoins` rest rule, docs table | the missing rest entry (`validateSeqOverlap.ts:24-25`, `resolveSeqJoins.ts:75-82`) |
| P2 | `TimelineRow.knotSecs?`, `wave?` and `members?` become `details: RowDetail[]` | optional per-kind fields (`TimelineRow.d.ts:39-44`, `buildTimeline.ts:50`) |
| P3 | `selection` becomes `StudioSelection` (rows arm only); single-click behaviour unchanged | one-row reads in `selectSelectedRow`, `selectSelectionStandInId`, `runStudioKey`, `TimelinePane` |
| P4 | `resolveDraftSaga` restarts on a revision change, not on a list of actions | `REVISION_ACTIONS` (`resolveDraftSaga.ts:28`) |

**Greenfield cross-check.** A fresh agent given only the data requirements proposed two shapes that differ from the
sketch. Both were priced and rejected (Q-A, Q-B in §9).

- **Joins on the incoming step** (`join?: 'stop' | 'noStop' | { blend }` on each step) instead of an array on the
  Sequence: nothing is numbered, so nothing realigns. The real constraint defending the array: the engine's `Effect`
  union, `effectHelpers.seq`, the overlapped-seq compiler walk and the docs speak `overlap`; moving the join onto
  steps puts a field on every effect arm that only a Sequence's children read. → Q-A.
- **A normalised editor document with node ids** instead of paths: selection, folds and history point at ids and
  never remap. The constraint: slice 1's draft is `ClipData` addressed by path end to end (`effectAt`,
  `updateEffectAt`, `setRowParam`, spans, compile errors, `buildTimeline`), and an id document needs a lossless
  round trip both ways. → Q-B.
- Agreements: palette variants live in the registry; one `canPlace` check for every placement; display extras as a
  closed union (adopted as P2, `RowDetail`); edits that share a gesture coalesce; undo restores the selection.

**Adjacent findings** (not needed by the ideal diff, backlog by default): none. P4 is a prep because S2 would
otherwise add seven terms to the list that already missed one.

## 8. Entanglement check (this spec)

Run over §2–§7 for sections that teach handling of an asymmetry.

- **Top level cannot blend.** Essential (the model's rule). No code branches on it: joins derive from `seq` rows
  only, and the top level is not a `seq` row.
- **Fork's one slot, a Fly's last waypoint.** Essential (`fork(child)`; a path needs a point). Expressed once as list
  capacity (`min`, `max`); deleting a Fork's lone child or a Fly's last waypoint is refused instead of cascading
  to its owner, so no rule removes a parent behind the person's back.
- **Number vs array `overlap` in §3.8.** Essential to the authored form: a number means every join, an array means
  each join. Only the array has per-join values to keep, so only it realigns. Q-A's rejected alternative removed
  the array.
- **Left-edge drag ending at its start leaves the join as it was.** Accidental-looking, but it is the gesture's
  definition, a pure function of (join at press, Δ); there is no stored flag.
- **Selection: rows or joins.** Essential (a join is not a row). Consumers branch once, on the arm.
- **Undo restoring selection and folds.** Un-braided: path-keyed state travels with its draft instead of being
  patched after the fact.
- **Keys and buttons.** One `selectionEdit` helper produces both, so a key and its button cannot disagree.

No accidental knot is left documented instead of removed.

## 9. Decisions

Ruled by the owner on 2026-11-10 (grill session Q54–Q64).

| # | Question | Ruling |
| --- | --- | --- |
| Q-A | Where does a join's treatment live? | **On the Sequence's `overlap`**, with `'stop'` entries (P1) and arrays realigned in one helper (§3.8). Rejected: a `join?` field on the incoming step, inert on every step outside a Sequence, migrating the compiler walk, `seq` helper, docs and clips |
| Q-B | How are rows identified across structure edits? | **Paths**, remapped after each edit, with selection and folds in each undo entry. Rejected: an editor document with node ids, which rewrites slice 1's draft, compile and timeline layers |
| Q-C | What does a left edge do inside a Sequence? | **It is the join before the step** (§3.7): drag left blends, back to its start un-blends. No left edge elsewhere; a delay is a Wait row |
| Q-D | Keep the Sequence inspector's seq-wide Blend field? | **Replaced** by its list of joins (selectable, several at once) |
| Q-E | Error chip action | **`Select all` culprits only.** No reason-specific fixes in S2 |
| Q-F | T3 value curve in the join inspector (Q32) | **S5**, with the speed-curve lane that needs the same channel evaluation |
| Q-G | Waypoint edits | **All in S2**: delete, duplicate and reorder ride the list machinery, and S2 adds waypoints from the Fly inspector's chip list (§3.11) |
| Q-H | Deleting a Fork's only child alone | **Refused**, tip `Delete the Fork, or unwrap it` |
| Q-I | Palette contents | **The list in §3.3.** Fly is in it because S2 also brings waypoint add |
| Q-J | PR packaging of P1–P4 | **They ride the S2 feature PR**, each its own commit, first. These rulings sign off the refactor-ground checkpoint |
| Q-K | Keys | **A, Delete/Backspace, ⌘D, ⌘G, ⌥⌘G, ⇧⌘G, ⌥↑/⌥↓.** ⌘G is the browser's find-next, taken only while the dock has focus, as every studio key is |

## 10. Success criteria

- Every edit in §3.2 works by mouse and by its key where it has one, is one undo step with the label shown, and
  leaves the selection the table names.
- Undo of any structure edit restores the draft, the selection and the folds exactly.
- A per-join Stop sits beside a blend in one Sequence, and compiles as a rest.
- Joins draw as chips, select, and set from the segment, the Blend field and the left-edge drag; blends taper (T1).
- An edit that breaks the clip commits and shows the compiler's error on the culprit rows; Undo clears it.
- Waypoints add from the Fly's chip list (`+`, `Add after`) through the object picker, and delete, duplicate and
  reorder within their Fly; the only waypoint cannot be deleted.
- Error chips select their culprits; the inspector head glyph carries the family tint.
- Resolution follows the revision, with no action list to keep (P4); switching Start saved/live still resolves.
