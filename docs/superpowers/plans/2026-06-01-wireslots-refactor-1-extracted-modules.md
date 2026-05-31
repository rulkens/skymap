# wireSlots Refactor — Implementation Plan (Part 1: Extracted modules)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the four non-loading concerns out of `wireSlots` as pure, individually-tested modules, and replace `poiSubsystem.setPois` with keyed `setGroup`/`clearGroup` so the three POI projections can no longer clobber each other.
**Architecture:** Each extracted module is a `(state, deps?) => void` (or `=> handle`) unit doing exactly what its current `wireSlots` block does, byte-for-byte logic-identical. The POI merge dissolves: `wirePoiProjection` writes three keyed groups instead of one merged list; the subsystem concatenates internally. No demand model yet — Part 1 keeps `wireSlots` calling everything in the same order, just from extracted functions. This part barely touches `state.sources.*`, so it survives the Spec-2 store rename untouched.
**Spec:** docs/superpowers/specs/2026-06-01-wireslots-refactor-design.md
**ADR:** docs/adrs/0005-engine-data-layer-and-asset-loading.md
**Index:** docs/superpowers/plans/2026-06-01-wireslots-refactor-INDEX.md

---

## Conventions (see INDEX for full text — do not re-summarise inline)

- **Whole-file comment-cleanup pass** ends every file-touching task:
  `feedback_comment_style` (timeless + terse — strip history notes, keep
  didactic *why*-comments). Do NOT delete the multi-paragraph module headers,
  but DO make them timeless AND tighten verbose ones — preserve the *why* and
  the rejected alternative, trim the wordcount (see INDEX for the full nuance).
- **TDD**: failing test → minimal impl → green → commit.
- **Contract code only** (signatures + test names + tiny sketches); cite line
  ranges, never paste bodies.
- **Commits**: user's git identity; body ends with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`;
  stage specific paths only.

This part adds four new modules under `src/services/engine/wiring/` and a new
two-method API on `poiSubsystem`. All extractions are pure relocation — if a
test that exists today goes red, you changed behavior; stop and reconcile.

---

## Task 0: Pre-flight — verify baseline

**Files:** none (read-only).

- [ ] Run `npm test`. Expected: all pass. Note the exact count (the per-task
  deltas below are measured against it).
- [ ] Run `npm run typecheck`. Zero errors.
- [ ] Read `src/services/engine/phases/wireSlots.ts` end-to-end. The four
  blocks this part extracts are, by current line range:
  - impostor subsystems — `wireSlots.ts:302-365`
  - overlay/volumes/label fades — `wireSlots.ts:367-411`
  - POI merge (`rebuildAllPois` + the three subscriptions) — `wireSlots.ts:107-228`
  - synthetic-fallback gate — `wireSlots.ts:417-494` (extraction deferred to
    **Part 2 Task 13**; it depends on the demand context).
- [ ] Read `src/services/engine/subsystems/poiSubsystem.ts:343-364` (the
  `setPois`/`clearPois`/visibility closures) — Tasks 3–4 modify this.

If baseline is red, STOP and report — do not build on a broken tree.

---

## Task 1: Extract `wireImpostorSubsystems`

**Files:**
- Create: `src/services/engine/wiring/wireImpostorSubsystems.ts`
- Create: `tests/services/engine/wiring/wireImpostorSubsystems.test.ts`
- Modify: `src/services/engine/phases/wireSlots.ts` (delete the block, call the new fn)

**Signature:** `wireImpostorSubsystems(state: EngineState, deps: BootstrapDeps): void`

**Behaviour (verbatim relocation of `wireSlots.ts:302-365`):** build
`galaxyAtlas`, `hiResFamousTexture` (+ `initTexture()`), `hiResFamous`,
`texturedDisks`, `proceduralDisks`; call `texturedDiskRenderer.bindAtlas(...)`
+ `.bindHiResArray(...)`; assign all five onto `state.subsystems.*`. Reads
`device` + the disk renderers off `state.gpu` / `deps.phaseLocals` exactly as
the current block does, including the renderer null-check throws
(`wireSlots.ts:96-100`) — those move with it (they guard this block's reads).

- [ ] Add test `assigns galaxyAtlas, texturedDisks, proceduralDisks, hiResFamous, hiResFamousTexture onto state.subsystems`
  against a stub `state` + `deps` with a mock `device`. Assert all five
  `state.subsystems.*` are non-null after the call.
- [ ] Add test `binds the atlas and hi-res views into the textured-disk renderer`
  — spy on `texturedDiskRenderer.bindAtlas` + `.bindHiResArray`; assert each
  called once with the atlas/hi-res texture view.
- [ ] Add test `throws when texturedDisk/proceduralDisk renderers are null`
  asserting the existing precondition message.
- [ ] Implement by moving the block; do not rewrite the construction order
  (the dependency comment at `wireSlots.ts:302-306` is load-bearing — atlas +
  hiRes planner must exist before `texturedDisks`).
- [ ] In `wireSlots.ts`, replace the deleted block with a single
  `wireImpostorSubsystems(state, deps)` call at the same position.
- [ ] `npm run typecheck` → clean. `npm test -- wireImpostorSubsystems` →
  3 new tests pass; full `npm test` → green at baseline+3.
- [ ] **Whole-file comment-cleanup pass** on `wireImpostorSubsystems.ts` and
  `wireSlots.ts` (timeless + terse; keep the dependency-order *why*).
- [ ] Commit (`wireImpostorSubsystems.ts`, its test, `wireSlots.ts`).

---

## Task 2: Extract `registerOverlayFades`

**Files:**
- Create: `src/services/engine/wiring/registerOverlayFades.ts`
- Create: `tests/services/engine/wiring/registerOverlayFades.test.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

**Signature:** `registerOverlayFades(state: EngineState): void`

**Behaviour (verbatim relocation of `wireSlots.ts:367-411`):** register the
overlay handles (`milkyWay` at settings-gated 0/1, `proceduralDisks` 1,
`texturedDisks` 1), the `volumesMaster` handle at settings-gated 0/1, and the
four `labelLayer` handles (`youAreHere`/`poi`/`galaxyNames` at 0, `scaleBar`
at 1). The settings-derived opacities (`wireSlots.ts:380-383`, `393-396`) are
the load-bearing part — copy the exact gating.

- [ ] Add test `registers milkyWay at 1 when settings.milkyWay.enabled` and the
  companion `registers milkyWay at 0 when disabled` — spy on
  `state.subsystems.fades.register`; assert the opacity arg.
- [ ] Add test `registers volumesMaster at settings.volumes.masterEnabled gate`
  (both branches).
- [ ] Add test `registers the four label-layer handles at 0,0,0,1` — assert each
  `register` call's handle + opacity.
- [ ] Implement by moving the block.
- [ ] In `wireSlots.ts`, replace the block with `registerOverlayFades(state)`.
- [ ] `npm run typecheck` → clean. `npm test -- registerOverlayFades` → tests
  pass; full `npm test` → green.
- [ ] **Whole-file comment-cleanup pass** on both files.
- [ ] Commit.

---

## Task 3: `poiSubsystem` gains keyed `setGroup`/`clearGroup`

**Files:**
- Modify: `src/@types/engine/subsystems/PoiSubsystem.d.ts` (add the two methods)
- Create: `src/@types/engine/subsystems/PoiGroupId.d.ts` (the group-key union)
- Modify: `src/services/engine/subsystems/poiSubsystem.ts`
- Modify: `tests/services/engine/subsystems/poiSubsystem.test.ts`

**Why:** the merge in `wireSlots` exists only because `setPois` replaces the
whole list while three groups arrive on different schedules
(`wireSlots.ts:161-182`). Keyed groups make clobbering structurally impossible
(ADR 0005 §"POI is a consumer"; grill "keyed groups" decision).

**New type:**
```ts
type PoiGroupId = 'staticAnchors' | 'famous' | 'clusterBulk';
```

**New methods on `PoiSubsystem`:**
```ts
setGroup(id: PoiGroupId, pois: readonly PointOfInterest[]): void;
clearGroup(id: PoiGroupId): void;
```

**Behaviour:** the subsystem holds `Map<PoiGroupId, readonly PointOfInterest[]>`
internally. `setGroup` stores a defensive copy under the key; `clearGroup`
deletes the key. Every reader that today walks `pois`
(`findPoi`, `getPoisForCategory`, `produceLabels`, `produceMarkers`) now walks
the concatenation of all groups in a stable order
(`staticAnchors` → `famous` → `clusterBulk`, matching the current merge order at
`wireSlots.ts:195`). Concatenation order MUST be deterministic — `produceMarkers`'
pick-index alignment (`poiSubsystem.ts:760-773`) depends on per-category order
being stable across frames.

**Migration of existing `setPois`:** keep `setPois` + `clearPois` as thin
shims (`setPois(p)` = `setGroup('staticAnchors', p)` cleared of the other two;
`clearPois()` = clear all groups) ONLY if other callers exist; otherwise delete
them and update callers. Audit callers before deciding (grep
`setPois`/`clearPois` across `src/` + `tests/` via the Grep tool).

- [ ] Add test `setGroup then a second setGroup for a different id both appear in produceMarkers output`
  — set `staticAnchors` with one cluster POI, then `clusterBulk` with another;
  assert `produceMarkers` (or `getPoisForCategory`) returns both.
- [ ] Add test `clearGroup removes only that group` — set two groups, clear one,
  assert the other survives.
- [ ] Add test `concatenation order is staticAnchors, famous, clusterBulk` —
  set all three with one POI each in the same category; assert
  `getPoisForCategory(cat)` returns them in that order (pins the pick-index
  alignment contract).
- [ ] Implement: replace the single `pois` field with the group map; rewrite the
  four readers to iterate concatenated groups (extract a private
  `allPois(): readonly PointOfInterest[]` helper so the four readers share one
  concatenation site).
- [ ] Update `PoiSubsystem.d.ts` + create `PoiGroupId.d.ts`.
- [ ] `npm run typecheck` → clean. `npm test -- poiSubsystem` → new + existing
  pass; full `npm test` → green.
- [ ] **Whole-file comment-cleanup pass** on `poiSubsystem.ts` (timeless +
  terse; the module header's "why one subsystem for four kinds" stays).
- [ ] Commit.

---

## Task 4: Extract `wirePoiProjection` (deletes `rebuildAllPois`)

**Files:**
- Create: `src/services/engine/wiring/wirePoiProjection.ts`
- Create: `tests/services/engine/wiring/wirePoiProjection.test.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

**Signature:** `wirePoiProjection(state: EngineState): void`

**Behaviour (replaces `wireSlots.ts:107-228`, dissolving the merge):**

1. `setGroup('staticAnchors', buildStaticAnchorPois())` synchronously
   (`wireSlots.ts:125`).
2. Famous group is a **2-asset join**: subscribe to BOTH the `famousMeta` slot
   AND the Famous catalog slot (`state.assetSlots.points.get(Source.Famous)`);
   on either transition, recompute — when BOTH `state.sources.famousMeta`
   (non-empty) and the Famous catalog (count > 0) are present, call
   `setGroup('famous', buildPoisFromFamousMeta(meta, catalog))`; otherwise
   `clearGroup('famous')`. (Today's guard: `wireSlots.ts:184-190`.)
3. Bulk clusters: subscribe to the cluster-catalog slot; on `ready` with
   `state.sources.clusterBulk` present, `setGroup('clusterBulk',
   buildPoisFromClusterCatalog(state.sources.clusterBulk))`; else clear.
   (Today: `wireSlots.ts:191-194`, `226-228`.)
4. After any group change, emit the per-category structure counts via
   `cb.sources?.onStructureCountsChange?.({...})` exactly as
   `wireSlots.ts:202-206` (count off `getPoisForCategory`).

Each subscriber resolves its slot from `state.assetSlots` rather than closing
over locals (the slots are installed before this runs — Part 3 guarantees
order; for Part 1 keep the current call position so they already exist).

- [ ] Add test `publishes static anchors synchronously` — after the call,
  assert `getPoisForCategory('cluster')` (or the anchor categories) is non-empty
  with no async slot ready.
- [ ] Add test `famous group appears only when both Famous catalog and famousMeta are ready`
  — drive the meta slot ready alone → no famous POIs; then drive the Famous
  catalog ready → famous POIs appear. (The 2-asset join; spec Testing bullet.)
- [ ] Add test `out-of-order arrival: clusterBulk before famous does not clobber famous`
  — fire clusterBulk ready, then the famous join; assert both groups present.
  (The bug the merge worked around; spec Testing bullet.)
- [ ] Add test `emits onStructureCountsChange with per-category counts after a group change`
  — spy on `cb.sources.onStructureCountsChange`; assert it fires with the
  cluster/supercluster/void counts.
- [ ] Implement; DELETE `rebuildAllPois` and the inline subscriptions from
  `wireSlots.ts`. Replace with `wirePoiProjection(state)`.
- [ ] `buildPoisFromFamousMeta` / `buildPoisFromClusterCatalog` imports move to
  the new module; remove them from `wireSlots.ts` imports.
- [ ] `npm run typecheck` → clean. `npm test -- wirePoiProjection` → 4 tests
  pass; full `npm test` → green.
- [ ] **Whole-file comment-cleanup pass** on `wirePoiProjection.ts` and
  `wireSlots.ts` (the merge-rationale comment block at `wireSlots.ts:161-182`
  is now obsolete — its replacement in the new module explains keyed groups,
  not the merge).
- [ ] Commit.

---

## Task 5: Part-1 integration check

**Files:** none (verification only) + a possible `wireSlots.test.ts` update.

- [ ] Confirm `wireSlots.ts` no longer contains the impostor block, the fade
  block, `rebuildAllPois`, or the inline POI subscriptions — only the calls
  `wireImpostorSubsystems`, `registerOverlayFades`, `wirePoiProjection` plus
  the still-inline slot mint + load loop (Parts 2–3 remove the rest).
- [ ] If `tests/services/engine/phases/wireSlots.test.ts` asserted on the inlined
  structure (e.g. spied on `setPois`), update it to the new structure
  (`setGroup` calls). Behavior assertions (POIs published, fades registered,
  subsystems assigned) must still hold — that's the parity gate.
- [ ] `npm run typecheck` + full `npm test` → green at baseline + (3 + N₂ + N₄)
  new tests.
- [ ] Commit any test updates.

**Part 1 done when:** four blocks extracted, POI merge dissolved into keyed
groups, all extracted-module unit tests green, `wireSlots.test.ts` parity holds.
Proceed to Part 2.
