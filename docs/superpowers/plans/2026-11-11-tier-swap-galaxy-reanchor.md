# Selection survives any reload — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development, under the lean protocol in
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a selection slot keeps pointing at its thing across any reload, with no tier or galaxy knowledge in core.

**Architecture:** `resolveFocusId` answers `pending | absent | hit` (prep). Every slot stores its durable id. A pure
`reanchorWrites` run by `watchSelectionRowsSaga` on the pulses it already hears rewrites or clears slots. The tier
saga drops its capture, and `galaxyCatalogRequest` moves into the Layer.

**Spec:** `docs/superpowers/specs/2026-11-11-tier-swap-galaxy-reanchor-design.md` (the authority; read §4 before any task).

## Global constraints

- CLAUDE.md conventions bind: one symbol per `@types/` and `utils/` file, `type` not `interface`, the comment budget.
- File moves go through `npm run move-files -- <from> <to>` (with `--dry` first). Never `git mv` or a hand-written ts-morph script.
- No Co-Authored-By. Never `git add -A`.
- Core gains no kind- or tier-specific branch (spec §2 anti-goals).

## Review focus

1. A tier swap where the new tier's data is still committing: no slot may clear (resolution must be `pending` or the old `hit`).
2. A reload that leaves the ref unchanged must issue no selection write (a focus write can start a camera move).
3. A deep link to a nonexistent id must stop waiting and clear the pending focus.
4. Hover now re-anchors rather than clearing, so a hover over a vanished galaxy must clear.
5. The URL `#focus=` id must be unchanged through the state-shape change (`selectFocusId`).

---

### Task 1: Prep — three-state focus resolution  `review: yes`

**Files:**
- Create: `src/@types/engine/selection/FocusResolution.d.ts`
- Create: `src/utils/selection/refOfResolution.ts`
- Modify:
  - `src/@types/engine/layer/SelectionKindRow.d.ts:22`
  - `src/@types/engine/selection/SelectionResolver.d.ts:12`
  - `src/services/engine/selection/composeSelectionRows.ts:44`
  - the 11 `src/layers/*/selection/*SelectionRow.ts` files with a `focusId:` block
  - `src/layers/galaxyCatalog/selection/present/galaxyRecordBridge.ts` and its `@types/GalaxyRecordBridge.d.ts`
  - every other `resolveFocusId` reader (`grep -rln resolveFocusId src`)
  - `src/state/selection/resolveFocusRefDeferringSaga.ts`, `watchRequestFocusSaga.ts`, `watchRequestSelectSaga.ts`
- Test:
  - `tests/services/engine/selection/composeSelectionRows.test.ts`
  - `tests/state/selection/resolveFocusRefDeferringSaga.test.ts`
  - `tests/state/selection/watchRequestFocusSaga.test.ts`
  - the galaxy bridge test (`tests/layers/galaxyCatalog/selection/present/`)

**Contract:** spec §4.1, verbatim: `FocusResolution<Ref>`, `decode(id): FocusResolution<Ref>`, and
`resolveFocusId(id): FocusResolution`. `refOfResolution(r: FocusResolution): SelectionRefBase | null`.

Each Layer row decides `pending`: rows over loaded data answer `pending` while the data that would decide hasn't
committed; static rows answer only `hit` or `absent` (spec §4.1 lists which).

**Tests (names are acceptance):**
- `composeSelectionRows › resolveFocusId answers absent when no row claims the id`
- `composeSelectionRows › resolveFocusId passes a claiming row's pending through`
- `galaxyRecordBridge › resolveDurableId answers pending while a better-ranked source is still looking`
- `resolveFocusRefDeferringSaga › keeps waiting while pending` (resolves after a later pulse turns it into a `hit`)
- `resolveFocusRefDeferringSaga › returns null on absent without waiting`
- `watchRequestFocusSaga › an absent id clears the pending focus`

- [x] Write the tests and see them fail
- [x] Implement
- [x] Run `npm run typecheck` and the touched test files, and confirm they pass
- [x] Commit: "Focus ids resolve to pending, absent or hit"

### Task 2: Every selection slot keeps its durable id

**Files:**
- Modify: `src/@types/store/SelectionRowsState.d.ts`
- Modify: `src/state/selectionRows/selectionRowsSlice.ts`
- Modify: `src/state/selectionRows/watchSelectionRowsSaga.ts:50-70` (`reextract`)
- Modify: `src/state/selection/selectors.ts` (`selectFocusId`)
- Modify: every `setSelectionRow` dispatch in tests (`grep -rln setSelectionRow tests`)
- Test: `tests/state/selectionRows/watchSelectionRowsSaga.test.ts`, `tests/state/selection/selectors.test.ts`

**Contract:**
```ts
// SelectionRowsState: replaces `& { readonly focusId: string | null }`
& { readonly ids: Readonly<Record<SelectionSlot, string | null>> }
// setSelectionRow payload: one shape, the focus-only arm deleted
{ readonly slot: SelectionSlot; readonly row: SelectionRowBase | null; readonly id: string | null }
```

**Tests:**
- `watchSelectionRowsSaga › stores the durable id for the select and hover slots, not only focus`
- `selectors › selectFocusId reads ids.focus` (the URL contract is unchanged)

- [x] Write the tests and see them fail
- [x] Implement
- [x] Run the touched tests and typecheck, and confirm they pass
- [x] Commit: "Every selection slot keeps its durable id"

### Task 3: The re-anchor reconciler  `review: yes`

**Files:**
- Create: `src/utils/selection/reanchorWrites.ts`
- Modify: `src/state/selectionRows/watchSelectionRowsSaga.ts:91` (the pulse handler)
- Modify: `src/state/selection/selectionWriteBySlot.ts` (the focus entry writes a `'cut'`)
- Test: `tests/utils/selection/reanchorWrites.test.ts`, `tests/state/selectionRows/watchSelectionRowsSaga.test.ts`

**Contract:** `reanchorWrites` as in spec §4.3. The ref compare is the existing `shallowEqualRef`
(`src/utils/object/`, already structural with `null` equal to `null`, and the slice's dedup), not a new `sameRef`.

The pulse handler runs `reanchorWrites` first and puts each write via `SELECTION_WRITE_BY_SLOT`
(`src/state/selection/selectionWriteBySlot.ts`), then runs the existing gap-fill. The table's focus entry is a
`'cut'`, so a re-anchor never starts a camera tween.

**Tests:**
- `reanchorWrites › pending leaves the slot alone`
- `reanchorWrites › absent clears the slot`
- `reanchorWrites › a hit on the same ref writes nothing`
- `reanchorWrites › a hit on a different ref rewrites the slot`
- `reanchorWrites › a slot without an id is skipped`
- `watchSelectionRowsSaga › a count pulse after a reload rewrites select and focus to the new index` (resolver fake:
  the id hits index 7, then index 42 after the pulse)
- `watchSelectionRowsSaga › a reload that keeps the ref puts no selection write`
- `watchSelectionRowsSaga › a hover over an id that turns absent clears`

- [x] Write the tests and see them fail
- [x] Implement
- [x] Run the touched tests, and confirm they pass
- [x] Commit: "Selection slots re-anchor to their ids after any reload"

### Task 4: Tier forgets selection; galaxy request moves into the Layer

**Files:**
- Modify: `src/state/tier/watchTierSaga.ts`
- Delete: `src/state/selection/captureGalaxyFocusIds.ts` and `tests/state/selection/captureGalaxyFocusIds.test.ts`
- Move: run `npm run move-files -- src/services/engine/wiring/galaxyCatalogRequest.ts src/layers/galaxyCatalog/records/load/galaxyCatalogRequest.ts`, with `--dry` first
- Modify:
  - `src/compositions/README.md` (delete row :32 and update the tally)
  - `tests/conventions/layerImportBoundary.test.ts:89-90` (delete both `CORE_ALLOWED` rows)
  - `docs/backlog/2026-10-29-layer-migration-leftovers.md` (delete J8's table row and section)
- Test: `tests/state/tier/watchTierSaga.test.ts`

**Contract:** `watchTierSaga` = `takeLatest(requestTier)`, then read `prev`, return if `prev === payload`, then
`put(setTier(payload))`. Nothing else. Rewrite the header to match, within the comment budget.

**Tests:**
- `watchTierSaga › writes the tier and nothing else`
- `watchTierSaga › re-requesting the current tier is a no-op`
- Delete the re-anchor cases (Task 3 covers that behaviour now).

- [x] Write the tests and see them fail
- [x] Implement, delete and move
- [x] Run `grep -rn "captureGalaxyFocusIds\|wiring/galaxyCatalogRequest" src tests tools docs --exclude-dir=completed` and confirm nothing comes back
- [x] Run typecheck and the touched tests, and confirm they pass
- [x] Commit: "Tier knows nothing about selection; the galaxy request lives in its Layer"

## Definition of Done

- **Deliverables:**
  - `FocusResolution.d.ts`, `refOfResolution.ts` and `reanchorWrites.ts` exist.
  - `captureGalaxyFocusIds.ts` is gone.
  - `galaxyCatalogRequest.ts` sits under `src/layers/galaxyCatalog/records/load/`.
  - Ledger row 32 and its two `CORE_ALLOWED` rows are gone.
- **Smoke (dev server, real data):**
  - Select a galaxy, then swap Medium → High → Medium: it stays selected and focused, and the camera doesn't jump.
  - Select an SDSS-only faint galaxy and drop to a tier without it: the slot clears.
  - Toggle the galaxy catalog off and on with a galaxy selected: the slot clears on off. On on it stays clear,
    because the id was cleared with it.
  - Open `#focus=sdss-1` (nonexistent): the pending focus clears once SDSS loads.
  - The `#focus=` URL is unchanged across a tier swap.
- **Deferred:** `navigateSaga.frameFocusSaga`'s guess (spec §6), other audit findings, per-asset load state.
