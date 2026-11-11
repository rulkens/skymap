# A selection survives any reload: durable ids, a three-state resolver, one reconciler — design

**Status:** design, awaiting approval. Written against `main` at `f9a85995c`.

**Ground preparation:** shape ruled in conversation 2026-11-10/11. Asks kz3W (pick J8), ucQu (shape "D + Resolution",
miss clears the slot). The prep is §4.1, its own commit; PR packaging is asked at the plan checkpoint.

**Consumes:** J8 of `docs/backlog/2026-10-29-layer-migration-leftovers.md` (the backlog index line "Remaining Layer
seams" stays; J8's section in the detail file is deleted) and the `galaxyCatalog` id-domain row of the
compositions ledger (`src/compositions/README.md:32`). Finding #1 of the hidden-state-machine audit
(`docs/backlog/2026-11-11-hidden-state-machines.md`, landing separately) is half-consumed: §4.1 delivers the
three-state answer; `navigateSaga.frameFocusSaga`'s guess is left (§6).

---

## 1. Purpose

A galaxy selection is stored as `{ source, index }`: a row number in the loaded file. A tier swap loads a file
with a different row order, so the same index names another galaxy. Today core repairs this in
`src/state/tier/watchTierSaga.ts`: before writing the tier it calls `captureGalaxyFocusIds` (a galaxy-only
helper in core `state/selection/`) to snapshot each slot's durable id, then waits for each reloading source's
count pulse and resolves the id back to a ref.

That is a bolt-on in three ways:

- **Core knows a kind.** `captureGalaxyFocusIds` branches on `galaxyCatalog` and imports the Layer's
  `galaxyCatalogRequest` to predict which sources reload. Those two files are the last of the ledger's
  galaxyCatalog id-domain row.
- **It is tier-only.** A catalog toggled off and on, or the galaxy octree (#932) streaming rows in and out, moves
  indices the same way and gets no repair.
- **It is edge-triggered.** It must predict exactly which pulses will arrive; `captureGalaxyFocusIds.ts:6-9`
  carries a LANDMINE that a wrong prediction waits forever.

Underneath sits a second gap: `SelectionResolver.resolveFocusId` returns `null` for both "the data that would
answer has not loaded" and "no such id". The galaxy bridge already knows the difference (its private `PENDING`,
`galaxyRecordBridge.ts:37`) and flattens it. So every caller guesses: `resolveFocusRefDeferringSaga.ts:16`
loops forever on an id that will never resolve.

## 2. Goals, non-goals, anti-goals

**Goals**

1. `resolveFocusId` answers `pending | absent | hit`; each kind's `focusId.decode` says which.
2. Every selection slot keeps the durable id of the thing it holds, captured when the slot is set.
3. One level-triggered reconciler keeps slots pointing at their ids across any reload: `pending` leaves the
   slot, `absent` clears it, a `hit` on a different ref rewrites it.
4. The tier saga knows nothing about selection; `captureGalaxyFocusIds` is deleted; `galaxyCatalogRequest` moves
   into the Layer; the ledger row goes.
5. `resolveFocusRefDeferringSaga` stops waiting on `absent`.

**Non-goals:** `frameFocusSaga`'s "absent" guess (§6); per-asset load state in the store (ruled out, ucQu);
any other audit finding.

**Anti-goals:** no new Layer member; no tier- or kind-specific branch anywhere in core's re-anchor.

## 3. Behaviour

- Select M51, swap the tier: M51 stays selected and focused. Where the new tier lacks it, the slot clears.
- Hover is treated like the other slots (re-anchored or cleared) rather than cleared unconditionally.
- A focus write that does not change the ref is never issued, so a reload never restarts a camera move.
- A deep link to an id that does not exist stops waiting once its source answers `absent`, and the pending
  focus clears. Today it waits until superseded.

## 4. Design

### 4.1 Prep: the three-state answer

```ts
// src/@types/engine/selection/FocusResolution.d.ts
export type FocusResolution<Ref extends SelectionRefBase = SelectionRefBase> =
  | { readonly kind: 'pending' }
  | { readonly kind: 'absent' }
  | { readonly kind: 'hit'; readonly ref: Ref };

// SelectionKindRow.focusId.decode (Layer-facing contract: a return-type change, ruled ucQu)
decode(id: string): FocusResolution<Ref>;
// SelectionResolver
resolveFocusId(focusId: string): FocusResolution;   // no claiming row → 'absent'
```

- `galaxyRecordBridge.resolveDurableId` returns `FocusResolution<GalaxyCatalogRef>`. Its `PENDING` maps to
  `pending`; "a better-ranked source still looking" (`:69`) is `pending`, not `null`.
- Rows whose data is static (body, milkyWay, blackHoles, earthScenes, probeSpheres, missions) only ever answer
  `hit` or `absent`. Rows over loaded data (galaxyCatalog, starCatalog, structure, satellites, stellarStreams)
  answer `pending` while the data that would decide has not committed. Each Layer decides; core never guesses.
- Callers that only need a ref read it through one helper, `refOfResolution(r): SelectionRefBase | null`
  (`src/utils/selection/`), so the diff at the eleven non-saga readers is one call each.
- `resolveFocusRefDeferringSaga`: loops while `pending`; returns `null` on `absent`. Its two callers
  (`watchRequestFocusSaga`, `watchRequestSelectSaga`) clear the pending id on `null`.

### 4.2 Each slot keeps its id

`SelectionRowsState`'s focus-only `focusId` becomes `ids: Record<SelectionSlot, string | null>`.
`setSelectionRow` loses its focus-only payload arm: every write is `{ slot, row, id }`. `reextract`
(`watchSelectionRowsSaga.ts:50`) already computes the id; it stores it for every slot. `selectFocusId` reads
`ids.focus`, so the URL path is unchanged.

### 4.3 The reconciler

A pure function owns the decision:

```ts
// src/utils/selection/reanchorWrites.ts
export function reanchorWrites(
  ids: Readonly<Record<SelectionSlot, string | null>>,
  refs: Readonly<Record<SelectionSlot, SelectionRefBase | null>>,
  resolve: (id: string) => FocusResolution,
): readonly { slot: SelectionSlot; ref: SelectionRefBase | null }[];
```

`pending` → no write; `absent` → `{ slot, ref: null }`; `hit` → a write only when the ref differs (`sameRef`,
a new `utils/selection/sameRef.ts` comparing `type` plus the ref's own fields).

`watchSelectionRowsSaga`'s existing pulse handler (`:91`, on `engineSourceCountReported`, `factsReported`,
`engineStatusChanged`) runs it before the gap-fill and puts each write through `SELECTION_WRITE_BY_SLOT`. Those
writes re-enter `reextract`, which refreshes rows and ids. The galaxy bridge's `onSettle` already turns a settled
lookup into a count pulse (`galaxyRecordBridge.ts:5`), so a `pending` answer is retried without a new signal.

Why no tier knowledge is needed: during a reload the asset slot keeps its committed value
(`AssetSlot.committed`, `src/@types/loading/AssetSlot.d.ts`), so resolution keeps hitting the old ref (no write)
until the new data commits and pulses.

### 4.4 Tier and the Layer

- `watchTierSaga` keeps only the command→write split and the `prev === next` guard. The hover clear, the capture
  and the re-anchor loop go, along with its getContext.
- `src/state/selection/captureGalaxyFocusIds.ts` and its test are deleted.
- `src/services/engine/wiring/galaxyCatalogRequest.ts` moves to `src/layers/galaxyCatalog/records/load/` (its
  only remaining reader, `galaxyCatalogAssetRows.ts`, is there), with its test.
- Ledger row `src/compositions/README.md:32` is deleted and the tally updated; the matching `CORE_ALLOWED` rows in
  `tests/conventions/layerImportBoundary.test.ts` go.

## 5. Risks

- **A `hit` while new data is half-committed.** Covered: rows answer `pending` until their data commits.
  `reanchorWrites` is tested on all three answers.
- **Write storms.** Count pulses are per source commit; `sameRef` keeps writes to real changes.
- **Hover churn.** Hover now re-anchors rather than clearing; a stale hover was the reason for the clear, and
  re-anchoring removes the staleness.

## 6. Adjacent, not in scope

- `navigateSaga.frameFocusSaga` (`:68`) still infers "absent" from engine idle plus `delay(0)`. With §4.1 it could
  read the resolution directly. It stays in the audit backlog file unless the owner pulls it in.
- The audit's other findings stay in its backlog file.
