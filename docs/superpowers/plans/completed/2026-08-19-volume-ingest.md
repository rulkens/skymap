# Volume-ingest consolidation — rung 4 of the engine-composition ladder

**Status.** Ready to execute on `refactor/volume-ingest` (base `df590f5d3`).
**Date.** 2026-08-19.
**Scope.** Rung 4 of the ladder in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md)
(decision #9): _"**4** volume-ingest consolidation (3 copies → 1 fn; imperative
side-door's fate decided here)"_, widened by decision #11 to _"multi-item ingest
normalization (`upload`/`unload` verbs)"_, and carrying the two hand-offs
decision #13 left here: **site 4** (`reevaluateDemand`'s stale-tier evict) and
the **re-open condition** for a generated-artifact row table. Under decision #10
(row-divergence rule) and #12 (rows are identified in their own domain). There
is **no separate spec** — decisions.md is this rung's authority, exactly as for
rungs 2 and 3. The Track A design doc
([`specs/2026-08-17-subsystem-bundles-design.md`](../specs/2026-08-17-subsystem-bundles-design.md))
is reference-not-executable per #9, but its 2026-08-17 investigation of the
imperative door is evidence this rung re-checks rather than re-runs. Every claim
below is cited `file:line` against this checkout.

**Headline.** The docs say "ingest ×3". The exhaustive survey found **five**
copies of the same commit body, and four differences between them — the settings
seed, the wake, the id source, the null-renderer guard. All four turn out to be
**accidental**: each has a majority form that is also the correct form, so the
shared function takes them as-is with **no options bag, no flags, no
parameterized policy** — one function, four arguments, five callers. The one
genuine asymmetry (the flow field, one renderer over) is essential and stays a
separate copy, recorded. The rung's other half is adjudication: the imperative
door is **kept and folded** (deleting it would create a third dead release
surface), the re-open condition is **checked and fails** (after normalization the
`generated` family still has exactly one member), and site 4 gets **a ruling, not
a patch** — its compare is already split correctly, with the fact resource-owned
and the policy loop-owned. Three of the four inherited questions (the re-open
condition, site 4's compare, the imperative upload's kind) therefore close with
prose; the code delta is one extracted function and four deleted copies.

**Ground preparation.** None needed — the ladder itself _is_ the ground-prep
programme (decision #9), and this rung's prerequisites have landed: rung 1 (#571)
owns construction, rung 2 (#575) shipped `RenderTargets.reconcile`, rung 3 (#579)
shipped the resource-owned staleness ruling this rung answers. No prep refactor
precedes the tasks below.

**Behaviour-neutral, with two declared deltas.** Every task preserves the
triggers, the cadence, the null handling, the single-writer properties, and the
second load driver (`makeRunTierTransition`'s direct `slot.load`) exactly —
except for two paths, both named and argued in findings 1 and 2: the DEV
synthetic fixtures' settings seed (today unreachable, and a `TypeError` if it
ever ran) and the imperative door's pre-bootstrap window (zero production
callers). Nothing else changes observable behaviour. See "How parity is
demonstrated".

**Counting vocabulary** (used consistently below, because the three numbers all
appear and are all different): **4 ingest call sites in slot source** — three
registry slot factories plus the one shared closure that mints all three DEV
fixtures (`syntheticVolumeSlots.ts:71-101`); **6 volume slots at runtime** —
`mcpm`, `cf4Density`, `polyphorm2Mrs` plus the three fixtures; **5 callers of the
shared function** after this rung — the 4 slot-source call sites plus
`handle.volumes.add`. "Five copies" refers to the five hand-written commit bodies
that exist today.

## What this rung does and does not touch

**In scope:**

- The five copies of the volume-ingest commit body: `cf4DensitySlot.ts:33-52`,
  `mcpmSlot.ts:29-48`, `polyphorm2MrsSlot.ts:22-34`,
  `syntheticVolumeSlots.ts:77-100`, `addVolumeField.ts:19-39`.
- The imperative door's two files
  (`src/services/engine/handles/addVolumeField.ts`,
  `src/services/engine/handles/removeVolumeField.ts`), their home, their names,
  and the handle entries that expose them (`engine.ts:846-851`,
  `src/@types/engine/handles/EngineVolumesHandle.d.ts:19-25`).
- `volumeFieldRenderer`'s release half — `unload` (`:332-345`) and the
  replace-on-ingest destroy inside `upload` (`:266-273`), both untested today.
- The two orphaned volume-settings copy-on-write helpers that the store dispatch
  superseded (`helpers/writeVolumeFieldSetting.ts`,
  `helpers/removeVolumeFieldSetting.ts`) — the residue of the exact divergence
  this rung deletes.
- **decision #14** in decisions.md: the ingest contract, the door's fate, the
  answer to #13's re-open condition, the site-4 ruling, and #11's widening
  boundary. This is the rung's durable deliverable.
- The six-item doc sweep rung 3 deferred, plus the ingest lines in
  `current-contracts-map.md` and `renderer-layer-outliers.md` that this rung
  makes stale.

**Out of scope, with reasons:**

- **`staleTierEvict` (`reevaluateDemand.ts:97-106`) — no code change.** Ruled in
  D5 below; it is already the right shape. The clamp-ceiling non-thrash test
  (`reevaluateDemand.test.ts:300-361`) must pass untouched.
- **A generated-artifact registry, row type, or walker.** #13's re-open
  condition is checked in D4 and fails.
- **The `SubsystemBundle` umbrella and the `ArtifactDecl` union.** Deferred by
  #9 until the rungs land.
- **`flowFieldSlot.ts:29-45`** — the sixth, adjacent copy. Ruled out in D2 with
  its reason, and the ruling is recorded in the shared function's header.
- **`starCatalogRenderer`'s missing `unload`, `texturedBodyRenderer`'s
  `setMap`/`clearMap`, `atmosphereShell`'s construction-baked item set**
  (`renderer-layer-outliers.md:29`, family D) — D6 draws the boundary.
- **`PointRenderer.unload` and `filamentRenderer.clear`** — the other two dead
  ingest surfaces (`renderer-layer-outliers.md:166`). Confirmed dead by this
  rung's grep and left alone, with the reason recorded (D3).
- **Wiring `onRelease` on volume rows** — D7: volume rows are load-once with no
  release predicate, so an `onRelease` handler could never fire. The coupling is
  recorded where a future predicate would be added, not pre-built.
- **Earth tiles** (`runFrame.ts:611-622`) — the `streamed` lifecycle, ruled out
  of this rung by #13. Do not conflate.
- **Rungs 5+** — wake-vote fold, debug derivation, the
  `FADE_ROW`/`VISIBILITY_ACTION_ROW` derivation decision.

## The five copies, and the four differences between them

All five end in the same three effects: `volumeFieldRenderer.upload(id, cube)` →
`syncVisibilityFades(state, { animate: true, only: ['volumeField'] })`, guarded
on the renderer being constructed. The comment blocks are near-verbatim across
`cf4DensitySlot.ts:37-51`, `mcpmSlot.ts:33-47` and `polyphorm2MrsSlot.ts:26-33`.

| dimension         | cf4 / mcpm / polyphorm2Mrs         | synthetic fixtures       | `addVolumeField`             |
| ----------------- | ---------------------------------- | ------------------------ | ---------------------------- |
| settings-row seed | assumed pre-seeded (construction)  | inline copy-on-write     | `store.dispatch(add…)`       |
| explicit wake     | none (settings route + slot-ready) | none                     | `requestRender()`            |
| id source         | `SOURCE_REGISTRY[Source.X].id`     | closure-baked fixture id | caller's argument            |
| null renderer     | `if (!renderer) return;`           | `if (!renderer) return;` | `?.upload`, then fade + wake |
| AssetSlot         | full (race checks, retry, commit)  | full                     | none                         |
| trigger           | `reevaluateDemand` + tier swap     | fade-layer `post` hook   | imperative call              |

**Each difference is classified, not accommodated** (simplicity convention: a
section that exists to teach handling of an asymmetry is a stop-and-un-braid
signal):

1. **Settings seed — accidental.** The three mechanisms are one mechanism
   (the store) plus two work-arounds. The store dispatch is an identity no-op
   when the row exists (`settingsSlice.ts:312-318`, pinned by
   `settingsSlice.test.ts:161-173`), so it is correct for all five callers. The
   fixtures' inline mutation is the odd one out **and is broken** — finding 1.
   Resolution: the shared function always dispatches. No parameter.
2. **Wake — accidental, and the door's comment calling it "essential" is
   FALSE.** `settings/` is a wake route: `watchWakeSaga.ts:47-55` takes _every_
   settings-route action and calls `fx.requestRender()` (`engine.ts:396`).
   `settings/addVolumeField` is such an action, so the door's explicit
   `requestRender()` (`addVolumeField.ts:35-38`) is already redundant today, and
   is redundant on all five paths once the shared function dispatches
   unconditionally. It is also cheap and harmless: `requestRender` is a
   coalescing dirty-mark (`renderScheduler.ts:79-81`: `if (token !== 0) return;`).
   Resolution: **keep the one line, relabelled redundant-but-local** — the ingest
   path's wake then does not depend on saga wiring order — and hand the deletion
   to **rung 5**, the wake-vote fold, which is the rung that owns "who wakes the
   loop" and can remove all three of this path's wake owners
   (`watchWakeSaga`, `installSlotReadyWake`, this line) in one accounting.
   No parameter either way; #14 must carry the redundancy, not the false
   "essential" rationale.
3. **Id source — not a difference.** It is the function's `id` argument; each
   caller already holds its own id in its own domain (#12).
4. **Null renderer — accidental.** Four of five copies return early; the door
   alone continues to fade and wake with nothing uploaded, which contradicts its
   own docblock ("a silent no-op if it isn't ready yet (re-add once booted)").
   Resolution: the majority form, guarding the whole body. Finding 2 argues the
   delta.

**The one asymmetry this rung mints, classified by the same rule: essential.**
`uploadVolumeField` returns early when the renderer is null; `unloadVolumeField`
does not — it `?.unload`s and still dispatches the row removal. That is not
sloppiness carried over: the settings row's lifetime is **independent** of the
GPU resource's, the same decoupling `volumeFieldRenderer.ts:335-339` documents
for fade handles (registered forever by `seedFades`; `unload` releases GPU
resources only). Removing a row is therefore correct whether or not a cube is
resident, while seeding a row for a cube that could not be uploaded would leave a
field the draw loop can never satisfy. Essential ⇒ kept, one line in
`unloadVolumeField`'s header, not a section.

**The essential asymmetry, kept:** `flowFieldSlot.ts:35-47` uploads a _velocity_
cube into a _different, singleton_ renderer (`upload(cube)` — no id), gates a
_different_ fade key (`only: ['flow']`) behind a _different_ guard
(`fieldLoaded()`, `fadeLayers.ts:290`). Folding it needs the renderer, the
arity, and the fade key parameterized — a closure-shaped generic that would
erase exactly what the volume function asserts (family D's `upload(id, x)`
contract, `renderer-layer-outliers.md:29`). Same verdict, same reason, for
`filamentSlot.ts:29-40`, `constellationsSlot.ts:41-53` and
`starCatalogSlot.ts:48-55` (which drives no fade at all). Decision #6 already
named this failure mode: no fake-unified registry. **Rejected explicitly:** a
generic `commitUpload(state, pickRenderer, upload, fadeKey)` over all eight slot
commits.

## Decisions this rung takes

**D1 — one function, in `services/engine/volume/`, named for the renderer
verbs.** The extracted `uploadVolumeField(state, store, id, cube)` /
`unloadVolumeField(state, store, id)` pair **is** `addVolumeField` /
`removeVolumeField`, renamed and relocated: the door's existing signature
(`addVolumeField.ts:19-24`) is already the normalized signature, because it is
the only copy that carries the store. The rename gives decision #11's
`upload`/`unload` verbs a concrete instance at the _ingest contract_ layer, where
today they exist only at the renderer layer, and it kills the local aliasing of
the settings action (`addVolumeFieldAction`, `addVolumeField.ts:15`). The home is
`src/services/engine/volume/`, beside `maybeLazyLoadDebugVolume.ts`: `handles/`
is the engine-handle implementation folder, and after this rung four slot commits
call this function, so it is not a handle any more.

**D2 — the four slot-source call sites call it; flow does not.** The three
registry slot factories and the shared synthetic closure (which mints three
fixtures) reach the store through `cb` — the second
`SlotFactory` argument they currently ignore as `_cb` and `starCatalogSlot.ts:70`
already uses. Flow stays as it is, for the reasons in the asymmetry section
above; the ruling is recorded in the shared function's header, where the apparent
inconsistency is visible (rung 3's D4 precedent).

**D3 — the imperative door is KEPT and folded, not deleted.** `handle.volumes.add`
and `.remove` have zero callers in `src/`, `tests/` and `tools/` (grep-confirmed;
the only hits are prose). Deleting them was considered and rejected on three
grounds. (1) The Track A design doc already investigated this on 2026-08-17 and
ruled the handle "the legitimate entry point for runtime-supplied cubes the
demand system cannot express (no URL, not in the registry)", prescribing exactly
this consolidation — "ONE function that slot commits and the public handle both
call". This rung's evidence does not overturn that; it confirms it. (2) The debt
the contracts map flags 🔴 (`:117`, `:142`, `:206`, `:249`) is the _duplicated
bookkeeping_, and the fold deletes it: after this rung the door executes the same
function as the four slots, so it is no longer a parallel lifecycle and the
"generality with no instance" objection (rung 3's D2) dissolves — the function
has five callers. (3) `removeVolumeField` is the **only** caller of
`volumeFieldRenderer.unload` anywhere in `src/`; deleting the door would make
`volumeFieldRenderer` a third dead release surface alongside the two confirmed
ones (`catalogStore.unload` — test-only callers; `filamentRenderer.clear` — zero
callers outside its own module), i.e. it would create the outlier
(`starCatalogRenderer`, upload-without-unload) that #11 asks this rung to
normalize away from. The door stays a three-line delegation with the escape-hatch
ruling recorded on `EngineVolumesHandle`.

**D4 — #13's re-open condition is checked, and it FAILS. No generated-artifact
row table.** The condition: reconsider the table iff folding the imperative
upload into `generated` yields **≥2** artifacts genuinely sharing the shape once
ingest is normalized. Counting honestly after normalization:

- The **three registry volumes** are **`fetched`**. Each has a fetcher, an
  `AssetSlot`, a `req(tier)`, a `LoadState` and a demand predicate — those are
  the three `ASSET_WIRING` rows at `assetWiring.ts:239-269`; `ASSET_WIRING` is
  already the `fetched` arm and is already right (contracts-map §6 🟢). Riding a
  shared ingest function does not reclassify them.
- The **three DEV fixtures** are the one candidate the naive count misses, and
  they must be argued, not waved past: they have **no `ASSET_WIRING` row and no
  demand predicate**, and their "fetcher" _generates_ the cube
  (`syntheticVolumeFetcher.ts:1-8`), so under #7's taxonomy they read as
  **`generated`**, not `fetched`. They still fail the condition, on #13's
  clauses (1) and (2): there is **no `stalenessKey` to compare**. Their request
  is a hard-coded literal at the single call site
  (`maybeLazyLoadDebugVolume.ts:31`: `{ shape, dims: 64, boxSizeMpc: 400 }`),
  projected from no live setting, and the load is one-shot behind an idle guard
  (`maybeLazyLoadDebugVolume.ts:22`) — nothing can make a resident fixture stale,
  so there is no fact to record and nothing for a walker to re-run. They are also
  `import.meta.env.DEV`-gated, so a table built for them ships **zero rows** in
  production.
- The door's cube is **externally supplied**. It has no `stalenessKey` — there is
  no setting it is a projection of — and no `regenerate`, because the engine
  cannot re-derive a cube it was handed. Under #13's five clauses it fails (2)
  and (3) outright.
- The `generated` family with a **usable key** therefore still has exactly
  **one** member, the Milky-Way cloud, whose compare rung 3 moved into
  `MilkyWayCloud.reconcile`. The flow reseed is ruled out by #13's D4.

So #7's "imperative upload folds into `generated` explicitly" is **refined, not
executed as written**: the fold that matters lands at the **ingest contract**
(one function, five callers), not in the kind taxonomy. A runtime-supplied cube
is not a generated artifact; classifying it as one would put a member with no
`stalenessKey` and no `regenerate` into a family defined by both, which is #10's
banned per-row exception wearing a taxonomy hat.

**What the door _is_, then** (`subsystem-sweep.md:15` calls it "a whole artifact
class the 3-way taxonomy doesn't name", and D4 declines both `generated` and
`fetched`, so the gap must be closed rather than left open): the door is **not an
artifact kind at all — it is an entry point on the ingest contract.** Kinds
classify how an artifact's _bytes are produced and kept fresh_; the door produces
nothing and keeps nothing fresh. It hands an already-decoded cube to the same
`uploadVolumeField` the slot commits call, and from the renderer's side the
resulting field is indistinguishable from a fetched one. Rung 4's ruling:
`baked | generated | fetched | streamed` stays a four-way union, and the ingest
contract — not the union — is where imperative supply is named.

**#7's "`generated` carries stalenessKey + optional budget" is re-deferred to the
umbrella reassessment, not to another rung.** With no table to carry them, the
clause has no home in the rungs. What is settled: `stalenessKey` is a primitive
(#13's D5) if it is ever minted; `budget` still has no instance anywhere in the
repo and gets its first one only at the fly-by target (#5), whose per-galaxy
artifacts already fail #13's clauses 3 and 5. The condition is closed for rungs
4–7; it can only re-open when a second genuine `generated` artifact exists.

**D5 — site 4's compare CLOSES here; its residue is re-handed.** The compare
itself needs no patch — `staleTierEvict` is already the right shape, and that
half of #13's hand-off is finished. What this rung does **not** close, and
deliberately re-hands to the umbrella reassessment, is the residue named at the
end of this ruling: tier response expressed twice as hand-coded membership tests.
#13 sent site 4 here because "per #10 the fix is at the ingest contract".
Examined at the contract, the compare is **already split correctly**: the fact is
resource-owned (`slot.lastRequest()`, whose docblock at `AssetSlot.d.ts:25-37`
says it exists for precisely this edge), and only the _policy_ lives in the loop —
because only the loop holds `slot`, `row` and `state.tier` at once
(`reevaluateDemand.ts:87-96`). The ingest normalization gives it nothing to move
into: the volume ingest function is a commit-side effect, and it never sees a
`req`. Both alternatives are worse:

- **Universalize it** (drop the `isBodyTextureKey` gate; compare every ready
  slot's committed request against the fresh one). Not behaviour-neutral, and a
  regression: `mcpm` and `polyphorm2Mrs` are tier-aware and are re-loaded **in
  place** by the second load driver (`makeRunTierTransition.ts:70-77`), so a
  universal evict would fire `release()` in parallel with that driver's
  `slot.load({tier})` and **risk racing** it — the outcome is
  interleaving-dependent, since `release()` clears `lastRequest` while the queued
  fetcher re-checks `kind !== 'idle'` before loading (`reevaluateDemand.ts:155`).
  Either way it is a new failure mode on the largest boot payload, in a rung that
  promises neutrality. Same exposure for galaxy points and star catalogs
  (`makeRunTierTransition.ts:56-88`).
- **Put it on the row** (`stale?(committed, req)`). One family would read it —
  the per-row exception #10 bans, and #10 explicitly permits an optional field
  only for a capability several rows share.

So the `isBodyTextureKey` gate is not the misfit it looks like: it is a proxy for
"this family has no tier-transition driver", and that difference is essential.
What **is** accidental, and what this rung records without building, is that
"how a family responds to a tier change" is expressed **twice, as two hand-coded
membership tests** — the in-place-reload list at `makeRunTierTransition.ts:56-88`
and the evict gate at `reevaluateDemand.ts:102`. Neither is derivable from
`ASSET_WIRING` today. That knot belongs to whichever family owns tier response,
which is the umbrella reassessment's question, not rung 4's; decision #14 records
it as **re-handed, not closed**, so the ladder does not lose it. **Nothing in
`reevaluateDemand.ts` changes.**

**D6 — #11's widening boundary: the caller side, not the renderer side.** The
renderer-side verbs already agree — `upload(id, x)` / `unload(id)` is family D's
norm, honoured by both `volumeFieldRenderer` and `catalogStore`
(`renderer-layer-outliers.md:29`, `catalogStore.ts:176-177`). The divergence #11
points at is on the **caller** side, and that is what this rung normalizes: five
hand-written commit bodies become one function whose name carries the verb.
Explicitly not touched, each with a reason: `starCatalogRenderer` has no `unload`
because it has no evict path — minting one would be dead code, the same test that
sank rung 3's registry; `texturedBodyRenderer`'s `setMap`/`clearMap` is family C,
single-item-per-body with the id repeated at draw time, so renaming it is a
different family's refactor; `atmosphereShell` bakes its item set at
construction. These stay in the outliers doc, and the hygiene basket (#11:
PR-anytime) is where they belong until a caller needs them.

**D7 — `onRelease` is not wired; the coupling is recorded where it will be
needed.** Volume rows are load-once — `assetWiring.ts:242-269` declares no
`release` predicate, and `reevaluateDemand.ts:182` only calls `slot.release()` on
a ready slot that has one. An `onRelease → unloadVolumeField` handler added now
could never fire (the sole other release path, `slot.cancel()`, has no production
caller either), so it would be untestable dead wiring — and speculative eviction
is not this rung's business. The landmine is real in the other direction: adding
a `release` predicate later **without** wiring `onRelease` leaks the field's four
GPU resources (`volumeFieldRenderer.ts:340-344`). The mitigation is one comment
line at the volume rows in `assetWiring.ts`, which is where a reader adding the
predicate is already looking, plus Task 4's tests, which cover the release half
before it has a caller.

## Findings the executor must know before writing code

1. **The synthetic fixtures' inline seed is unreachable, and would throw if it
   ran. Delete it; do not port it.** `syntheticVolumeSlots.ts:86-91` assigns to
   `state.settings.volumes.items`, but `state.settings` is a live getter over the
   store (`engine.ts:204-206`) returning Immer-frozen slice state. Verified by
   running the real `settingsSlice` reducer under ESM/strict:
   `Object.isFrozen(settings.volumes) === true`, and the assignment throws
   `TypeError: Cannot assign to read only property 'items'` (it fails _silently_
   under CJS/sloppy mode, which is why no test caught it). It is also
   unreachable: the only trigger is the fade row's `post` hook, which fires
   `maybeLazyLoadDebugVolume` **only if `state.settings.volumes.items[id]?.enabled`**
   (`fadeLayers.ts:313-315`) — so the row must already exist for the load to
   start, making the `if (!items[id])` branch false in every real path. Replacing
   it with the shared function's dispatch removes a latent throw from a DEV-only
   path. State it in the commit message; it is delta one of the two. **Deleting
   the branch _is_ the verification** — there is nothing to smoke-test for a
   branch that cannot execute, and no test should be written to pin a deleted
   throw.
2. **The door's pre-bootstrap window changes, and nothing observes it.** Today
   `addVolumeField` with a null renderer seeds the row, fades and wakes with no
   cube uploaded; after the fold it returns early like the four slots. Zero
   production callers, so no behaviour is observable — and it makes the door's
   own docblock true. Delta two of the two; do not smuggle it in silently.
3. **Order is load-bearing: seed → upload → fade → wake.** The fade row's guard
   reads `volumeFieldRenderer.listIds().includes(id)` (`fadeLayers.ts:306-308`),
   so the bridge call must follow the upload; and the row's `intent` reads
   `settings.volumes.items[id]?.enabled` (`fadeLayers.ts:299`), so the seed must
   precede the bridge call. The synthetic copy seeds _after_ uploading
   (`syntheticVolumeSlots.ts:80-91`); the door's order is the correct one and is
   what the shared function keeps.
4. **The renderer-null guard is a race guard, not a boot guard.** Commit closures
   re-read `state.gpu.*` at call time deliberately (`engine.ts:490-492`); the
   guard must stay _inside_ the function body, re-read per call. Do not hoist the
   renderer into the factory closure.
5. **`cb` is already in scope.** `SlotFactory` is `(state, cb)`; the four volume
   factories name it `_cb` and drop it. `cb.store` is the `AppStore`
   (`EngineCallbacks.d.ts:20`), the same one `starCatalogSlot.ts:70` dispatches
   through. No signature changes anywhere.
6. **Do not touch `reevaluateDemand.ts` or `makeRunTierTransition.ts`.** D5 rules
   both out. `reevaluateDemand.test.ts:300-361` (the stale-tier block, including
   the Uranus clamp-ceiling non-thrash case) must pass with no edit at all — an
   edit there is the signal that the rung has drifted out of scope.
7. **Comment budget: the direction is sharply down.** The four slot files carry
   ~50 lines of near-verbatim commit commentary (`cf4DensitySlot.ts:1-20,37-51`,
   `mcpmSlot.ts:1-16,33-47`, `polyphorm2MrsSlot.ts:1-8,26-33`,
   `syntheticVolumeSlots.ts:18-25,81-99`). What survives, once, in the shared
   function's header: the renderer-reads-settings-per-frame contract, the fade's
   intent gate, the wake's redundancy note (difference 2), and the flow
   counter-example (D2). What does **not** survive: the "No echo" paragraph
   repeated three times, the construction-seed paragraph repeated three times,
   `syntheticVolumeSlots.ts:20`'s stale "`engine.ts addVolumeField`" reference,
   and `syntheticVolumeSlots.ts:103-108`'s stale "Toggle any of them from the
   Volumes panel" (the panel filters `debug-*` out —
   `CosmicWebSectionContainer.tsx:62`; finding 10 has the real recipe). Per-slot
   headers keep only what is that slot's own (tier-awareness, default-on/off,
   priority rationale, DEV-only gating).
8. **Two orphaned helpers ride the same un-braiding.**
   `helpers/writeVolumeFieldSetting.ts` and `helpers/removeVolumeFieldSetting.ts`
   have zero non-test callers (grep-confirmed) — they are the copy-on-write
   settings mechanism the store dispatch replaced, i.e. the residue of divergence
   1. Re-verify with `npm run refactor -- refs <file>#<symbol>` at execution time;
      if it still holds, they go in Task 3 via `refactor -- delete`, which takes
      their `tests/` mirrors with them.
9. **File moves, renames and dead-symbol deletions go through the tooling, and
   the CLI is file-scoped.** The form is `rename <file>#<symbol> <newName>`
   (`.claude/skills/refactor/SKILL.md:16`) — the `<file>#` prefix is not optional
   decoration here: `addVolumeField` and `removeVolumeField` are **also** exported
   action creators from `settingsSlice.ts:533-534`, and only the file-scoped
   target disambiguates them. `rename` also **renames the file** (filename =
   export name), so any follow-on `move` must use the _new_ filename as its
   source. `delete <file>#<symbol>` is the spelling for a dead one-symbol file (it
   refuses if any reference exists, and takes the `tests/` mirror with it). Never
   `git mv` plus hand-edited imports. `--dry` first on every op.
10. **The DEV fixtures cannot be reached from the Volumes panel.** The panel
    filters `debug-*` out (`CosmicWebSectionContainer.tsx:62`),
    `seedVolumeFields` excludes `binBaseName: null` fixtures
    (`volumeFieldDefaults.ts:90-92`), and `writeVolumeField` no-ops on a missing
    row (`settingsSlice.ts:328-329`) — so there is no UI path that creates the
    row. The only way in is two Redux DevTools dispatches, in this order:
    `settings/addVolumeField` with payload `'debug-gaussian'`, then
    `settings/writeVolumeField` with `{ id: 'debug-gaussian', patch: { enabled:
true } }`. The second one flips the intent the fade row's `post` hook reads,
    which fires `maybeLazyLoadDebugVolume` and drives the fixture's commit. Task 7
    uses exactly this recipe; do not invent a panel toggle.

## The contract

```ts
// src/services/engine/volume/uploadVolumeField.ts
/**
 * The ONE volume-field ingest path: every volume slot commit and the public
 * `handle.volumes.add` call this. Order is load-bearing — the settings row must
 * exist before the fade reads its intent, and the cube must be resident before
 * the fade's guard reads `listIds()`. The trailing `requestRender()` is
 * redundant with the settings wake route (`watchWakeSaga`) and kept local until
 * rung 5 accounts for the wake owners.
 */
export function uploadVolumeField(
  state: ApplyIntentState,
  store: AppStore,
  id: VolumeFieldId,
  cube: ScalarCube,
): void;
```

```ts
// src/services/engine/volume/unloadVolumeField.ts — renamed, semantics unchanged
export function unloadVolumeField(
  state: ApplyIntentState,
  store: AppStore,
  id: VolumeFieldId,
): void;
```

The pair is deliberately **not** symmetric about the renderer-null case: `upload`
returns early (nothing to ingest), `unload` still removes the settings row
(`?.unload` on the renderer, then dispatch). The store row's lifetime is
independent of the GPU resource's — the same decoupling `volumeFieldRenderer.ts:335-339`
documents for fade handles. One line in `unloadVolumeField`'s header, not a
section.

```ts
// the slot commit, in full, for all four slot-source call sites (the id differs)
commit: async (cube) => {
  uploadVolumeField(state, cb.store, SOURCE_REGISTRY[Source.Mcpm].id, cube);
},
```

## How parity is demonstrated

1. **The commit bodies were untested; they are not any more.** No existing
   assertion changes anywhere, because no existing test drives any of the five
   bodies (`settingsSlice.test.ts` tests the reducer;
   `buildSlotsFromRegistry.test.ts` stubs a generic mcpm). Tasks 2–4 add the
   coverage the survey found missing, and it is the parity evidence.
2. **Per-slot id wiring is pinned.** Task 3's test asserts each of the four
   slot-source call sites ingests under **its own** id — the one bug an
   extraction of five copies realistically introduces (a cube uploaded under a
   sibling's id would be invisible and silent).
3. **Same triggers, same cadence, same drivers.** `reevaluateDemand`'s enqueue
   edge, `makeRunTierTransition`'s direct `slot.load` on tier swap, and the fade
   row's `post` hook are all untouched; the shared function is called from inside
   the same `commit` closures at the same point.
4. **The two deltas are named, not discovered** (findings 1 and 2), and both are
   on paths with no production observer.
5. **Visual smoke over the named behaviours** in the DoD, plus the optional
   `npx playwright test tests/e2e/cf4-density-volume.spec.ts` smoke, which drives
   the real cf4 slot commit end to end against the dev server.

No `npm run perf` pass is required: no per-frame work changes. Ingest happens
once per load; the added dispatch is an identity no-op on the four slot paths.

## Tasks

**Execution order (binding).** Task 1 → 2 → 3 is move → normalize → migrate.
Tasks 4, 5 and 6 may run in any order after Task 3. Task 7 is the gate.

### Task 1 — Relocate and rename the pair (mechanical, no behaviour)

**Files:** `src/services/engine/handles/addVolumeField.ts`,
`src/services/engine/handles/removeVolumeField.ts` (rename + move),
`src/services/engine/engine.ts` (import sites only),
`src/@types/engine/handles/EngineVolumesHandle.d.ts` (docblock)

One mechanical operation per commit — the refactor skill's discipline, and what
makes a bad `--dry` report recoverable. **`rename` also renames the file**, so
the `move` steps take the _new_ filenames as their source. The `<file>#<symbol>`
prefix is mandatory: `addVolumeField`/`removeVolumeField` are also action-creator
exports from `settingsSlice.ts:533-534` (finding 9).

- [x] `npm run refactor -- rename src/services/engine/handles/addVolumeField.ts#addVolumeField uploadVolumeField`
      (`--dry` first), then the same for
      `src/services/engine/handles/removeVolumeField.ts#removeVolumeField unloadVolumeField`.
      The settings actions keep their names; the now-pointless local alias
      `addVolumeFieldAction` (`addVolumeField.ts:15`) collapses to a plain
      import. Commit.
- [x] `npm run move-files -- src/services/engine/handles/uploadVolumeField.ts src/services/engine/volume/uploadVolumeField.ts`
      and the same for `unloadVolumeField.ts` (`--dry` first). Commit.
- [x] `engine.ts:846-851` keeps `volumes.add` / `volumes.remove` delegating to
      the renamed functions (D3). The handle's public method names do **not**
      change. In the same commit, `EngineVolumesHandle.d.ts:5-18` records D3's
      ruling in two or three lines: `add`/`remove` are the entry point for
      runtime-supplied cubes the demand system cannot express (no URL, not in the
      registry), and they execute the **same** `uploadVolumeField` /
      `unloadVolumeField` the volume slot commits do — so there is no second
      ingest path to keep in sync. Delete the stale claim at `:12-13` that
      `list`/`getState` are "the read-side methods the SettingsPanel uses" (the
      panel reads the store through `selectVolumeFieldItems`; these are
      dev-console reads).
- [x] `npm run typecheck` + `npm test`. Nothing should need editing beyond
      imports; if it does, the tooling was bypassed. Commit the handle + docblock
      step.

### Task 2 — Normalize `uploadVolumeField` into the one ingest path (TDD)

**Files:** `src/services/engine/volume/uploadVolumeField.ts` (modify),
`tests/services/engine/volume/uploadVolumeField.test.ts` (new)

Follow `tests/services/loading/slots/flowFieldSlot.test.ts:1-54` for the
established stub pattern (hoisted `vi.mock` of `syncVisibilityFades`, a fake
state object, a `ScalarCube` cast). One difference: that file passes `{}` as
`EngineCallbacks` because its commit never touches it — these tests **do**, so
the store stub is `{ dispatch: vi.fn() } as unknown as AppStore`. The reducer's
identity-no-op semantics are already pinned at `settingsSlice.test.ts:161-173`
and must not be restated here.

- [x] Test `dispatches the settings-row seed before uploading the cube` —
      asserts both calls and their order (finding 3). Catches the inverted order
      that would make the fade read a missing row.
- [x] Test `drives only the volumeField fade layer, animated, after the upload` —
      asserts `syncVisibilityFades` received `{ animate: true, only: ['volumeField'] }`
      and ran after `upload`. The scoped `only` is what keeps an ingest from
      re-driving every fade in the scene; the order is what the row's
      `listIds()` guard depends on (`fadeLayers.ts:306-308`).
- [x] Test `does nothing at all when the renderer is not constructed` — no
      dispatch, no fade, no wake (difference 4, finding 2). No separate wake test:
      the wake is redundant with the settings route (difference 2), so pinning it
      would pin a line rung 5 is expected to delete; this test covers the only
      wake behaviour that matters here, its absence on the no-op path.
- [x] Implement: guard the whole body on the renderer, then seed → upload → fade
      → wake. The header carries the surviving notes from finding 7 plus the
      flow counter-example (D2) in one or two lines — the reasoning lives in
      decision #14, this is a pointer.
- [x] `npm run typecheck` + `npm test -- uploadVolumeField`.
- [x] Commit.

### Task 3 — The four slot-source call sites call it; the copies and their orphans go

**Files:** `src/services/loading/slots/cf4DensitySlot.ts`,
`mcpmSlot.ts`, `polyphorm2MrsSlot.ts`, `syntheticVolumeSlots.ts` (modify),
`src/services/engine/helpers/writeVolumeFieldSetting.ts`,
`src/services/engine/helpers/removeVolumeFieldSetting.ts` (delete, gated),
`tests/services/loading/slots/volumeSlotIngest.test.ts` (new)

The new test file mirrors no single src file **on purpose**: the fact it pins is
cross-file (four factories, one shared ingest fn, four distinct ids), and
splitting it into four one-assertion mirrors would be four files of noise.
`tests/services/engine/wiring/demandTable.test.ts` is the existing precedent for
a cross-cutting test file with no src twin.

- [x] Test `each volume slot ingests its cube under its own field id` — drive all
      four call sites (the three registry factories plus one synthetic fixture)
      with a mocked fetcher to a `ready` transition and assert the id each one
      passes. This is parity gate 2; a per-slot id mix-up is otherwise silent.
- [x] Replace each commit body with the single `uploadVolumeField(...)` call.
      `_cb` becomes `cb` in all four factories (finding 5).
- [x] Delete the duplicated commentary per finding 7; each slot header keeps only
      what is its own. `syntheticVolumeSlots.ts:18-25`'s "Commit pattern"
      paragraph goes entirely — including its stale `engine.ts addVolumeField`
      reference — along with the in-body seed note at `:81-85`; the
      `mintSyntheticVolumeSlot` comment (`:63-70`) keeps only the per-fixture
      closure rationale. The net comment count across the four files must go
      **down** substantially.
- [x] Re-verify with
      `npm run refactor -- refs src/services/engine/helpers/writeVolumeFieldSetting.ts#writeVolumeFieldSetting`
      (and the same for `removeVolumeFieldSetting`) that both have only `test`
      references (finding 8). If confirmed, delete each with
      `npm run refactor -- delete <file>#<symbol>` — it takes the `tests/` mirror
      with it, and refuses if any live reference remains, which is the gate. If a
      caller has appeared, leave them and say so in the commit message.
- [x] `npm run typecheck` + `npm test`.
- [x] Commit.

### Task 4 — Cover the release half, and record the `onRelease` coupling (TDD)

**Files:** `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts`
(modify), `src/services/engine/wiring/assetWiring.ts` (comment only)

The survey found `unload` and the replace-on-ingest destroy both untested — the
two paths that free GPU resources, and the ones D7 says must be correct before
anyone adds a release predicate.

- [x] Test `unload destroys the field's four GPU resources and drops it from the
map` — texture, palette texture, uniform buffer and fade buffer
      (`volumeFieldRenderer.ts:340-344`), then `listIds()` no longer contains it.
      A missed `destroy()` here is a real GPU-memory leak that nothing else
      catches.
- [x] Test `re-uploading the same id destroys the previous field's resources
first` — the replace-on-ingest path (`volumeFieldRenderer.ts:266-273`),
      which every tier reload of `mcpm` and `polyphorm2Mrs` takes today via
      `makeRunTierTransition`.
- [x] Add **one** line at the volume rows (`assetWiring.ts:242-269`): these rows
      are load-once and deliberately declare no `release`; adding one requires
      wiring `onRelease` to `unloadVolumeField` or the four GPU resources leak on
      evict (D7). No other prose.
- [x] `npm run typecheck` + `npm test -- volumeFieldRenderer`.
- [x] Commit.

### Task 5 — decisions.md gains decision #14

**Files:** `docs/research/engine/decisions.md` (modify)

Rungs 5–7 and the umbrella reassessment are written against decisions.md long
after this plan moves to `plans/completed/`, so the rulings cannot live only
here. This is the rung's durable deliverable.

- [x] Add **decision #14** carrying: the five-copies-not-three count and the
      four-differences classification (all accidental, resolved by the majority
      form, no options bag); the flow/filament/constellation/starCatalog
      counter-examples and the rejected generic `commitUpload`; D3's ruling on
      the door, with the three-dead-release-surfaces argument.
- [x] Record the **answer to #13's re-open condition**: checked, **fails** — with
      the count spelled out so it adds up. Three registry volumes are `fetched`;
      the three DEV fixtures read as `generated` (their fetcher generates,
      `syntheticVolumeFetcher.ts:1-8`, and they have no `ASSET_WIRING` row) but
      carry **no `stalenessKey`** — a hard-coded request literal
      (`maybeLazyLoadDebugVolume.ts:31`), one-shot behind an idle guard, DEV-only;
      the door's cube is externally supplied with neither key nor `regenerate`.
      So the keyed `generated` family still has one member. No table, no row type,
      no walker. #7's "imperative upload folds into `generated`" is refined: the
      fold lands at the ingest contract, not in the kind taxonomy — and the door
      is classified explicitly as **an ingest-contract entry point, not an
      artifact kind**, closing the gap `subsystem-sweep.md:15` names. #7's
      "stalenessKey + optional budget" is re-deferred to the **umbrella
      reassessment**, not to a rung, and the condition is closed for rungs 4–7.
- [x] Record **site 4's ruling** (D5): no code change, the compare is already
      split correctly (fact resource-owned via `lastRequest()`, policy
      loop-owned), both alternatives are worse, and the `isBodyTextureKey` gate
      is a proxy for "no tier-transition driver". State the outcome as **the
      compare closes, the residue is re-handed**: tier response is expressed
      twice, at `makeRunTierTransition.ts:56-88` and `reevaluateDemand.ts:102`,
      neither derivable from `ASSET_WIRING` — re-handed to the umbrella
      reassessment, explicitly not closed here.
- [x] Record the **wake finding** (difference 2): the door's "essential wake"
      comment is false — `watchWakeSaga.ts:47-55` wakes on every settings-route
      action — so the line is redundant-but-local, and **rung 5** owns removing
      it along with the path's other wake owners.
- [x] Record **#11's widening boundary** (D6) and **D7** (no `onRelease`, with
      the coupling recorded in `assetWiring.ts`).
- [x] Amend **#9's rung-4 clause in place**: five copies, not three; the door
      kept and folded; the re-open condition answered; site 4 ruled — with a
      pointer to #14, so a reader of #9 alone is not left expecting a deletion or
      a table that does not exist.
- [x] Commit.

### Task 6 — The deferred doc sweep + the ingest lines this rung makes stale

**Files:** `docs/research/engine/engine-composition-map.md`,
`docs/research/engine/subsystem-sweep.md`,
`docs/research/engine/current-contracts-map.md`,
`docs/research/engine/renderer-layer-outliers.md` (modify)

The first six items are rung 3's deferred sweep; the rest is this rung's own
wake. Locate each by its quoted text — line numbers are as of `df590f5d3`.

- [x] `engine-composition-map.md:340` — "`runFrame`'s mismatch branch is the only
      regenerate path" → it is `MilkyWayCloud.reconcile` (rung 3).
- [x] `engine-composition-map.md:351-354` — "the two MW-specific per-frame
      mismatch branches … both inline": both are deleted (rungs 2 and 3).
- [x] `engine-composition-map.md:422-428` (ACCRETION §4 item 1) — same two
      branches described as live and unfactored; superseded.
- [x] `subsystem-sweep.md:16` — "2 hand-wired mismatch branches inline in
      runFrame.ts:211-281"; superseded.
- [x] `subsystem-sweep.md:28` — the 4th kind exists (`streamed`, #7), and
      "promote runFrame.ts:211-281 to a named helper" is superseded by #13
      (resource-owned, no helper). Its `addVolumeField` clause also needs #14's
      answer, not #7's premise.
- [x] `subsystem-sweep.md:15` (the scalar-volumes row) — "imperative upload via
      handle.addVolumeField (public API, bypasses slot/demand entirely)" and
      "addVolumeField is a whole artifact class the 3-way taxonomy doesn't name":
      after the fold it bypasses the _demand loop_ but shares the ingest path, and
      #14 classifies it as an ingest-contract entry point rather than a kind. The
      row's own name for the gap is what D4 closes.
- [x] `current-contracts-map.md:225` — the W1 mermaid label "(replaces buildSpecs
      hand-table + divisor rebuild branch)": the divisor branch went in rung 2,
      and the label self-contradicts `:247`.
- [x] `current-contracts-map.md:142`, `:206`, `:249` and the `:117`/`:121-124`
      mermaid `IMP` node — ingest is **five copies → one function**; the door is
      folded, not off-registry, so the 🔴 is discharged; `:249`'s bundle-mapping
      cell must match #14 (one ingest fn; **not** a `generated` membership).
      `:140`'s "registry covers 1 of 5 lifecycles" count changes with it.
- [x] `renderer-layer-outliers.md:166` (dead ingest surfaces, a 🔴 bug-suspect
      row with "grep repo-wide for callers" as its cheap check) — the check is
      done: `catalogStore.unload` has test-only callers, `filamentRenderer.clear`
      has none outside its own module, `handle.volumes.add` is discharged by the
      fold. Record the result and the reason the other two stay (D3/D6), so the
      row stops reading as unverified.
- [x] Commit.

### Task 7 — Full gate + visual smoke

- [x] `npm run typecheck` (both tsconfigs) + `npm test` — green, no skips added.
      `reevaluateDemand.test.ts` must be untouched (finding 6).
- [x] Dev-server smoke, with the user's eyes: toggle **mcpm**, **cf4-density**
      and **polyphorm-2mrs** off and on from the Volumes panel. Each must fade in
      on first enable, stay resident across a second off/on with no re-fetch, and
      log its ready line once.
- [x] Switch tiers with `mcpm` enabled: it re-loads **once** at the new tier
      (the `makeRunTierTransition` driver) and re-appears — no double fetch, no
      stuck-at-old-tier cube. This is the second-load-driver gate.
- [x] In dev, reach a debug fixture the only way there is (finding 10 — **not**
      the Volumes panel, which filters `debug-*` out): in Redux DevTools dispatch
      `settings/addVolumeField` with payload `'debug-gaussian'`, then
      `settings/writeVolumeField` with
      `{ id: 'debug-gaussian', patch: { enabled: true } }`. The fixture must
      upload and fade in with **no console error**. This exercises the
      synthetic call site's new ingest path end to end; it is not a check on the
      deleted seed branch, whose deletion is its own verification (finding 1).
- [x] Optional deeper evidence: `npx playwright test tests/e2e/cf4-density-volume.spec.ts`
      against the running dev server.
- [x] Commit (if any smoke-driven fixes were needed).

## Definition of Done

- [x] `src/services/engine/volume/uploadVolumeField.ts` and
      `unloadVolumeField.ts` exist with the contract's signatures; **five** call
      sites reach `volumeFieldRenderer.upload` through the first of them (the four
      slot-source call sites + `handle.volumes.add`), and no **volume** slot file
      (`cf4DensitySlot`, `mcpmSlot`, `polyphorm2MrsSlot`, `syntheticVolumeSlots`)
      references `volumeFieldRenderer` or `syncVisibilityFades` any more. The
      other slot files keep their own `syncVisibilityFades` imports — D2 keeps
      them out of the fold on purpose.
- [x] The shared function takes **no options bag, no flag, and no per-caller
      policy argument** — the deliberate outcome of the four-differences
      classification, and the thing a reviewer expecting a parameterized helper
      must find explained in decision #14.
- [x] `handle.volumes.add` / `.remove` still exist and still work, as three-line
      delegations; `src/@types/engine/handles/EngineVolumesHandle.d.ts`'s docblock
      records the escape-hatch ruling (runtime-supplied cubes), states that the
      door executes the same ingest functions the volume slots do, and no longer
      claims `list`/`getState` serve the SettingsPanel.
- [x] New tests: `uploadVolumeField` (three behaviours incl. the null-renderer
      no-op), the four-call-site id-wiring test, and `volumeFieldRenderer`'s
      `unload` + re-upload-destroy. **No test of surviving behaviour was
      deleted**; the two orphan helpers' tests go with their symbols via
      `refactor -- delete` (testing.md: a dead symbol's test can never fail on a
      real bug). `reevaluateDemand.test.ts` — the clamp-ceiling non-thrash case
      included — is byte-identical.
- [x] The net comment count across the four slot files went **down**
      substantially; the "No echo" and construction-seed paragraphs survive once,
      in the shared function's header, and `syntheticVolumeSlots.ts`'s two stale
      claims — the `engine.ts addVolumeField` reference and "Toggle any of them
      from the Volumes panel" — are gone.
- [x] `decisions.md` ships in this PR with decision #14 (the ingest contract, the
      door's fate, the answer to #13's re-open condition, #7's refinement and
      re-deferral, site 4's ruling plus the tier-response knot, #11's boundary,
      D7) and #9's rung-4 clause amended in place. Rungs 5–7 must read the
      current north star from decisions.md alone, without this plan file.
- [x] The deferred doc sweep is done (six items plus `subsystem-sweep.md:15`),
      and the ingest surfaces in `current-contracts-map.md` plus the dead-ingest
      bug-suspect row in `renderer-layer-outliers.md` describe the post-rung-4
      world.
- [x] Named observable behaviours for the manual smoke pass: each of the three
      shippable volumes fades in on first enable and survives an off/on with no
      re-fetch; a tier switch re-loads `mcpm` exactly once; a DEV debug fixture,
      reached by the two-dispatch DevTools recipe, uploads and fades with no
      console error.
- [x] Sizing note for the ladder, not a gate: rung 4 arrives as 7 tasks, of which
      **two** touch behaviour-bearing code, and three of its four inherited
      questions (#13's re-open condition, site 4, #7's imperative-upload
      classification) close with a recorded ruling rather than a diff. Rung 3 saw
      the same pattern; rungs 5–7 should expect it wherever #9 named a "family"
      that the code turns out to have already resolved.
- [x] Deferral boundary — a reviewer should NOT expect to find, in this PR: any
      change to `reevaluateDemand.ts`, `staleTierEvict`, `makeRunTierTransition`
      or `ASSET_WIRING`'s row shape (D5); a generated-artifact registry, row type
      or walker, or an `ArtifactDecl` union / `SubsystemBundle` umbrella (D4);
      a `budget` field or any time-slicing; `flowFieldSlot`, `filamentSlot`,
      `constellationsSlot` or `starCatalogSlot` folded into the shared function
      (D2); `starCatalogRenderer.unload`, a `texturedBodyRenderer` verb rename,
      or the deletion of `catalogStore.unload` / `filamentRenderer.clear` (D6);
      `onRelease` wiring or any release predicate on a volume row (D7); the
      removal of the ingest path's redundant `requestRender()` (difference 2 —
      rung 5's wake accounting owns it); the un-braiding of the two hand-coded
      tier-response lists (named in #14, re-handed to the umbrella reassessment);
      earth tiles' `streamed` lifecycle; rungs 5+.
