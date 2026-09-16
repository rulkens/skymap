# Fade-on-arrival: one edge, no imperative kicks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give core the edge it lacks — a fade row's `guard` opening — so that no slot, and no Layer, ever drives a fade by hand. Delete all five imperative kick sites and the `LayerCoreDeps.fades` field that made the worst of them necessary.

**Architecture:** A demand-loaded fade row already states the fact in its `guard`: "my asset hasn't arrived yet." What core lacks is the moment that answer changes, so five call sites supply it by poking the bridge from inside a commit body. This plan snapshots every intent row's `guard` at bootstrap and re-checks it on each slot's `ready` notification; wherever a guard went **false → true**, core calls the already-built `syncVisibilityFadeItem`. Nothing is added to `AssetWiringRow`, `FadeLayer`, `LayerCoreDeps` or any slot factory — the declaration that would have carried this link is the `guard` itself.

**Tech Stack:** TS, RTK, the fade registry (`FadeRegistry`/`fadeController`), `AssetSlot`.

**Spec:** Prep for `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §10(e). Not a spec change — this is an implementation seam the spec does not name.

## Global Constraints

- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`; filename = symbol. Types never live inline in implementation files.
- Comments: module header ≤ 5 lines, comment lines ≤ half the code lines; WHY, never WHAT.
- Never `git add -A`; stage only touched files.
- This is a **prep refactor**: no `deletion-audit` (per the standing ruling on prep PRs). Behaviour must be preserved, not extended.

**Why this PR exists (user ruling, 2026-09-16).** Plan 05a was going to have the filaments Layer copy `wireGalaxyCatalogSourceSlot`'s hand-rolled `deps.fades.fadeTo`. The user rejected the imperative reach and asked for the non-imperative fix first, as its own PR.

---

## The problem, precisely

Five sites drive the arrival-edge fade:

| Site | Form |
|---|---|
| `src/services/loading/slots/filamentSlot.ts:33` | `syncVisibilityFades(state, { animate: true, only: ['filaments'] })` |
| `src/services/loading/slots/constellationsSlot.ts:51` | `only: ['constellations']` |
| `src/services/loading/slots/flowFieldSlot.ts:46` | `only: ['flow']` |
| `src/services/engine/volume/uploadVolumeField.ts:27` | `only: ['volumeField']` |
| `src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot.ts:59-67` | hand-rolled `deps.fades.targetOf` + `deps.fades.fadeTo` |

The last one is hand-rolled because a Layer's `create` gets `LayerCoreDeps`, which has no `state`, and the bridge needs `Pick<EngineState, 'settings' | 'subsystems' | 'assetSlots' | 'gpu' | 'fadeRows'>`. It is **not equivalent** to the other four: `applyIntent` (`syncVisibilityFades.ts:19-46`) runs the row's `guard` and `post` around the fade write, and the hand-rolled block runs neither.

`syncVisibilityFadeItem` (`syncVisibilityFades.ts:89`) is the per-item bridge for exactly this edge. It is tested and has **zero production callers** — built, never wired.

`VisibilityLayerKey` and `AssetKey` do **not** correspond, in either direction: of 18 fade rows only 5 are asset-backed (`filaments`, `flow`, `constellations` 1:1; `survey` over 8 point slots; `volumeField` over 5 volume slots), and most `AssetKey`s (body textures, meshes, `hiResFamous`, `pgcAlias`, the `*Meta` sidecars) gate no fade at all. Any design keyed on a correspondence between them is wrong.

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `src/services/engine/wiring/installFadeOnArrival.ts` | Snapshot guards, re-check on slot `ready`, drive the rows whose guard opened. |
| `tests/services/engine/wiring/installFadeOnArrival.test.ts` | The four behaviours below. |

### Modified

| File | Change |
|---|---|
| `src/services/engine/phases/wireSlots.ts:125` | Install it beside `installSlotReadyWake`, after `installLoadProgress` and `seedFades`. |
| `src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot.ts` | Delete the hand-rolled fade block + the now-unused `fadeController` duration imports. |
| `src/services/loading/slots/filamentSlot.ts` | Delete the kick + the `syncVisibilityFades` import. Keep the `upload`. |
| `src/services/loading/slots/constellationsSlot.ts` | Same. |
| `src/services/loading/slots/flowFieldSlot.ts` | Same. |
| `src/services/engine/volume/uploadVolumeField.ts` | Same. |
| `src/@types/engine/layer/LayerCoreDeps.d.ts` | Delete `fades` — no consumers remain. |
| `src/services/engine/phases/createLayers.ts` | Drop `fades` from the `common` deps literal. |

`syncVisibilityFades`' `only` option **stays**: `applySceneEffect.ts:43,62` uses it for tour show/hide.

---

## Task 1: `installFadeOnArrival`

**Files:** create `src/services/engine/wiring/installFadeOnArrival.ts`; modify `src/services/engine/phases/wireSlots.ts`.

**review: yes** — Redux/fade state and a lifecycle invariant; the bug class is "fade never fires" or "fires twice", neither visible to CI.

**Signature:**

```ts
export function installFadeOnArrival(
  state: EngineState,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void;
```

**Behaviour:**

- At install, record `guard(state, item)` for every `state.fadeRows` row that has **both** `intent` and `guard`, over `row.expand(state)`. Key the record by row `key` + item. A row without `guard` can never transition — skip it entirely rather than recording `true`.
- Subscribe every slot in `allSlots`. On `kind === 'ready'`, recompute those guards. For each key whose value went **false → true**, call `syncVisibilityFadeItem(state, row.key, item)`. Store the recomputed values either way, so a close (`true → false`, e.g. an evict) re-arms the next open.
- **An item absent from the record counts as `false`.** `volumeField`'s `expand` grows when `addVolumeField(id)` dispatches, so a newly-appearing item must be able to fire on its first pass.

**Why a transition and not "guard is true"** — `applyIntent` runs the row's `post` unconditionally once the guard passes, and `post` is not idempotent (`fadeLayers.ts:191-194` re-arms a DEV lazy-load). `slot.cancel()` re-notifies subscribers with the last `ready` state (`installSlotReadyWake.ts`'s header), so a level check would re-run `post` on every re-notify. The transition rule also means `volumeField`'s DEV debug ids — whose guard is a constant `true` (`fadeLayers.ts:186-188`) — never fire from this path at all, leaving their lazy-load on the settings-toggle path via `makeReconcileEffects`. Behaviour preserved by construction, not by a special case.

**Install site:** `wireSlots.ts`, immediately after `installSlotReadyWake` at `:125`. It needs `state.fadeRows` composed (`createLayers` runs before `wireSlots`, D8) and `seedFades` already run, so the snapshot reflects seeded reality.

- [ ] Add the test `fades a row in when its guard opens on slot ready` — a stub slot whose commit flips a guard from false to true; assert the fade target moved to the row's `intent`.
- [ ] Add the test `does not re-fire when an already-ready slot re-notifies` — notify `ready` twice with the guard true throughout; assert the row's `post` ran exactly once. This is the `cancel()` case and the reason for the transition rule.
- [ ] Add the test `never fires for a row whose guard is constant true` — assert no `syncVisibilityFadeItem` effect for such a row, protecting `volumeField`'s DEV `post`.
- [ ] Add the test `drives only the item whose guard opened, not its row siblings` — two `survey` items, one opening; assert the sibling's in-flight target is untouched. This is the tier-swap hazard `syncVisibilityFades.ts:82-87` documents.
- [ ] Implement. Reuse the fixture in `tests/services/engine/wiring/syncVisibilityFades.test.ts` rather than building a second engine-state stub.
- [ ] Commit.

## Task 2: Delete the five kick sites

**Files:** `wireGalaxyCatalogSourceSlot.ts`, `filamentSlot.ts`, `constellationsSlot.ts`, `flowFieldSlot.ts`, `uploadVolumeField.ts`.

**review: yes** — five behaviour-preserving deletions across four subsystems; a missed one is a double fade, an over-eager one is a missing fade.

- [ ] Delete each kick. The GPU `upload` call in every commit **stays** — it is what opens the guard.
- [ ] `wireGalaxyCatalogSourceSlot.ts`: delete the whole `handle`/`target`/`fadeTo` block and the `FADE_IN_DURATION_MS`/`FADE_OUT_DURATION_MS` imports it was the only user of. Replace its comment with one line recording that the arrival fade is now core's edge — the tier-swap rationale it carried is preserved verbatim in `installFadeOnArrival`'s test name and in `syncVisibilityFades.ts:82-87`, so do not duplicate it here.
- [ ] `uploadVolumeField.ts`: this one is a *fix*, not just a move — its row-wide `only: ['volumeField']` sweep becomes the per-item form. Note that in the commit message.
- [ ] Each slot file's header comment that explains the kick loses that paragraph (`filamentSlot.ts:33-37`, `flowFieldSlot.ts:39-44`, `constellationsSlot.ts:48-50`).
- [ ] No new test: Task 1's four tests cover the edge, and each deletion is asserted by the existing suite staying green.
- [ ] Commit.

## Task 3: Delete `LayerCoreDeps.fades`

**Files:** `src/@types/engine/layer/LayerCoreDeps.d.ts`, `src/services/engine/phases/createLayers.ts`, any test that builds a `LayerCoreDeps` literal.

**review: yes** — a Layer contract field.

- [ ] Delete the `fades` field and drop it from `createLayers`' `common` literal. After Task 2 it has no consumers (`wireGalaxyCatalogSourceSlot.ts:61-62` was the only one; the three other `fades` references under `src/layers/` are `state.subsystems.fades` reads inside passes and label producers, which are unaffected).
- [ ] Update the `LayerCoreDeps` header: the field's removal is the point, so record in one clause that a Layer reads opacity through `state.subsystems.fades` in its passes but cannot drive a fade at construction — core owns that edge.
- [ ] No new test. `tsc` is total here: a surviving consumer fails the build.
- [ ] Commit.

---

## Out of scope (deferred)

- **Deriving `guard` from an asset key.** `volumeField`'s guard carries a DEV-fixture exemption (`fadeLayers.ts:184-188`) that no derivation expresses; unifying the two would build a mechanism around a special case, which is the thing the simplicity convention says to un-braid rather than encode.
- **Any `FadeLayer` / `AssetWiringRow` contract field.** The whole point is that none is needed.
- **The `filaments` Layer** — plan 05a, which lands after this on clean ground and whose `create` then wires no fade at all.
- **Splitting `VisibilityLayerKey` per item** (`starCatalogLabel`, `bodyLabel` are cluster-level rows). Unrelated, and the type's header already records when that split is warranted.

---

## Definition of Done

**Deliverable inventory**

- [ ] `installFadeOnArrival` exists, is installed from `wireSlots`, and has the four named tests.
- [ ] `grep -rn "fades\.fadeTo\|syncVisibilityFades(" src/layers src/services/loading` returns nothing — no slot factory and no Layer drives a fade.
- [ ] `syncVisibilityFadeItem` has a production caller.
- [ ] `LayerCoreDeps` no longer declares `fades`.
- [ ] `syncVisibilityFades`' `only` option survives, still used by `applySceneEffect`.

**Named observable behaviours** (manual smoke pass)

- [ ] Enable **filaments** with the download cold: the skeleton fades in on arrival, no pop, no double-ramp.
- [ ] Enable **constellations** cold: same.
- [ ] Enable the **flow field** cold: same.
- [ ] Enable a real volume (**MCPM** or **CF4 density**) cold: it fades in on arrival, and enabling a *second* volume while the first is still ramping does not restart the first's fade — this is the per-item fix.
- [ ] Toggle a **DEV debug volume** (`debug-gaussian`): it still lazy-loads and appears. This is the `post` path the transition rule deliberately leaves alone.
- [ ] Switch **tier** (small ⇄ large) with several galaxy catalogs enabled: each catalog fades in as its own payload lands; none restarts a sibling's ramp.
- [ ] Toggle a catalog **off mid-download**, then let the download finish: it stays invisible rather than fading in.
- [ ] A tour beat that shows/hides layers still animates over its authored duration (`applySceneEffect`'s `only` path is untouched).

**Deferral boundary** — everything under "Out of scope". A reviewer finding the filaments renderer still built by `gpuHandleRegistry` is looking at 05a, not a gap here.
