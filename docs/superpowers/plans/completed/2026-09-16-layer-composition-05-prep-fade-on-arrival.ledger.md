# Ledger — 2026-09-16-layer-composition-05-prep-fade-on-arrival

Plan: `docs/superpowers/plans/2026-09-16-layer-composition-05-prep-fade-on-arrival.md`
Worktree: `.claude/worktrees/fade-on-arrival` · Branch: `worktree-fade-on-arrival`
PR: #737 (draft) · Base: main @ `3eb8cdc5e`

## Start-of-run answers (2026-09-16)

- **Parallelism:** serial. 05a (`filaments` Layer) waits for this PR to land — its
  Task 2 assumes `LayerCoreDeps.fades` is already gone.
- **Perf gate:** NO. Nothing per-frame changes; the guard sweep runs on slot-`ready`
  edges only (~tens per session) over ~16 rows of `hasCloud()`-class predicates.

## Standing rulings this run inherits

- User ruling 2026-09-16: small Layers before `starCatalog`; `filaments` and `flow`
  in separate PRs; `flow` (05b) carries the `computes` contract extension;
  `zoneOfAvoidance` is 05c.
- User ruling 2026-09-16: **no imperative fade drives from a slot or a Layer.** This
  PR exists because plan 05a was going to copy `wireGalaxyCatalogSourceSlot`'s
  hand-rolled `deps.fades.fadeTo` into a second Layer.
- Design choice (adjudicated before plan-writing): the edge is a **guard transition**
  (false→true), not a declared `AssetKey`→fade link. `VisibilityLayerKey` and
  `AssetKey` do not correspond in either direction; a declared link would drift.

## Dispatches

| # | Tasks | Model | Status | HEAD |
|---|---|---|---|---|
| D1 | Task 1 — `installFadeOnArrival` + 4 tests + `wireSlots` install | Opus (`review: yes`) | DONE + pushed | `756eaff43` |
| D2 | Tasks 2–3 — delete five kick sites, delete `LayerCoreDeps.fades` | Opus (`review: yes`) | dispatched | — |

Grouping rationale: D1 builds the mechanism; D2 is the deletions that depend on it
existing. Both tagged `review: yes` in the plan (Redux/fade state, a Layer contract
field), so both get Opus and both are covered by the one mid-branch review.

## Review

One whole-branch review after D2. Mandate: spec fidelity + slop. One fix round by
the branch's own implementer, no re-review.

## Log

- 2026-09-16 — worktree created, `public/data` linked to main, plans committed
  (`docs(plan): fade-on-arrival prep + filaments Layer`), branch pushed, draft PR #737 opened.

- 2026-09-16 — D1 landed `756eaff43`. Verified by controller: ordering in `wireSlots.ts`
  is `seedFades`(117) → `installLoadProgress`(125) → `installSlotReadyWake`(129) →
  `installFadeOnArrival`(133) → `reevaluateDemand`(153), so the snapshot predates any
  subscription and any load. Two named deviations, both accepted:
  1. The plan said "reuse the fixture in `syncVisibilityFades.test.ts`". Importing a
     `.test.ts` would double-register its describes, so `makeBridgeState` was EXTRACTED
     to `tests/helpers/engine/makeFadeBridgeState.ts` (+ `FadeBridgeState.ts`, one type
     per file) and both suites point at it. Still one engine stub.
  2. `tests/services/engine/phases/wireSlots.test.ts`'s gpu stub had a truthy
     `filamentRenderer` with no `hasCloud` and a `volumeFieldRenderer` with no
     `listIds` — `seedFades` never called guards, `installFadeOnArrival` does, so 9
     tests threw. Stub gained both methods. This is the recorded "cast-built fixtures
     rot silently" landmine surfacing again.
- OPEN for the final review: `installFadeOnArrival` keys its snapshot `Map` by the
  row's `item` by identity. Every row today expands to primitives (strings, or
  `[undefined]`), so this is correct — but a future row with object items would
  silently never fire its arrival fade. Judge whether that earns one clause.

## In flight

- **D2** (Opus, dispatched 2026-09-16): plan Tasks 2 + 3 — delete the five imperative
  kick sites, then delete `LayerCoreDeps.fades`. Two commits, briefed to push itself.
  **Handling when it reports:** controller verifies by grep that `src/layers` and
  `src/services/loading` contain no `fades.fadeTo` and no `syncVisibilityFades(` call,
  and that `applySceneEffect`'s `only` usage survives; then dispatches the ONE
  whole-branch review (mandate: spec fidelity + slop, plus the OPEN item-identity
  question above). One fix round by D2, no re-review. Then read CI as the gate,
  un-draft #737, hand to the user for the smoke pass.

## Queued after this PR

1. **05a — the `filaments` Layer.** Plan already committed on this branch at
   `docs/superpowers/plans/2026-09-16-layer-composition-05a-filaments-layer.md`.
   Serial, in its own worktree, only after #737 merges (its Task 2 assumes
   `LayerCoreDeps.fades` is gone).
2. **05b — `flow`**, which carries the `computes?(runtime)` contract extension:
   `encodeFlowCompute` is dispatched through the `COMPUTE` name→fn table at
   `executeFrame.ts:111-127` and `Layer` has no member for a compute step.
3. **05c — `zoneOfAvoidance`**, first Layer to own a render target (`zoa`,
   `renderTargets.ts:214`) plus an upsample row; `Layer.targets` already carries it.
4. Then the rest of (e): `structure`, `volume`, `body`, `constellations`,
   `milkyWay` (blocked on spec §6.3's band PR), and finally `starCatalog`, which the
   user deferred to last.

## Loose end for merge time

The two plan files also exist UNTRACKED in the main checkout's working tree
(`/Users/rulkens/Development/js/skymap/docs/superpowers/plans/`), copied from there
into this worktree. They will block a fast-forward pull on main after #737 merges —
remove them from main's tree at close-out.

- 2026-09-16 — D2 landed `2295c77d9` (Task 2) + `23ececb99` (Task 3), pushed. Three
  named deviations, all accepted:
  1. Three tests asserted the old imperative path and were DELETED, not preserved:
     `uploadVolumeField.test.ts` "drives only the volumeField fade layer" (with its
     `syncVisibilityFades` vi.mock), `wireGalaxyCatalogSourceSlot.test.ts` "drives this
     catalog's fade-in only", `createLayers.test.ts`'s `received?.fades` assertion
     (Task 3 forced that one). Handed to the review as its question 3.
  2. Collateral in `wireGalaxyCatalogSourceSlot.test.ts`: the `fades` stub, the
     `store.getState()` stub, the `enabled` option and the `galaxyCatalogIdOf` import
     went dead with the deletion. Sibling test lost its fade premise and was retitled
     "a re-commit still requests a render"; it still exercises the slot through
     `installSlotReadyWake`.
  3. `uploadVolumeField.ts`'s header claimed dispatch-before-upload order is
     load-bearing for the fade. No longer true — both writes land before `ready`,
     which is the edge core reads. Rewritten. The ordering test stays.

  Controller verification (all three pass): `grep -rn 'fades\.fadeTo|syncVisibilityFades\('`
  over `src/layers` + `src/services/loading` → nothing. `applySceneEffect.ts:43,62`
  keep `only: effect.layers` for both `show` and `hide`. `LayerCoreDeps.fades` gone;
  the surviving `fades:` are `EngineSubsystemHandles.fades` (the registry) and
  `LayerInstance.fades` (the Layer's fade ROWS), both correct.

  Branch diffstat vs `3eb8cdc5e`: 19 files, +693 / −248 (of which two plan files
  are +371).

- 2026-09-16 — ONE whole-branch review dispatched (Opus, read-only). Mandate: spec
  fidelity + slop, plus three named questions — (1) the OPEN item-identity question,
  (2) verify the transition rule's two load-bearing claims against source, (3) judge
  whether the three deleted tests opened a regression window. **Handling:** one fix
  round by D2 (resume it, it holds the branch context), no re-review. Then read CI as
  the gate, un-draft #737, hand to the user for the smoke pass (the plan's DoD manual
  step is untouched — nothing was verified in a browser).

- 2026-09-16 — Review returned **LAND WITH FIXES**. Spec fidelity full: signature
  matches the pin byte-for-byte, install site correct, all four plan-named tests
  present and passing. Two findings, both comment-only, fixed inline by the
  controller (under the ~50-line inline rule) in `f039add54`:
  1. `installFadeOnArrival.ts` — two clauses justified the code with scenarios no
     current row can produce. Controller VERIFIED the claim independently:
     `volumeFieldIds()` (`fadeLayers.ts:27-34`) walks the static `SOURCE_REGISTRY`,
     so no row's item set grows at runtime; and no guarded row declares `release`,
     so "an evict re-arms the next open" describes nothing. Collapsed to the rule
     that is load-bearing: the install pass is the baseline, a close is only noticed
     at the next `ready`. Code unchanged — it was already the minimal form.
  2. `LayerCoreDeps.d.ts` — header was 6 content lines against the ≤5 budget. Trimmed.

  Review answers to the three named questions:
  - **Q1 item identity — RESOLVED.** Every row's `expand` yields string ids
    (`STRUCTURE_IDS`, label-bearing star/body ids, `volumeFieldIds()`,
    `GALAXY_CATALOG_IDS`) or `[undefined]`, so identity keying is correct today.
    Ruling: no guard (an extra knob with no caller) and no comment at the `Map`
    (it would say WHAT). Took the reviewer's alternative instead — ONE clause on
    `FadeLayer.expand` in `src/@types/animation/FadeLayer.d.ts`, because that is a
    cross-file contract `tsc` cannot express and the failure mode is silent.
  - **Q2 transition rule — BOTH HALVES TRUE**, verified against source.
    `syncVisibilityFades.ts:44` calls `row.post?.()` OUTSIDE the
    `targetOf !== target` branch, so `post` runs on every guard-passing call;
    `fadeLayers.ts:192-194` is non-idempotent. `AssetSlot.ts:261-268`: `cancel()`
    sets `state = lastReady ?? idle` and notifies, so it re-delivers `kind: 'ready'`.
    No hole in the design.
  - **Q3 deleted tests — one genuine coverage window.** Two of the three are fully
    replaced: `installFadeOnArrival.test.ts:105-125` drives the REAL
    `galaxyCatalogFadeRows` and asserts exactly one `fadeTo` for the opening id, and
    `createLayers`' `received?.fades` is replaced by `tsc` (field deleted, so the
    check is total). The third is NOT: `uploadVolumeField`'s ORDERING half is now
    unasserted anywhere. The invariant is "the settings dispatch and `renderer.upload`
    both land before the slot reports `ready`". If `uploadVolumeField` were ever moved
    out of the commit body or deferred past `ready`, the guard would read false at the
    edge and the volume would never fade in — with a green suite. Recorded in
    `uploadVolumeField.ts`'s header as prose; reviewer and controller both judged a
    slot harness not worth its weight here. **Open item for the user's ruling at
    landing.**

## Next

CI on `f039add54` is the gate. Then un-draft #737 and hand to the user for the
plan's DoD manual smoke pass — nothing on this branch was verified in a browser.

- 2026-09-16 — main moved to `7f39f5942` (#736 terrain WebP) under the PR. ZERO file
  overlap with this branch, so merged it in cleanly at `567dad9c8` rather than
  rebasing — this is the recorded "CI stale on main move" landmine; checks are only
  read as the gate after the branch carries current main.
- 2026-09-16 — **CI GREEN** on `567dad9c8`: `typecheck · test · format` pass (5m33s),
  Workers Build pass. #737 un-drafted. Awaiting the user's manual smoke pass (the
  plan's DoD step) and the landing ruling on the Q3 coverage window above.

- 2026-09-16 — **MANUAL SMOKE PASS: ALL NINE CHECKS GREEN**, attested by the user
  against the dev server on this branch (`:5173`, `public/data` symlinked to main's).
  Covered: filaments / constellations / flow cold fade-in; one real volume cold; the
  per-item fix (a second volume enabled mid-ramp does NOT restart the first's fade);
  a catalog toggled off mid-download stays invisible; tier switch fades each catalog
  on its own payload without restarting siblings; the DEV `debug-gaussian` volume
  still lazy-loads (the non-idempotent `post` path the transition rule routes around);
  a tour beat still animates over its authored duration (`applySceneEffect` untouched).
- 2026-09-16 — **User ruling on the Q3 coverage window: ACCEPT THE PROSE, LAND AS-IS.**
  `uploadVolumeField`'s ordering invariant ("the settings dispatch and `renderer.upload`
  both land before the slot reports `ready`") stays recorded in the module header
  rather than asserted by a slot harness. Cost if wrong: deferring that upload past
  `ready` makes the guard read false at the edge and the volume silently never fades
  in, with a green suite. Not backlogged — the user declined the test outright.
