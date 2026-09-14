# Layer composition (d), PR-A — the demand loop: tier becomes request drift

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(d), ruling **D3** and prep item **P2**, with §4.7 (source rows) and §10(d) for the sequence.
Read §9(d)'s D3 paragraph and the "Open at plan time" list before starting — the second is
scheduled here as Task 4 and its findings are already recorded below, to be verified rather than
rediscovered.

Plan 04a of the layer-composition sequence; follows plan 03 (the contract PR,
[`completed/2026-09-11-layer-composition-03-contract.md`](completed/2026-09-11-layer-composition-03-contract.md)).
First of the four stacked PRs §9(d) D14 packages (d) into: **PR-A (this plan)**, PR-B (the
contract over the empty tuple), PR-C (the galaxy-side un-braids), PR-D (the Layer itself).

Branch: `worktree-layer-galaxy-catalog` (off `223145f68`). One PR, 13 tasks, every commit green.

**Parallelism 2.** Chain A (the slot state machine) is 2→3; chain B (requests) is 1, then 5→6,
then 7 and 8 in either order. Task 4 (the audit) runs any time after 3 and gates 6. Task 9 is
independent of both chains. Deletions 10→11→12 follow the tasks that land their replacements
(10 after 6, 11 after 9, 12 after 8). Task 13 gates.

## Goal

Make a tier change nothing but a **request drift**, handled by the same demand loop that already
handles boot, toggles and proximity — and make every family replace its data **in place on the
next frame**, never blanking.

Today a tier change is a bespoke transition: `watchTierSaga` reaches through an injected saga
context into `makeRunTierTransition`, which walks the galaxy registry firing `.load()` per source,
re-fires each source's companions, re-loads MCPM and Polyphorm2MRS by name, loops the star
catalogs, and tears down + rebuilds the hi-res famous texture pair. A parallel half of the same
policy lives in `reevaluateDemand` as `staleTierEvict`, gated on `isBodyTextureKey`, which
_releases_ a body texture so the loop re-loads it — blanking the surface to the low-res atlas in
between. Three mechanisms, two of which blank, none of which the other families share.

After: one edge. A slot whose `lastRequest()` no longer matches its row's `req(state.tier)` and
whose `demand(ctx)` is still true is re-loaded with the new request and **never released**; the
slot serves its last committed value throughout the reload, so `current()` and `slotReady` stay
non-null and the commit overwrites in place. `release()` narrows to distance eviction, its only
remaining reason.

**This is the sequence's one behaviour change** (spec §9(d) P2), and it is user-required: all data
— galaxy catalogs, body textures, star bins, volumes, the hi-res famous texture — replaces in
place, one way, for every family.

Two consequences of "one way, for every family" are behaviour changes in their own right, named
here and nowhere else: a galaxy-catalog tier swap stops fading the old buffer out first (Ruling 3),
and **filaments start swapping** — the skeleton ships two files (`filaments-small.bin` vs
`filaments.bin`), so its request drifts across the small boundary and the fetcher's frozen "don't
swap on tier flip" policy (`filamentFetcher.ts:9-13`) is superseded by D3. A medium↔large flip
still fetches no filament data, because that request does not drift.

## Architecture

- **The drift edge** (`reevaluateDemand.ts`). The per-row edge chain gains a fourth arm. A row is
  drifted when its slot is non-idle, has a `lastRequest()`, is still demanded, and
  `sameRequest(slot.lastRequest(), row.req(tier))` is false. A drifted row is re-loaded by calling
  `slot.load(req)` **directly**, not through the bounded queue: the queue refuses a key that is
  already in flight (`priorityQueue.ts:130`), so a queued reload could never supersede a slot that
  is still `loading` — the case the drift edge exists for (Ruling 6). `slot.load` aborts the
  in-flight controller (`AssetSlot.ts:227`), which is exactly the concurrency a tier swap has today.
- **The slot serves through a reload** (`AssetSlot.ts`). The slot already holds its last `ready`
  state in `lastReady` (declared `AssetSlot.ts:75`, written at `:114`, cleared only by `release()`
  at `:292`); it gains one accessor, `committed()`, that exposes it. `current()` and `slotReady`
  read that accessor, so "this slot has a committed value" has a single expression. No new field on
  `LoadState` and no reducer change: this is the call `AssetSlot.d.ts:48-53` already made for
  `startedAtMs` — a property of the load history, not of any one state, lives beside the other
  attempt-scoped cells.
- **Requests state what is fetched, not what the store's tier is.** Six of the nine galaxy
  catalogs ship one file for every tier (`tierTargets: {}` — 2MRS, Famous, the three DESI cuts,
  Synthetic), so `{ source, tier }` makes them look different at every tier when the bytes are
  identical. An untiered source's request therefore carries **no `tier` key at all** — the honest
  request names the file, never a tier the user is not on — and that is exactly the fold of
  `willSourceReload` D3 asks for: a source drifts iff its file changes. One predicate decides both
  the request and the filename (`shipsTierVariants`), so they cannot disagree.
- **Companions ride the parent's request** by construction: the `famousGalaxiesMeta` row calls the
  same `galaxyCatalogRequest(Source.FamousGalaxy, tier)` the Famous point row does. D11 (PR-C)
  replaces this with `companionOf` on the row, from which core derives the request; until then the
  two `req`s are the same function call and cannot disagree.
- **The hi-res famous texture becomes a slot row.** Its request is its `layerSide`; its "fetch"
  allocates the texture + planner pair at that side; its commit binds the new view, hands the new
  planner to the textured-disk subsystem, and _then_ destroys the previous pair. Allocate-then-swap
  is the inverse of `rebuildHiResFamousForTier`'s destroy-then-allocate, and it is why a tier flip
  stops dropping every visible famous galaxy back to its atlas tile.
- **Per-frame cost.** `reevaluateDemand` runs every frame (`runFrame.ts:76`) over ~80 rows. The
  drift check is ordered so `row.req(tier)` is only called for rows that are non-idle, have a last
  request, and are demanded — a dozen rows in a typical frame, not eighty. Rows whose request is a
  per-tier constant (the hi-res row) hit `sameRequest`'s `Object.is` fast path and allocate nothing.

## Tech Stack

TypeScript 6.0.3, Vitest, Vite, WebGPU. Redux-saga only where a deletion touches it. No new
dependency.

## Global Constraints

From CLAUDE.md and the spec, binding on every task:

- **One symbol per file** in `src/utils/` and `src/@types/`; filename = the exported symbol.
  `src/@types/` is one TYPE per file. Deep relative imports, no barrels.
- **`type` aliases, never `interface`.**
- **Comment budget** per [`comments.md`](../conventions/comments.md): module header ≤ 10 lines,
  comment lines ≤ half the code lines in the file. This PR DELETES a lot of load-bearing prose
  with its subjects (`makeRunTierTransition`'s five sections, `rebuildHiResFamousForTier`'s six);
  do not re-home it. What survives is the invariant, stated once, where the new mechanism lives.
- **Frame-file purity**: nothing in this PR adds a symbol to `src/services/engine/frame/`. If a
  helper is needed there, it goes to `src/utils/` or `src/services/engine/wiring/`.
- **Tests mirror `src/`**; judge every test by [`testing.md`](../conventions/testing.md) — no
  runtime type tests, no registry restatements, no clamp-boundary mirrors.
- **Every file move/rename goes through `npm run move-files -- <from> <to>`** (`--dry` first),
  never `git mv` plus hand-edited imports. See `.claude/skills/refactor/SKILL.md`. No task here is
  expected to need it; if one does, that is the tool.
- **`src/data/` never imports `services/`**; `src/utils/` never imports `services/`.
- **Not behaviour-neutral, deliberately.** Every behaviour difference must be one of the ones this
  plan names. An unnamed one is a bug, not a bonus.
- **`npm run perf` is a REQUIRED paired gate** (Task 13) because the drift check runs per frame.
- Commit after every task.

## Findings at HEAD `223145f68`

Verified in this worktree while writing the plan. Re-derive rather than trust, but these are the
premises the tasks are written against.

| Fact                                                                                                                                                                                                                                           | Where                                                                       | What it means                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadCompanionAssets` is **unreachable today**. Its only caller guards on `willSourceReload`, and the only source with `companions` is `FamousGalaxy`, whose `tierTargets` is `{}` — so the predicate is false for it at every swap.           | `makeRunTierTransition.ts:56-68`, `willSourceReload.ts:41`, registry `:46`  | The deletion costs nothing and Task 8's "companions ride the parent request" is a structural guarantee for a future tiered parent, not a behaviour restoration.                                                                                                                                                                                                                    |
| `loadCompanionAssets` is **not its own file** — it is a second export of `galaxyCatalogSourceRegistry.ts:105-112`.                                                                                                                             | `galaxyCatalogSourceRegistry.ts`                                            | Task 12 deletes a function and an import, not a file. The brief's "`loadCompanionAssets.ts`" does not exist.                                                                                                                                                                                                                                                                       |
| A disabled galaxy catalog that was once loaded stays `ready` forever (point rows declare no `release`). A tier swap skips it (`willSourceReload`'s third clause); re-enabling it finds the slot non-idle, so the demand loop never re-fetches. | `assetWiring.ts:78-92`, `reevaluateDemand.ts:137`, `willSourceReload.ts:43` | **Latent bug**: a catalog toggled off, tier changed, toggled back on draws the OLD tier's data for the rest of the session. The drift edge fixes it — the re-enable makes demand true and drift fires.                                                                                                                                                                             |
| Star catalogs reload on a tier flip whenever the slot is non-idle, INCLUDING when toggled off; galaxy catalogs do not. Two families, two rules.                                                                                                | `makeRunTierTransition.ts:86-90` vs `willSourceReload.ts:43`                | The drift edge picks the galaxy rule for everyone (Ruling 2) — no network work for a row whose demand is false.                                                                                                                                                                                                                                                                    |
| `dissolvePrevious` is set at exactly one site and read at exactly one site.                                                                                                                                                                    | `makeRunTierTransition.ts:65`, `galaxyCatalogSourceRegistry.ts:145`         | Ruling 3 deletes both, plus `dissolveCatalogBuffer.ts`, `GalaxyCatalogReq.dissolvePrevious` and two test files (Task 12).                                                                                                                                                                                                                                                          |
| `SDSS`'s `small` tier target is `0` — "exclude this source from this tier". `galaxyCatalogFetcher` short-circuits a `0` target to `emptyGalaxyCatalog()` rather than fetching a file that was never written.                                   | `src/data/sources/sdss.ts:29`, `galaxyCatalogFetcher.ts:50-55`              | A medium→small swap does NOT error: the slot goes `ready` with an empty catalog and the commit uploads it, so SDSS is absent at `small` by construction. A genuinely failed reload is the separate case, and it keeps serving `lastReady` by construction — the commit never runs, so the GPU buffer is untouched. That is today's behaviour; no held-on-error decision is needed. |
| `reevaluateDemand` runs **per frame**, not per state change, despite the docblock's "on every state change".                                                                                                                                   | `runFrame.ts:76`                                                            | The drift check's cost is a per-frame cost. Task 6's ordering and Task 13's perf pairing both exist for this.                                                                                                                                                                                                                                                                      |
| `slotReady` has three consumers, all flow-field; `flow`'s `req` is `() => undefined` and can never drift.                                                                                                                                      | `flowFieldPass.ts:16`, `encodeFlowCompute.ts:53`, `shouldKeepTicking.ts:45` | The serve-through-reload change is invisible to them today. It must still be correct, because PR-D and (e) will give other families `slotReady` readers.                                                                                                                                                                                                                           |
| Two consumers read a slot's value through `state().kind === 'ready'` directly and WOULD blank during a reload.                                                                                                                                 | `earthSurfaceTier.ts:23`, `produceConstellationCaptions.ts:55`              | Task 3 re-points both at `slot.committed()`. `earthSurfaceTier` is the live one — it reports the Earth surface tier during a body-texture reload.                                                                                                                                                                                                                                  |
| `createSyntheticFallback`'s settle gate is once-only (`counted` + `unsub()` before the increment), so a reload's second `ready` cannot re-arm it.                                                                                              | `createSyntheticFallback.ts:104-127`                                        | No change needed. Verify in Task 4, do not "fix".                                                                                                                                                                                                                                                                                                                                  |
| Every commit path already overwrites in place: `renderer.upload(id, …)` (galaxy, star), `setMap` / `setRingTexture` / `setPlaceholderMap` (body), `uploadVolumeField` → `renderer.upload(id, cube)` (volumes).                                 | Task 4's file list                                                          | The only commit that does NOT is the galaxy one, and only because `dissolvePrevious` makes it fade to zero first. Ruling 3.                                                                                                                                                                                                                                                        |
| The device is not reachable from `EngineState`; registry-built slot factories get `SlotDeps = { state, cb }` only.                                                                                                                             | `SlotDeps.d.ts`, `rebuildHiResFamousForTier.ts:129`                         | The hi-res row must be `built: 'external'` and minted in `wireSlots`, beside the point and body-texture families (Task 9).                                                                                                                                                                                                                                                         |

## Rulings

Made at plan time against the code above. Do not re-open during execution; a reviewer who
disagrees escalates to the user rather than to the implementer.

**Ruling 1 — the drift edge fires on any NON-IDLE slot, not only `ready`.** D3 says "a `ready`
slot whose last request differs". `ready` alone is wrong for the `loading` case, and the cost of
being wrong is a mis-anchored selection: today `makeRunTierTransition` calls `load()`
unconditionally, so a catalog still fetching when the tier flips aborts and re-fetches at the new
tier, emitting exactly one `catalogLoaded`. Under a `ready`-only edge it would finish the OLD
fetch, emit `catalogLoaded` for the old tier — which `watchTierSaga`'s re-anchor `take` would
consume and anchor against data about to be replaced — then drift and emit a second one. Non-idle
also covers `error`, so a failed fetch retries at the new tier instead of staying stuck. `idle` is
excluded because the enqueue edge already owns it and `lastRequest()` is null there anyway.

**Ruling 2 — drift is gated on `row.demand(ctx)`.** `demand` means "should be loading right now";
a row whose demand is false must start no network work, whatever its slot state. This unifies the
two families that disagree today (see Findings row 4): a toggled-off star catalog stops re-fetching
on tier flips, and a toggled-off galaxy catalog stops silently keeping stale data forever, because
the re-enable makes demand true and the still-drifted request fires the edge then. Self-healing in
both directions, one rule.

**Ruling 3 — the tier-swap dissolve is deleted, not preserved.** `dissolveCatalogBuffer` fades a
catalog's opacity to zero, awaits the ramp, then uploads — a deliberate blank between old and new,
for one family only. D3's requirement is the opposite: replace in place, never blank, one way for
every family. It also cannot survive mechanically: `req(tier)` is a pure function of the tier and
cannot know whether this load is a tier swap, and re-deriving "is this a tier swap" inside the
demand loop reinstates the bespoke transition this PR deletes. Inferring it from "the slot already
had a value" is the alternative `GalaxyCatalogReq`'s own docblock rejects, because re-enable and
`forceReload` would then dissolve too. So: `dissolvePrevious`, `dissolveCatalogBuffer.ts` and
their two test files go (Task 12). **The user sees this**: a tier swap stops fading the old
catalog out and instead replaces it on the frame the new buffer lands. Task 13 attests it.

**Ruling 4 — `sameRequest` is a SHALLOW structural compare, and a flat-request invariant test
guards it.** `req(tier)` allocates a fresh object per call, so identity comparison always drifts
and a false-negative compare is a per-frame reload storm, not a missed reload. Every request shape
in `ASSET_WIRING` today is `undefined` or a flat object of primitives, which shallow compare
handles exactly. A nested object value would compare by identity and storm. That is a real future
bug with an expensive failure mode, so Task 1 pins the invariant over the real registry rather
than trusting a convention.

**Ruling 5 — a null `lastRequest()` is never drift.** A slot that has never loaded, or that
`release()` reset, has no request to have drifted from. Without this guard every non-idle slot
stubbed with `lastRequest: () => null` (which is how `demandTable.test.ts:107` and
`reevaluateDemand.test.ts` build theirs) would drift on the first frame, and the boot set the spec
requires unchanged would change.

**Ruling 6 — the reload is a DIRECT `slot.load()`, not a queue entry.** The queue cannot do the job:
`admit` drops a key that is already in flight (`priorityQueue.ts:130`, and the docblock above it
records why — re-admitting was a double-fetch bug), so a queued reload for a slot the queue is
currently loading would be silently discarded and Ruling 1 would be dead on its commonest case, a
flip while the fetch is still running. Drift therefore calls `slot.load(req)` directly; `load`
aborts the in-flight controller (`AssetSlot.ts:227`) and bumps the generation, which is the
supersede semantics `makeRunTierTransition` relies on today. One path, no re-check closure. The
price is that a tier swap's four or five re-fetches are not priority-ordered against each other the
way boot's are — accepted, because the alternative is a second, queue-shaped reload path that
cannot supersede, i.e. two mechanisms where the whole plan is about having one.

**Ruling 7 — `CompanionAssetReq` dies with `loadCompanionAssets`.** It exists, by its own
docblock, so `loadCompanionAssets` could dispatch `{ tier }` generically. `famousGalaxiesMeta`
takes its parent's `GalaxyCatalogReq` (Task 8); `famousStarsMeta` has no parent and its fetcher
ignores the tier, so its request becomes `undefined`, like `cf4Density`'s. Phantom tier fields in
a request are what made the six untiered galaxy catalogs look drifted in the first place.

**Ruling 8 — the hi-res famous pair gets no `onRelease`.** Nothing releases it (the row declares
no `release` predicate, and drift never releases), and `engine.destroy()` already tears the pair
down through `state.subsystems.hiResFamous` / `.hiResFamousTexture`, which the commit keeps
current. A hook with no caller is liability.

**Ruling 9 — `watchTierSaga` keeps its other two duties.** The Milky-Way `starCount` re-seed and
the galaxy focus-id re-anchor stay exactly as they are; only the `getContext('runTierTransition')`
read and the `run?.(prev, next)` call go. Both are recorded in spec §9(d)'s adjacent findings as
Layer leaks and belong to (e)/PR-D, not here. One thing does change around them: after this PR the
reload starts from a FRAME, so `tier/` must be a wake route in its own right (Task 10) rather than
riding the incidental `setMilkyWayTuning` put at `watchTierSaga.ts:73` — a `settings/` write that
(e) moves out of this saga, taking the wake with it.

## File structure

**Created**

```
src/@types/loading/HiResFamousReq.d.ts           { layerSide }
src/@types/engine/subsystems/HiResFamousPair.d.ts   the texture + planner the slot commits as one
src/utils/loading/sameRequest.ts                 shallow structural request equality
src/utils/loading/shipsTierVariants.ts           does this source ship per-tier files at all
src/services/engine/wiring/galaxyCatalogRequest.ts  the one point-source request builder
src/services/engine/wiring/requestDrifted.ts     the drift predicate the loop's fourth edge reads
src/services/engine/wiring/wireHiResFamousSlot.ts   mints the externally-built hi-res slot
tests/…                                          mirrors, listed per task
```

**Modified**

```
src/@types/loading/AssetSlot.d.ts                +committed(); lastRequest() docblock: drift, not stale-tier evict
src/@types/loading/GalaxyCatalogReq.d.ts         tier becomes optional (T5); −dissolvePrevious (T12)
src/@types/loading/FilamentReq.d.ts              the file variant, not the tier (T5)
src/@types/loading/Committer.d.ts:12             the dissolve sentence goes (T12)
src/@types/engine/state/EngineAssetSlots.d.ts:48-50  famousGalaxiesMeta/famousStarsMeta Req types; +hiResFamous
src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts:10,63,68  the loadCompanionAssets prose (T12)
src/@types/engine/EngineCallbacks.d.ts:26-27     the runTierTransition sentence (T10)
src/data/tierTargets.ts:48,90-99                 both helpers take an optional tier; the predicate moves out
src/services/loading/AssetSlot.ts:237-239,278-300  +committed(), current(), release()
src/services/loading/slotReady.ts:17             reads slot.committed()
src/services/loading/fetchers/galaxyCatalogFetcher.ts:53,56  the optional tier
src/services/loading/fetchers/filamentFetcher.ts:1-22,34  the file-variant request; −the frozen policy
src/services/engine/frame/earthSurfaceTier.ts:23-24  ready-only read → slot.committed()
src/services/engine/presentation/produceConstellationCaptions.ts:53-55  same
src/services/engine/wiring/reevaluateDemand.ts:78,88-110,113-197  −staleTierEvict, +the drift edge
src/services/engine/wiring/assetWiring.ts:85,112,246-263,268  point/star/companion/filaments req
src/services/engine/wiring/galaxyCatalogSourceRegistry.ts:24,105-112,132-145  −companions, −dissolve
src/services/engine/wiring/wireImpostorSubsystems.ts:52-62,105-106  the hi-res pair leaves (T9)
src/services/engine/phases/wireSlots.ts:124-129  wireHiResFamousSlot joins the external mints
src/services/engine/engine.ts:443                −runTierTransition
src/store/types.ts:69,127                        −RunTierTransition, −the SagaContext entry
src/store/effects/watchWakeSaga.ts:47            WAKE_ROUTES gains tierRoute (T10)
src/state/tier/watchTierSaga.ts:68,75            −the context read and the run call
src/state/selection/captureGalaxyFocusIds.ts:33,66  willSourceReload → request drift
src/services/engine/frame/renderFrame.ts:151     the dissolve comment (T12)
tests/support/createTestStore.ts:77              −runTierTransition (T10)
docs/RENDERER.md                                 the tier-swap paragraph (T11/T12 riders, swept in T11)
```

**Deleted**

```
src/services/engine/wiring/makeRunTierTransition.ts            replaced by the drift edge
src/services/engine/helpers/rebuildHiResFamousForTier.ts       replaced by the hi-res slot row
src/services/engine/wiring/willSourceReload.ts                 folded into req + demand
src/services/engine/wiring/dissolveCatalogBuffer.ts            Ruling 3
src/@types/loading/CompanionAssetReq.d.ts                      Ruling 7
tests/services/engine/wiring/makeRunTierTransition.test.ts
tests/services/engine/helpers/rebuildHiResFamousForTier.test.ts
tests/services/engine/wiring/willSourceReload.test.ts
tests/services/engine/wiring/dissolveCatalogBuffer.test.ts
tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts
```

---

## Task 1 — `sameRequest`, and the flat-request invariant

**Files:** `src/utils/loading/sameRequest.ts` (new);
`tests/utils/loading/sameRequest.test.ts`, `tests/services/engine/wiring/assetWiringRequestShape.test.ts` (new).

**Produces:**

```ts
// src/utils/loading/sameRequest.ts
/**
 * Two `AssetWiringRow.req` values that name the same fetch. `req(tier)` allocates a
 * fresh object per call, so identity is never the answer; a FALSE result is a
 * per-frame reload, so a nested object value (compared by identity here) would
 * storm — `assetWiringRequestShape.test.ts` is what keeps every row flat.
 */
export function sameRequest(a: unknown, b: unknown): boolean;
```

**Behaviour:** `Object.is` fast path; then both must be non-null non-array objects with equal own-key
counts and `Object.is`-equal values at every own key; anything else is false.

- [ ] Test `identical primitives and undefined compare equal` — `sameRequest(undefined, undefined)`,
      `sameRequest(3, 3)` true; `sameRequest(undefined, {})` false.
- [ ] Test `structurally equal flat objects compare equal across separate allocations` —
      two freshly built `{ source: 4, tier: 'large' }` are equal; `{ tier: 'large' }` vs
      `{ tier: 'medium' }` false.
- [ ] Test `an extra key is a difference in both directions` — `{ a: 1 }` vs `{ a: 1, b: 2 }` false
      and the reverse false (the equal-key-count leg, without which a superset compares equal).
- [ ] Test `a nested object value is never equal across allocations` — asserts the known
      limitation explicitly so the invariant test below reads as its guard, not as trivia.
- [ ] Test (`assetWiringRequestShape.test.ts`) `every ASSET_WIRING row's req is undefined or a flat
  record of primitives, at every tier` — iterate the real `ASSET_WIRING` × `['small','medium','large']`,
      assert each result is `undefined` or an object whose every own value is a `string | number |
  boolean`. Failing message must name the offending row key.
- [ ] Test `every ASSET_WIRING row's req is stable across two calls at the same tier` — for each row
      and tier, `sameRequest(row.req(t), row.req(t))` is true. This is the reload-storm guard stated
      as the property the loop actually depends on.
- [ ] `npm test -- sameRequest assetWiringRequestShape` green. Commit.

## Task 2 — the slot serves its committed value

**Files:** `src/services/loading/AssetSlot.ts:237-239,278-300`,
`src/@types/loading/AssetSlot.d.ts` (modify); `tests/services/loading/AssetSlot.test.ts` (modify).

**Produces:**

```ts
// src/@types/loading/AssetSlot.d.ts — one new accessor on the type
/**
 * The slot's committed state: the current one when `ready`, else the last `ready`
 * state it reached. The ONE reading of "this slot has a committed value" — a slot
 * reloading, committing or erroring over a previous commit still has one, which is
 * what lets a tier swap replace data in place. `release()` is the only thing that
 * clears it.
 */
committed(): (LoadState<T> & { kind: 'ready'; req: Req }) | null;
```

**Behaviour:** the accessor reads the `lastReady` cell that already exists (`AssetSlot.ts:75`,
written on every `ready` dispatch at `:114`, cleared by `release()` at `:292`) — no new cell, no
`LoadState` field, no reducer change. The `req: Req` in the intersection narrows `LoadState`'s
`req: unknown` for the caller; without it Task 3's `committed()?.req.tier` cannot typecheck and
would need a cast, which is the thing this accessor exists to avoid.

`current()` returns `committed()?.value ?? null`. `release()` keeps its exact semantics — the
`onRelease` hook still fires exactly once, gated on a committed value existing (now read through
`committed()`, so it also fires for a slot released mid-reload, which today leaks the previous
commit's resources). `cancel()` keeps rolling back to `lastReady` as today. Nothing else in the
file changes; do not touch the generation counter, the commit chain or the three race-checks.

The `AssetSlot.d.ts` docblocks for `lastRequest()` and `release()` state the stale-tier evict edge
as their reason; rewrite both to name the drift edge and "release is distance eviction only". The
`lastRequest()` one must also say what now separates it from `committed().req`: it is the request
of the last load ATTEMPT, so during a reload it is already the NEW one.

- [ ] Test `committed() returns the ready state itself` — including its `req`.
- [ ] Test `committed() returns the previous ready state while a reload is in flight` — a slot with
      a never-resolving second fetch; the returned `req` is the PREVIOUS request, not the new one.
- [ ] Test `committed() is null before a slot has ever committed` — idle, and a first-ever load that
      errors to exhaustion.
- [ ] Test `committed() survives a failed reload` — second fetch rejects to exhaustion;
      `state().kind` is `'error'` and `committed()` is the first ready state.
- [ ] Test `current() returns the previous value while a reload is in flight`, and
      `current() returns the new value once the reload commits`.
- [ ] Test `release() during a reload runs onRelease once with the committed value` — the leak this
      change closes; assert the hook's argument is the first value and the call count is 1.
- [ ] Test `release() drops the committed value` — after release, `committed()` and `current()` are
      null and `state().kind` is `'idle'`.
- [ ] Existing `AssetSlot.test.ts` cases stay green unedited except where they assert
      `current() === null` mid-load on a slot that had committed before — adapt those and say so in
      the task report; a case asserting the blank is asserting the behaviour this PR changes.
- [ ] `npm test -- AssetSlot` green. Commit.

## Task 3 — `slotReady` and the two direct readers

**Files:** `src/services/loading/slotReady.ts`, `src/services/engine/frame/earthSurfaceTier.ts:23-24`,
`src/services/engine/presentation/produceConstellationCaptions.ts:53-55` (modify);
`tests/services/loading/slotReady.test.ts` (modify).

**Behaviour:** `slotReady(slot)` becomes `slot != null && slot.committed() !== null` — "has a
committed value", which is what its own docblock already claims it means and what every consumer
wants. `earthSurfaceTier` returns `slot.committed()?.req.tier ?? state.tier`: the tier of the
COMMITTED request, **not** `lastRequest()`, which is set at the top of `load()`
(`AssetSlot.ts:219`) and so already reports the NEW tier the instant a reload starts — the exact
lie this function exists to prevent. `produceConstellationCaptions` reads `slot.committed()?.value`
so a reload does not drop the constellation captions for the duration of a fetch.

- [ ] Test `slotReady is true for a slot reloading with a previous commit` — the new leg, the one
      the whole PR turns on.
- [ ] Test `slotReady is false for a slot loading for the first time` — the existing
      `'committing'` case keeps its meaning for a never-committed slot; keep both.
- [ ] `earthSurfaceTier` test: add `a body-texture slot reloading at a new tier keeps reporting the
  committed tier` — drive the slot so `lastRequest()` and `committed().req` disagree, or the test
      passes against either read (the existing test file pins the ready and absent arms).
- [ ] `npm test -- slotReady earthSurfaceTier produceConstellationCaptions` green. Commit.

## Task 4 — the audit the spec schedules (no code)

**Files:** none. Output is a markdown report under the SDD workspace, quoted into the PR body.

Spec §9(d)'s "Open at plan time" list makes P2 depend on two facts. Verify each against HEAD and
record file:line evidence. The expected findings are in the Findings table above — a DIFFERENT
finding is the interesting outcome and stops the task for a ruling.

- [ ] **Every commit path overwrites in place.** Inspect and record: the galaxy point commit
      (`galaxyCatalogSourceRegistry.ts:132-170` — `dissolveCatalogBuffer` at `:145` is the one
      exception, resolved by Ruling 3; `galaxyPointRenderer.upload(catalogId, cloud)` at `:150` is
      the overwrite), the body texture family (`bodyTextureSlotRegistry.ts:35-55` — `setMap`,
      `setRingTexture`, `setTexture`), the body atlas (`bodyTextureAtlasSlot.ts:23-46` —
      `setPlaceholderMap`), the star upload (`starCatalogSlot.ts:48-55` — `renderer.upload(source,
  catalog)`), and the four volume slots through `uploadVolumeField.ts:17-29` —
      `renderer.upload(id, cube)` plus an `addVolumeField` dispatch that is idempotent per id.
      For each: does a second commit for the same id replace, or append/leak?
- [ ] **Every `slotReady` / `current()` / `state().kind === 'ready'` consumer tolerates a ready
      slot that is reloading.** `rg -n "slotReady|\.current\(\)|state\(\)\.kind" src` and classify
      every hit: re-pointed in Task 3, cosmetic (the DebugPanel rows), or unaffected. Expected
      unaffected-but-worth-stating: `createSyntheticFallback.ts:104-127` (once-only gate),
      `installSlotReadyWake.ts:32` (wakes again on the reload's commit, which is correct),
      `awaitSlotReady.ts:121-126` (resolves on the first `ready`; a reload cannot un-resolve a
      settled promise).
- [ ] **`demandTable.test.ts`'s boot set is unchanged by this PR** — read the `firedKeys`
      expectation and confirm no stub slot in the fixtures reaches the drift edge, given Ruling 5
      (`lastRequest: () => null` at `demandTable.test.ts:107`). State the conclusion; Task 6 proves
      it by running the suite.
- [ ] Report findings. No commit (or a docs-only commit if a finding lands in the PR body).

## Task 5 — requests state what is fetched

**Files:** `src/utils/loading/shipsTierVariants.ts`,
`src/services/engine/wiring/galaxyCatalogRequest.ts` (new); `src/data/tierTargets.ts:48,90-99`,
`src/@types/loading/GalaxyCatalogReq.d.ts`, `src/@types/loading/FilamentReq.d.ts`,
`src/services/loading/fetchers/galaxyCatalogFetcher.ts:53,56`,
`src/services/loading/fetchers/filamentFetcher.ts:1-22,34`,
`src/services/engine/wiring/assetWiring.ts:85,268` (modify);
`tests/utils/loading/shipsTierVariants.test.ts`,
`tests/services/engine/wiring/galaxyCatalogRequest.test.ts` (new),
`tests/services/engine/wiring/assetWiring.test.ts`,
`tests/services/loading/fetchers/filamentFetcher.test.ts` (modify).

**Produces:**

```ts
// src/utils/loading/shipsTierVariants.ts
/**
 * A galaxy catalog ships per-tier `.bin` variants iff it carries any per-tier cap.
 * ONE site: `tierFilenameForSource` picks `<base>-<tier>.bin` vs `<base>.bin` with it and
 * `galaxyCatalogRequest` decides whether the request names a tier with it, so a request
 * and the file it names cannot disagree.
 */
export function shipsTierVariants(tierTargets: Partial<Record<Tier, number>>): boolean;

// src/services/engine/wiring/galaxyCatalogRequest.ts
/** The ONE point-source request. The famous-meta companion row calls it too (D11 will derive it). */
export function galaxyCatalogRequest(source: SourceType, tier: Tier): GalaxyCatalogReq;

// src/@types/loading/GalaxyCatalogReq.d.ts — the tier is now optional: absent means
// "this source ships one file for every tier", which is what the fetcher needs to know.
export type GalaxyCatalogReq = { source: SourceType; tier?: Tier; dissolvePrevious?: boolean };

// src/@types/loading/FilamentReq.d.ts — the file variant, not the store's tier
export type FilamentReq = { small: boolean };
```

**Behaviour:** `galaxyCatalogRequest` returns `{ source, tier }` when the registry entry is a galaxy
catalog whose `tierTargets` ships variants, and `{ source }` otherwise — no phantom tier. The
predicate is lifted out of `tierFilenameForSource` (`tierTargets.ts:95-99`) so both call it.
`tierTarget` and `tierFilenameForSource` take `tier?: Tier` to accept the optional; an absent tier
is only legal for a source that ships no variants, and `tierFilenameForSource` throws otherwise,
beside its existing `binBaseName` throw. `galaxyCatalogFetcher:53,56` then passes `req.tier` through
untouched: an untiered source's `tierTarget` is `undefined` (never `0`, so the empty-catalog
short-circuit is unaffected) and its filename is the bare one.

The star row does NOT change: Gaia is the only star catalog that ships a `.bin`
(`gaia-stars.ts:34`, `tiered: true`), so `{ source, tier }` already names its file honestly.

**Filaments.** The `filaments` row's `req: (tier) => ({ tier })` (`assetWiring.ts:268`) drifts on
every flip, but the fetcher is two-file (`filamentFetcher.ts:34`). Its request becomes the file
variant — `{ small: tier === 'small' }` — so it drifts only across the small boundary, and the
fetcher reads the flag instead of re-deriving it from a tier. Delete the fetcher docblock's
"Filaments don't swap on tier flip" policy paragraph (`filamentFetcher.ts:9-13`): D3 supersedes it,
and the swap is a named behaviour change of this plan (Goal, Task 13, DoD).

- [ ] Test `an untiered galaxy catalog's request names no tier` — 2MRS, Famous and the three DESI
      cuts: `'tier' in req` is false, and `sameRequest(req(small), req(large))` is true.
- [ ] Test `a tiered galaxy catalog's request carries its tier` — SDSS/GLADE/Milliquas: the request
      differs across all three tiers, via `sameRequest`.
- [ ] Test `the request agrees with the filename` — for every galaxy-catalog source with a
      `binBaseName` and every tier pair: `tierFilenameForSource(src, a) === tierFilenameForSource(src, b)`
      iff `sameRequest(galaxyCatalogRequest(src, a), galaxyCatalogRequest(src, b))`. The invariant
      the whole drift edge rests on; derive both sides from the registry, do not restate a table.
- [ ] `assetWiring.test.ts`: `an untiered point source's request is identical across tiers` and
      `a tiered point source's request differs across tiers`, both via `sameRequest`.
- [ ] Test `the filaments request drifts only across the small boundary` — `sameRequest` true for
      medium vs large, false for small vs medium.
- [ ] Test `the filament fetcher picks its file from the request flag` — the existing per-tier
      filename cases re-point at `{ small: true/false }`.
- [ ] `npm test -- shipsTierVariants galaxyCatalogRequest assetWiring filamentFetcher tierTargets`
      green. Commit.

## Task 6 — the drift edge

**Files:** `src/services/engine/wiring/requestDrifted.ts` (new);
`src/services/engine/wiring/reevaluateDemand.ts:78,88-110,113-197` (modify);
`tests/services/engine/wiring/requestDrifted.test.ts` (new),
`tests/services/engine/wiring/reevaluateDemand.test.ts` (modify).

**Produces:**

```ts
// src/services/engine/wiring/requestDrifted.ts
/**
 * The row's request no longer names what its slot is holding. Null `lastRequest()` is
 * never drift: an idle or just-released slot has nothing to have drifted from.
 */
export function requestDrifted(
  slot: AssetSlot<unknown, unknown>,
  row: AssetWiringRow,
  tier: Tier,
): boolean;
```

**Behaviour:** `staleTierEvict` and the `isBodyTextureKey` import go. The per-row chain becomes four
edges, in this order, still inside the existing per-row `try`:

1. `idle` + demanded → enqueue, unchanged (`:137-166`).
2. `idle`, not demanded → `queue.drop`, unchanged (`:168-171`).
3. `ready` + `row.release?.(ctx)` → `slot.release()`. The distance edge alone now (Ruling 3 of the
   spec's own §5.4 unification survives; the stale-tier reason is gone).
4. non-idle + `row.demand(ctx)` + `requestDrifted(slot, row, tier)` → `void slot.load(row.req(state.tier))`,
   called DIRECTLY, no queue entry (Ruling 6). The queue would drop it (`priorityQueue.ts:130`) for
   the one case this edge exists for, and `slot.load` already aborts the in-flight controller
   (`AssetSlot.ts:227`). No run-time re-check closure: decision and action are the same moment.

Order the fourth edge's conjuncts so `row.req(tier)` is reached last — non-idle, then
`lastRequest() !== null`, then `demand`, then the compare. It runs every frame for every row.

The module docblock's "Why there are THREE edges, not two" section becomes four and must state the
new invariant in one place: **drift reloads, it never releases; `release()` is distance eviction
only.** Its claim that "a throw out of `req(tier)` or `slot.load()` no longer lands here, because
both now run inside the enqueued closure" (`reevaluateDemand.ts:63-68`) stops being true — the
drift edge calls both directly, inside the per-row `try` — so correct that paragraph in the same
commit. Delete `staleTierEvict`'s docblock with the function; do not re-home it.

- [ ] Test (`requestDrifted.test.ts`) `a null lastRequest is never drift` (Ruling 5).
- [ ] Test `an equal request is not drift` and `a differing request is drift` — built from the real
      `pointRow` shape via `sameRequest`.
- [ ] `reevaluateDemand.test.ts`: `a ready slot whose request drifted is re-loaded, not released` —
      assert `slot.load` called once with the new request AND `slot.release` never called. This is
      the headline assertion of the PR.
- [ ] Test `an errored slot whose request drifted is re-loaded` (Ruling 1).
- [ ] Test `a drifted slot whose demand is false is left alone` (Ruling 2) — no `load`, no
      `release`, no queue entry.
- [ ] Test `a ready slot whose release predicate fires is released, not reloaded` — the distance
      edge still wins over drift for a row that has both.
- [ ] Test `a drifted loading slot is superseded by a direct load` (Rulings 1 and 6) — with a stub
      queue, `slot.load` is called once with the new request and NO entry reaches the batch.
- [ ] Test `a superseded queued fetch does not surface as a queue error or retry` — a slot whose
      first load came from the idle edge's enqueued closure (`await slot.load(...)`), then aborted
      by the drift edge's direct load. Verify how that `await` actually resolves against
      `AssetSlot.ts`'s `runLoad` before writing the assertion, and pin it: the queue must see one
      completed entry, not a rejection it re-schedules. If it rejects, stop and report.
- [ ] Test `a body-texture slot at a stale tier reloads in place` — the generalisation of the
      deleted `staleTierEvict`; the old evict-then-reload assertions in this file are REPLACED, and
      the task report says which.
- [ ] `npm test -- reevaluateDemand requestDrifted demandTable` green, `demandTable.test.ts`
      **unedited** (Task 4's conclusion; if it needs an edit, stop and report).
- [ ] Commit.

## Task 7 — the re-anchor capture asks the row, not a second predicate

**Files:** `src/state/selection/captureGalaxyFocusIds.ts:33,66` (modify);
`tests/state/selection/captureGalaxyFocusIds.test.ts` (modify).

**Behaviour:** the `willSourceReload(...)` call becomes the same two questions the demand loop
asks, in the same terms: the request drifts —
`!sameRequest(galaxyCatalogRequest(ref.source, prevTier), galaxyCatalogRequest(ref.source, nextTier))`
— and the catalog is enabled, read from `state.settings.galaxyCatalogs.items[...].enabled` exactly
as `pointRow.demand` reads it. The module docblock's paragraph on delegating to a shared predicate
is rewritten to say what now keeps capture and loop in agreement: both compute the request from
`galaxyCatalogRequest`, and the loop reloads iff that request drifts.

The synthetic clause the old predicate carried is subsumed: `Synthetic`'s `tierTargets` is `{}`, so
its request never drifts. Keep a test pinning it, because the old predicate named it explicitly and
losing the guarantee silently would hang a `take`.

- [ ] Test `a tier-agnostic source is not captured` — 2MRS and Famous, at any swap.
- [ ] Test `synthetic is never captured`.
- [ ] Test `a disabled source is not captured` — the existing case at
      `captureGalaxyFocusIds.test.ts:194`; its comment references `makeRunTierTransition` and must
      be re-pointed at the demand rule (Ruling 2).
- [ ] Test `a tiered enabled source is captured with its durable id`.
- [ ] `npm test -- captureGalaxyFocusIds` green. Commit.

## Task 8 — the companion rides its parent's request

**Files:** `src/services/engine/wiring/assetWiring.ts:246-263`,
`src/@types/engine/state/EngineAssetSlots.d.ts:48-50`,
`src/services/loading/fetchers/famousGalaxiesMetaFetcher.ts`,
`src/services/loading/fetchers/famousStarsMetaFetcher.ts`,
`src/services/loading/slots/famousGalaxiesMetaSlot.ts`, `src/services/loading/slots/famousStarsMetaSlot.ts`
(modify); `src/@types/loading/CompanionAssetReq.d.ts` (delete, Task 12);
`tests/services/engine/wiring/assetWiring.test.ts` (modify).

**Behaviour:** the `famousGalaxiesMeta` row's `req` becomes
`(tier) => galaxyCatalogRequest(Source.FamousGalaxy, tier)` — the identical call the Famous point
row makes, so the two cannot disagree by construction, and the meta re-fetches exactly when its
parent does and never otherwise. Its slot's `Req` type parameter becomes `GalaxyCatalogReq`; the
fetcher still ignores the request. `famousStarsMeta` has no parent and its fetcher ignores the tier,
so its `req` becomes `() => undefined` and its `Req` becomes `void` (Ruling 7).

Write, in the row's comment, one sentence: **D11 (PR-C) replaces this shared call with
`companionOf` on the row, from which core derives the companion's demand, priority and request.**
That is the seam this task must not foreclose — do not add a `companionOf` field here, and do not
add any core machinery that reads one.

- [ ] Test `the famous-meta row's request equals the famous point row's request at every tier` —
      via `sameRequest` over the real `ASSET_WIRING` rows, all three tiers. The whole point of the
      task, and the test D11 will re-point rather than delete.
- [ ] Test `the famous-stars-meta row's request is undefined at every tier`.
- [ ] `npm run typecheck` — the `Req` type changes are the check; no cast may appear.
- [ ] `npm test -- assetWiring famousGalaxiesMeta famousStarsMeta` green. Commit.

## Task 9 — the hi-res famous texture becomes a slot row

**Files:** `src/@types/loading/HiResFamousReq.d.ts`,
`src/@types/engine/subsystems/HiResFamousPair.d.ts`,
`src/services/engine/wiring/wireHiResFamousSlot.ts` (new);
`src/@types/loading/AssetKey.d.ts`, `src/@types/engine/state/EngineAssetSlots.d.ts`,
`src/services/engine/wiring/assetWiring.ts`, `src/services/engine/wiring/wireImpostorSubsystems.ts:52-62,105-106`,
`src/services/engine/phases/wireSlots.ts:124-129` (modify);
`tests/services/engine/wiring/wireHiResFamousSlot.test.ts` (new),
`tests/services/engine/wiring/wireImpostorSubsystems.test.ts` (modify).

**Produces:**

```ts
// src/@types/loading/HiResFamousReq.d.ts
/** The LOD-3 array's per-layer edge length. WebGPU textures are immutable in shape, so a
 *  change of side means a new allocation — which is exactly a new request. */
export type HiResFamousReq = { readonly layerSide: number };

// src/@types/engine/subsystems/HiResFamousPair.d.ts
/** Allocated together, bound together, destroyed together: the planner subscribes to the
 *  texture's evict handler, so neither outlives the other. */
export type HiResFamousPair = {
  readonly texture: HiResFamousTexture;
  readonly subsystem: HiResFamousSubsystem;
};

// src/services/engine/wiring/wireHiResFamousSlot.ts
export function wireHiResFamousSlot(
  state: EngineState,
  device: GPUDevice,
  texturedDiskRenderer: Pick<TexturedDiskRenderer, 'bindHiResArray'>,
): void;

// src/services/engine/wiring/assetWiring.ts — the row, `built: 'external'` (the device is not
// reachable from SlotDeps), one per-tier frozen request so the compare hits Object.is.
{
  key: 'hiResFamous',
  built: 'external',
  factory: externalFactory,
  req: (tier) => HI_RES_REQ_BY_TIER[tier],
  demand: () => true,
  priority: 1,
}
```

**Behaviour.** `AssetKey` gains `'hiResFamous'`; `EngineAssetSlots` gains
`hiResFamous: AssetSlot<HiResFamousPair, HiResFamousReq> | null`; `slotFor` routes the new string
key. The slot's `fetch` allocates — `createHiResFamousTexture({ device, layerSide, layerCount:
HI_RES_LAYER_COUNT })`, `initTexture()`, `createHiResFamousSubsystem({ texture, requestRender })` —
and returns the pair; there is no network and no progress. Its `commit` runs in this order, which is
the point of the task:

1. `texturedDiskRenderer.bindHiResArray(pair.texture.getTextureView())`
2. `state.subsystems.texturedDisks?.setHiResFamous(pair.subsystem)`
3. capture the PREVIOUS `state.subsystems.hiResFamous` / `.hiResFamousTexture`, write the new pair
   onto both fields, then destroy the previous — subsystem first, texture second (the planner holds
   the texture's evict-handler subscription; `rebuildHiResFamousForTier.ts:88-96` is the current
   statement of that order and the only part of it worth carrying over).

Destroying last is what stops a tier flip from dropping every visible famous galaxy to its atlas
tile mid-swap — the behaviour `rebuildHiResFamousForTier` has today and the reason this row exists.
No `onRelease` (Ruling 8). `wireImpostorSubsystems` stops allocating the pair and stops calling
`bindHiResArray`; it passes `hiResFamous: undefined` into `createTexturedDiskSubsystem`, which is
already a supported shape (LOD-3 sentinel `-1 / 0` until the first commit, a frame or two after
boot). `wireSlots` calls `wireHiResFamousSlot` inside the existing
`texturedDiskRenderer !== null && proceduralDiskRenderer !== null` block, where the device is in
hand. A composition without those renderers mints no slot, `slotFor` returns undefined, and the row
is skipped — the same absence contract the point rows have.

`priority: 1` puts a synchronous GPU allocation at the head of the bounded NETWORK queue, ahead of
every download. That is acceptable because it occupies its pipe for microseconds, not for a
multi-megabyte fetch; the alternative — a parallel "allocate now, outside the queue" path for one
row — is the second mechanism this plan exists to remove.

- [ ] Test `the slot allocates at the requested layerSide` — inject factory stubs; assert
      `createHiResFamousTexture` saw `layerSide: 512` for `small` and `1024` for `medium`.
- [ ] Test `commit binds the new view and hands over the new planner BEFORE destroying the old
  pair` — the ordering contract; record call order and assert the previous texture's `destroy`
      runs after `bindHiResArray`.
- [ ] Test `commit destroys the previous subsystem before the previous texture`.
- [ ] Test `a first commit destroys nothing` — boot, no previous pair.
- [ ] Test `commit publishes the new pair on state.subsystems` — both fields.
- [ ] `wireImpostorSubsystems.test.ts`: the hi-res construction and `bindHiResArray` assertions
      move out to the new file; report which cases moved and which died.
- [ ] `demandTable.test.ts` unedited — the row is `demand: () => true` but its slot is absent from
      that fixture, so `slotFor` skips it. Confirm; if the boot set changes, stop and report.
- [ ] `npm test -- wireHiResFamousSlot wireImpostorSubsystems demandTable` green. Commit.

## Task 10 — delete `makeRunTierTransition`, and wake on `tier/`

**Files:** delete `src/services/engine/wiring/makeRunTierTransition.ts` and
`tests/services/engine/wiring/makeRunTierTransition.test.ts`; modify
`src/services/engine/engine.ts:443`, `src/store/types.ts:69,127`,
`src/state/tier/watchTierSaga.ts:46,68,75`, `src/@types/engine/EngineCallbacks.d.ts:26-27`,
`src/store/effects/watchWakeSaga.ts:47`, `tests/support/createTestStore.ts:77`,
`tests/state/tier/watchTierSaga.test.ts`, `tests/store/effects/watchWakeSaga.test.ts`,
`tests/services/engine/registerReconcile.test.ts`.

```bash
git rm src/services/engine/wiring/makeRunTierTransition.ts \
       tests/services/engine/wiring/makeRunTierTransition.test.ts
```

**Behaviour:** `RunTierTransition` and `SagaContext.runTierTransition` go; `cb.setSagaContext` loses
the field; `watchTierSaga` loses the `getContext` read and the `run?.(prev, action.payload)` call
and KEEPS everything else (Ruling 9) — the pre-write focus-id capture, the hover clear, the
`setTier` put, the Milky-Way `starCount` re-seed and the re-anchor loop. Prose references to the
runner in `main.tsx:44`, `SagaContextProvider.tsx:23`, `createAppStore.ts:22`, `useEngine.ts:34,66`,
`watchFocusTweenSaga.ts:5` and `watchSelectionRowsSaga.ts:24` are corrected in the same commit —
name the demand loop, or drop the clause.

`WAKE_ROUTES` (`watchWakeSaga.ts:47`) gains `tierRoute` (`src/store/constants.ts:25`) in this same
commit, and it is load-bearing from here on: until now the reload started from the saga's own
fire-and-forget `run?.()`, but after this task it starts from a FRAME. A `tier/` write must
therefore wake the render loop in its own right rather than riding the incidental
`setMilkyWayTuning` put at `watchTierSaga.ts:73` — a `settings/` write that (e) moves out of this
saga, which would take the wake with it.

- [ ] Test (`watchWakeSaga.test.ts`) `a tier write wakes the render loop` — the same shape as the
      existing settings/camera/time cases.
- [ ] `rg -n "runTierTransition|RunTierTransition" src tests` returns nothing.
- [ ] `watchTierSaga.test.ts` keeps its coverage of the surviving duties and loses only the runner
      assertions; `registerReconcile.test.ts`'s "the two ride one call" case narrows to `reconcile`
      or dies — say which and why in the report.
- [ ] Manual: with the branch's dev server, flip the tier and confirm the galaxy catalogs still
      reload (the drift edge is now the only path). Attest in the task report, not as a gate.
- [ ] `npm test`, `npm run typecheck` green. Commit.

## Task 11 — delete `rebuildHiResFamousForTier`

**Files:** delete `src/services/engine/helpers/rebuildHiResFamousForTier.ts` and
`tests/services/engine/helpers/rebuildHiResFamousForTier.test.ts`; sweep
`docs/RENDERER.md` and `src/@types/engine/subsystems/TexturedDiskSubsystem.d.ts:69` for the
destroy-and-rebuild-on-tier-flip claim, which is now false.

```bash
git rm src/services/engine/helpers/rebuildHiResFamousForTier.ts \
       tests/services/engine/helpers/rebuildHiResFamousForTier.test.ts
```

- [ ] `rg -n "rebuildHiResFamousForTier" src tests docs` returns nothing.
- [ ] The `TexturedDiskSubsystem.setHiResFamous` docblock states the new truth: the pair is a slot
      whose commit hands over a new planner; the renderer keeps drawing the old one until then.
- [ ] `npm test`, `npm run typecheck` green. Commit.

## Task 12 — delete `willSourceReload`, `loadCompanionAssets`, `CompanionAssetReq` and the dissolve

**Files:** delete `src/services/engine/wiring/willSourceReload.ts`,
`src/services/engine/wiring/dissolveCatalogBuffer.ts`,
`src/@types/loading/CompanionAssetReq.d.ts`,
`tests/services/engine/wiring/willSourceReload.test.ts`,
`tests/services/engine/wiring/dissolveCatalogBuffer.test.ts`,
`tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts`; modify
`src/services/engine/wiring/galaxyCatalogSourceRegistry.ts:24,46,99-112,132-145`,
`src/@types/loading/GalaxyCatalogReq.d.ts`, `src/@types/loading/Committer.d.ts:12`,
`src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts:10,63,68`,
`src/services/engine/frame/renderFrame.ts:151`.

```bash
git rm src/services/engine/wiring/willSourceReload.ts \
       src/services/engine/wiring/dissolveCatalogBuffer.ts \
       src/@types/loading/CompanionAssetReq.d.ts \
       tests/services/engine/wiring/willSourceReload.test.ts \
       tests/services/engine/wiring/dissolveCatalogBuffer.test.ts \
       tests/services/engine/wiring/galaxyCatalogSourceRegistryFade.test.ts
```

**Behaviour:** `loadCompanionAssets` (a second export of `galaxyCatalogSourceRegistry.ts`, not a
file) goes with its docblock and the `companions` field on `GalaxyCatalogSourceConfig` — the field
has no other reader, and D11 re-mints the relation as `companionOf` on the companion's own row.
`dissolvePrevious` leaves `GalaxyCatalogReq`; the galaxy commit's `if (req.dissolvePrevious) await
dissolveCatalogBuffer(...)` line goes, so the commit's first act is the upload (Ruling 3). The
`req` parameter of the commit becomes unused — drop it from the signature rather than
underscore-prefixing it, unless `Committer` requires the arity.

`galaxyCatalogSourceRegistryFade.test.ts` is deleted in full: both its cases are about
`dissolvePrevious`. Check before deleting whether it also pins the post-upload
`syncVisibilityFadeItem` call; if it does, that leg MOVES to `galaxyCatalogSourceRegistry.test.ts`
rather than dying.

- [ ] `rg -n "willSourceReload|dissolvePrevious|dissolveCatalogBuffer|loadCompanionAssets|CompanionAssetReq|companions" src tests` returns nothing.
- [ ] The surviving fade behaviour (a catalog fades IN on first commit, holds through a reload) has
      a test — moved, not re-invented.
- [ ] `npm test`, `npm run typecheck` green. Commit.

## Task 13 — gate: paired perf, and the visual pass the user attests

- [ ] `npm run typecheck` (both projects) — green.
- [ ] `npm run build` — green.
- [ ] `npm test` — green. **No pre-committed number.** Five test files die and several are adapted;
      report the ACTUAL delta with a reason for every difference, reconciled against Tasks 2, 6, 9,
      10 and 12's reports of which assertions moved where. An unexplained drop means coverage was
      deleted where it should have moved.
- [ ] **Paired `npm run perf`, REQUIRED.** Read `.claude/skills/perf/SKILL.md` first. Start this
      worktree's dev server and take the port from ITS `Local:` line — in a worktree Vite
      auto-increments past 5173, and omitting `--url` silently measures another branch's server.
      Baseline on a scratch worktree at `223145f68` with its own server, alternating A-B-A-B:

      ```bash
      npm run perf -- --url http://localhost:<port> --scenario <name> --frames 30
      ```

      Scenarios: `full-survey` (the whole registry walked per frame), `solar-system` (the ~40
      body-texture rows, whose `req` clamps a tier and whose `demand` reads derived body states),
      `milky-way`. Quote **MERGED** medians only; per-layer rows carry a 1–3 ms floor and on Apple
      Silicon adjacent slots with identical medians are a TBDR artefact, never additive. What this
      is looking for: the per-frame drift check must not show up at all. **A regression HALTS the
      landing** — report the numbers and hand the land/park call to the user.

- [ ] **Visual pass on a tier swap, per family.** The user attests this; the agent sets it up and
      describes what to look for. In every case the shape of the claim is the same: **the old data
      stays on screen at full brightness until the new data lands, then is replaced in one frame.
      No blank, no fade-out, no gap.**
  - **Galaxies** — the `full-survey` pose. Settings › tier medium → large. SDSS and GLADE points
    must NOT fade out first (they do on `main`, that is Ruling 3's deliberate change); the point
    count in the DebugPanel jumps when the new buffer lands. Then large → medium, and back.
  - **Body textures** — fly to Earth, close approach so the surface is high-res. Flip the tier. The
    globe must not drop to the flat low-res atlas placeholder at any point; the detail level
    changes in place. This is the edge the deleted `staleTierEvict` used to blank.
  - **Stars** — a star-field pose (Milky Way visible). Flip the tier. The star field must not
    vanish; the count chip changes when the new bin commits.
  - **Hi-res famous galaxies** — approach M31 or M51 until the hi-res thumbnail is resolved, then
    flip small ↔ medium (512 → 1024 layerSide). The thumbnail must not drop back to its blurry
    atlas tile at any point.
  - **Volumes** — MCPM on, flip the tier. The volume must not blank while the new `.scfd` fetches.
  - **No spurious re-fetches** — with the network panel open, a tier flip must request only the
    tiered assets: `sdss-*`, `glade-*`, `milliquas-*`, the Gaia bin, the MCPM and Polyphorm `.scfd`.
    NOT `2mrs.bin`, `famous.bin`, the three DESI files, or `famous_galaxies_meta.json`. This is
    Task 5's whole point and the check that the request really states what is fetched.
  - **Filaments** — with filaments enabled, a medium↔large flip must fetch NO filament file at all,
    and a small↔medium flip must fetch the other one (`filaments.bin` / `filaments-small.bin`)
    exactly once. The skeleton must not blank while it does.
  - **The re-enable case** — disable a tiered catalog, flip the tier, re-enable it. It must come
    back at the NEW tier. On `main` it comes back at the old one (Findings row 3).

**Reject if:** the perf pairing was skipped, run without `--url`, or quoted from per-layer rows; a
visual case was attested without being looked at; the test delta was reported as a number without
its per-difference reasons; any behaviour difference outside this plan's named set is observed and
not escalated.

---

## Definition of Done

**Deliverable inventory**

- [ ] `rg -n "makeRunTierTransition|rebuildHiResFamousForTier|willSourceReload|loadCompanionAssets|runTierTransition|staleTierEvict|dissolvePrevious|CompanionAssetReq" src tests docs`
      returns nothing.
- [ ] `reevaluateDemand.ts` is the ONE place a tier change starts work, and its module docblock
      states the invariant once: drift reloads in place, `release()` is distance eviction only.
- [ ] `slotReady` and `AssetSlot.current()` both read `committed()`; no consumer re-writes the
      ready-or-last-ready two-arm test, and no `held` field was added to `LoadState`.
- [ ] An untiered galaxy catalog's request carries no `tier` key, and one predicate
      (`shipsTierVariants`) decides both that and the filename.
- [ ] `src/@types/engine/state/EngineAssetSlots.d.ts` carries `hiResFamous`, and the LOD-3 pair is
      allocated in exactly one place — the slot's fetch.
- [ ] The `famousGalaxiesMeta` row's `req` is the identical call the Famous point row makes, with a
      comment naming `companionOf` (D11, PR-C) as its replacement, and NO `companionOf` field
      exists yet.
- [ ] Every `ASSET_WIRING` row's `req` returns `undefined` or a flat record of primitives, pinned by
      a test over the real registry.
- [ ] `demandTable.test.ts`'s boot `firedKeys` set is byte-identical to `main`.

**Named observable behaviours** (Task 13's pass, user-attested)

- [ ] A galaxy-catalog tier swap replaces the points in place — no fade-out, no gap.
- [ ] An Earth close-approach tier swap never shows the low-res atlas placeholder.
- [ ] A star-catalog tier swap never empties the star field.
- [ ] A hi-res famous thumbnail never drops back to its atlas tile across a 512 ↔ 1024 swap.
- [ ] An MCPM tier swap never blanks the volume.
- [ ] A tier flip re-fetches only the assets whose file actually differs — not 2MRS, Famous, DESI
      or the famous-meta sidecar.
- [ ] A catalog disabled across a tier flip comes back at the NEW tier when re-enabled.
- [ ] A small↔medium flip swaps the filament skeleton file; a medium↔large flip fetches none.

**The deferral boundary** — nothing else. No `Layer` value, no `companionOf`, no source row moved,
no settings type touched, no renderer moved, no change to `watchTierSaga`'s re-anchor or Milky-Way
duties.

## Out of scope (deferred)

- **`companionOf` (PR-C / D11).** The companion relation stays authored as two `req`s that call the
  same function. D11 makes it one field on the companion's asset row, from which core derives
  demand (parent not idle), priority (parent + 1) and request (the parent's, riding this PR's drift
  edge). Task 8 is written so that lands as a substitution, not a rework.
- **`watchTierSaga`'s two Layer leaks** (spec §9(d) adjacent findings): `captureGalaxyFocusIds`
  re-anchoring is galaxy knowledge and `setMilkyWayTuning`'s per-tier `starCount` is Milky Way
  knowledge, both held in a core saga. Task 7 re-points the first onto the new request authority and
  changes nothing about where it lives. They move with their Layers, (d) PR-D and (e).
- **P1 and P3–P7** — the contract types, effects-into-`frame`, selection and focus-id composition,
  facts and the handle deletion, `createLayers`, and the galaxy-side un-braids. PR-B and PR-C.
- **The `GALAXY_CATALOG_SOURCE_REGISTRY` / `ASSET_WIRING` double registration.** This PR reads both
  and deletes only `companions` from the first. The registry dies in PR-C (D11), which consumes
  backlog items B and C.
- **`ReadyFrameContext`, `isEngineReady`, `EngineData`** — untouched; PR-B and PR-D.
- **The four `rebuildOnSwapFormat` core rows** (D9) — adjacent, and not a tier concern.
- **A `release` predicate for the volume slots.** `assetWiring.ts:274-278` records that adding one
  requires wiring `onRelease` to `unloadVolumeField` or leaking four GPU resources. Unchanged here:
  drift never releases, so this PR neither needs nor provides it.
