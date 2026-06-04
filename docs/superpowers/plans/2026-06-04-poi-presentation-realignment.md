# POI Presentation Realignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dissolve the `poiSubsystem` god-object into three standalone presentation producers that read the Spec-2 data stores — `produceStructureMarkers` + `produceStructureLabels` (read `structureStore`) and `produceFamousLabels` (galaxy-side famous join, reads `galaxyStore`) — moving cross-producer label declutter into the `labelDirector` merge step.

**Architecture:** A presentation-layer refactor with **no intended behaviour change**. Today `poiSubsystem` fuses a data store (already extracted to `structureStore` in Spec 2 — it currently dual-writes both) with two per-frame producers (labels, markers) and conflates structures with a guest data type (famous-galaxy labels). This spec extracts the producers as pure functions over the stores, moves the famous-label 2-asset join entirely onto the galaxy side, relocates the screen-space declutter to the director (so structure + famous + youAreHere labels still de-collide), and deletes `poiSubsystem` + the `PointOfInterest` famous arm. The ring pick-index alignment contract (`byCategory(cat)[poiIndex]`, emit-all-then-discard alpha-0) is preserved verbatim.

**Tech Stack:** TypeScript (strict), Vitest, WebGPU/WESL (no shader changes expected). No new runtime deps.

**Source of truth:** [`docs/superpowers/specs/2026-06-01-poi-presentation-realignment-design.md`](../specs/2026-06-01-poi-presentation-realignment-design.md) and [ADR 0005](../../adrs/0005-engine-data-layer-and-asset-loading.md). Spec 1 (#237) and Spec 2 (#253) are shipped to main. Read the design spec in full before starting.

---

## Decisions (resolved — defaults chosen)

### Decision A — famous-label visibility home — RESOLVED: galaxyStore flag

The settings toggle (`engine.ts` `setCategoryLabelVisible`) covers four categories: `cluster`/`supercluster`/`void` (now `structureStore`'s `setLabelVisible`) and `famousGalaxy`. After the split, `famousGalaxy` has no `poiSubsystem` home.

**Default:** add a single `famousLabelsVisible: boolean` + `setFamousLabelsVisible(v)` pair to `galaxyStore` (default true), read by `produceFamousLabels`. Famous galaxies have no *marker* axis (no rings), so only the label axis needs a home; the `setCategoryMarkerVisible('famousGalaxy', …)` call becomes a no-op (famous never emitted markers anyway — `POI_STYLES.famousGalaxy.haloColor` is null today).

**Alternative:** a module-level flag inside a `createFamousLabelProducer` factory closure. Rejected: visibility is *galaxy presentation state* and belongs with the galaxy data home for symmetry with `structureStore`'s visibility axes; a factory closure hides it from the rest of the engine.

### Decision B — `PointOfInterest` after the famous arm is removed — RESOLVED: delete the type

Once famous labels are derived (not stored), `PointOfInterest = StructureRecord | FamousGalaxyPoi` loses its famous arm and would collapse to a one-member alias of `StructureRecord`.

**Default:** delete `PointOfInterest.d.ts` and `FamousGalaxyPoi` entirely; every consumer uses `StructureRecord` directly. The famous-galaxy label/size fields (`minApparentSizePx`, `apparentDiameterKpc`, `labelAnchorOffsetMpc`, `labelWorldEmMpc`) move onto a new `FamousLabelInput` type derived inside `produceFamousLabels` from `galaxyStore` (catalog + famousMeta), not stored.

**Alternative:** keep `PointOfInterest` as a `StructureRecord` alias. Rejected — a one-arm "union" is a misleading name and the spec explicitly says "the famous-label record loses `PointOfInterest` union membership."

### Decision C — `PoiCategory` vs `StructureCategory` — RESOLVED: keep `PoiCategory` for pick/selection, derive from split styles

`PoiCategory` (`cluster | supercluster | famousGalaxy | void`) is used by `selectionEncoding`, the pick path, the settings category toggles, and `resolvePoiFromPick`. `StructureCategory` (`cluster | supercluster | void`) exists from Spec 2.

**Default:** `resolvePoiFromPick` and the structure marker pick path narrow to `StructureCategory` (rings are structure-only — famous never ring-picks). Keep `PoiCategory` ONLY where the four-category selection/style space is genuinely needed (`selectionEncoding`, settings toggles), and relocate its definition out of the about-to-be-deleted `poiSubsystem.ts` into a standalone `src/@types/.../PoiCategory.d.ts` (or fold into the style tables). Verify each `PoiCategory` use during Task 8 and narrow to `StructureCategory` wherever famous is not actually reachable.

### Decision D — producer file layout — RESOLVED: one file per producer

`src/services/engine/presentation/produceStructureMarkers.ts`, `produceStructureLabels.ts`, `produceFamousLabels.ts` — a new `presentation/` sibling under `services/engine/` (matches the `data/`, `frame/`, `wiring/` layout; rationale: these are engine-owned per-frame presentation units, distinct from data stores and from the frame-loop orchestration). Shared style tables split into `structurePoiStyles.ts` + `famousLabelStyle.ts` co-located there. Single-function-file naming (filename = export name).

---

## Background: the caller graph being rewired

`poiSubsystem`'s consumers (from `grep subsystems.pois.`):

| Caller | Method | Becomes |
|---|---|---|
| `runFrame.ts:239` | `produceMarkers(state, ctx)` → `clusterMarkerRenderer.setMarkers` | `produceStructureMarkers(state, ctx)` |
| `engine.ts:611` | `labelDirector.registerProducer(pois)` | register `structureLabelProducer` + `famousLabelProducer` |
| `engine.ts:495` | `getPoi: findPoi(id)` (selection resolver) | `state.data.structures.byId(id)` |
| `runFrame.ts:259` | `findPoi(focusSel.id)` (camera focus) | `state.data.structures.byId(id)` |
| `runFrame.ts:455`, `wireInput.ts:90` | `resolvePoiFromPick(pois, …)` | `resolvePoiFromPick(structures, …)` |
| `engine.ts:1251/1262` | `setCategoryLabelVisible` / `setCategoryMarkerVisible` | `structureStore.setLabelVisible`/`setMarkerVisible` + `galaxyStore.setFamousLabelsVisible` |
| `wirePoiProjection.ts` | `setGroup`/`clearGroup`/`getPoisForCategory` | `wireStructureProjection` → `structureStore` only |
| `engine.ts:1098` | `pois.destroy()` | removed |

The label declutter currently lives **inside** `poiSubsystem.produceLabels` (the `DECLUTTER_MARGIN_PX` greedy pass over `candidates`). It moves to `labelDirectorSubsystem.runFrame`'s merge step.

---

## File-structure map

**New (`src/services/engine/presentation/`):**
- `produceStructureMarkers.ts` — `(state, ctx) => readonly ClusterMarkerDescriptor[]`, reads `state.data.structures.byCategory(...)`, ports `poiSubsystem.produceMarkers` verbatim.
- `produceStructureLabels.ts` — a `LabelProducer`, reads `state.data.structures`, ports the structure arm of `produceLabels` (NO internal declutter — emits all candidates with a `prominencePx`).
- `produceFamousLabels.ts` — a `LabelProducer`, reads `state.data.galaxies` (catalog ⋈ famousMeta), ports the famous arm of `produceLabels`.
- `structurePoiStyles.ts` — `STRUCTURE_POI_STYLES` (cluster/supercluster/void rows from `POI_STYLES`).
- `famousLabelStyle.ts` — `FAMOUS_LABEL_STYLE` (the famousGalaxy row).

**New types (`src/@types/`):**
- `src/@types/engine/presentation/StructureLabelProducer.d.ts` / `FamousLabelProducer.d.ts` — only if a richer shape than `LabelProducer` is needed (likely not; both are `LabelProducer`). Skip if `LabelProducer` suffices.
- `src/@types/data/PoiCategory.d.ts` — relocated from `poiSubsystem.ts` (Decision C), if still needed after narrowing.

**Modified:**
- `src/services/engine/subsystems/labelDirectorSubsystem.ts` — add declutter to the merge step; add a `prominencePx` read off `Label`.
- `src/@types/rendering/Label.d.ts` — add optional `prominencePx?: number` (declutter sort key; renderer ignores it).
- `src/services/engine/frame/runFrame.ts` — markers producer swap; `findPoi`→`structures.byId`; `resolvePoiFromPick(structures, …)`.
- `src/services/engine/phases/wireInput.ts` — `resolvePoiFromPick(structures, …)`.
- `src/services/engine/helpers/resolvePoiFromPick.ts` — narrow param to a `{ byCategory }` shape over `StructureRecord`.
- `src/services/engine/engine.ts` — register the two label producers; `getPoi`→`structures.byId`; visibility setters; drop `pois` from the subsystem bag + construction + destroy.
- `src/services/engine/wiring/wirePoiProjection.ts` → rename to `wireStructureProjection.ts`; drop the `poiSubsystem` writes, keep `structureStore` writes + counts from `structureStore.byCategory`.
- `src/@types/engine/state/EngineSubsystems.d.ts` (or wherever the bag is typed) — remove `pois`.

**Deleted:**
- `src/services/engine/subsystems/poiSubsystem.ts`, `src/@types/engine/subsystems/PoiSubsystem.d.ts`, `CreatePoiSubsystemInput.d.ts`, `PoiGroupId.d.ts`.
- `src/@types/engine/subsystems/PointOfInterest.d.ts` (Decision B).
- `src/services/engine/phases/buildPoisFromFamousMeta.ts` (join moves into `produceFamousLabels`).
- `src/services/engine/phases/buildPoisFromClusterCatalog.ts` → **keep but rename** `clusterCatalogToStructures.ts` (still converts the slot payload → `StructureRecord[]` for `wireStructureProjection`). Returns `StructureRecord[]` already (Spec 2).

---

## Task 1: `produceStructureMarkers` (extracted, alongside poiSubsystem)

Port `poiSubsystem.produceMarkers` to a standalone function reading `state.data.structures`. Both live simultaneously this task — only the unit test exercises the new one.

**Files:**
- Create: `src/services/engine/presentation/structurePoiStyles.ts`
- Create: `src/services/engine/presentation/produceStructureMarkers.ts`
- Test: `tests/services/engine/presentation/produceStructureMarkers.test.ts`

- [x] **Step 1: Write the failing test**

```ts
// tests/services/engine/presentation/produceStructureMarkers.test.ts
import { describe, it, expect } from 'vitest';
import { produceStructureMarkers } from '../../../../src/services/engine/presentation/produceStructureMarkers';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';
// build a minimal ReadyFrameContext + EngineState stub with state.data + state.subsystems.selection
// (selected()/focused() returning null), seed structures.setGroup('bulk', [rec(...)]).

describe('produceStructureMarkers', () => {
  it('emits one descriptor per marker-bearing structure in byCategory order', () => { /* ... */ });
  it('emits alpha-0 descriptors for fully-faded markers (pick-index alignment)', () => { /* ... */ });
  it('applies significance weight, selection 1.5x bump, and focus dim', () => { /* ... */ });
});
```

- [x] **Step 2: Run it, expect failure** — `npm run test -- tests/services/engine/presentation/produceStructureMarkers.test.ts` → FAIL (module not found).

- [x] **Step 3: Implement**

`structurePoiStyles.ts`: lift the `cluster`/`supercluster`/`void` rows of `POI_STYLES` (+ the `CategoryStyle` type, `SIG_MIN_ALPHA`, `NON_SELECTED_MARKER_DIM`) into `STRUCTURE_POI_STYLES` keyed by `StructureCategory`. `produceStructureMarkers(state, ctx)`: copy the body of `poiSubsystem.produceMarkers` verbatim, replacing `allPois()` iteration with `state.data.structures.all()` (which is already `anchors → bulk` ordered — same contract), `markerVisibility[cat]` with `state.data.structures.markerVisible(cat)`, and dropping the `famousGalaxy` skip (structures only). Keep the emit-all-then-discard alpha-0 contract and the selection/focus reads off `state.subsystems.selection`. Didactic comment: cite the preserved pick-index alignment.

- [x] **Step 4: Run it, expect pass.**

- [x] **Step 5: Commit** — `feat(engine): produceStructureMarkers reads structureStore`

---

## Task 2: `produceStructureLabels` (extracted, no internal declutter)

Port the structure arm of `produceLabels`. Crucially: **emit every surviving candidate with a `prominencePx`; do NOT declutter here** (Task 4 moves declutter to the director). This task makes the structure labels available as a producer but the director isn't wired to it yet, so behaviour is unchanged.

**Files:**
- Create: `src/services/engine/presentation/produceStructureLabels.ts`
- Modify: `src/@types/rendering/Label.d.ts` (add `prominencePx?: number`)
- Test: `tests/services/engine/presentation/produceStructureLabels.test.ts`

- [x] **Step 1: Write the failing test** — assert: featured-only gate; label-visibility gate; anchor gate (structure label needs its marker visible); marker close-approach + far-distance fade applied to label alpha; `prominencePx` set to the ring's apparent radius; no declutter (two near labels both emitted).

- [x] **Step 2: Run it, expect failure.**

- [x] **Step 3: Implement**

Add `readonly prominencePx?: number;` to `Label` (docstring: declutter sort key, consumed by the labelDirector merge, ignored by the renderer). `produceStructureLabels(state, ctx)`: port the structure branch of `produceLabels` (the `p.category !== 'famousGalaxy'` paths: featured gate, label+marker visibility gates via `structureStore`, the marker max/min apparent-radius fade applied to `fadeAlpha`, ring-centre anchor). Set `prominencePx` on each emitted `Label`. Return `{ labels, lines: [], awake: false }` (structures emit no anchor lines). Read records from `state.data.structures.all()`. Keep the one-shot `labelLayer:'poi'` fade-in? — see Task 5 note (move the fade-in fire to whichever producer emits first, or to the director; for now omit and restore in Task 5).

- [x] **Step 4: Run it, expect pass.**

- [x] **Step 5: Commit** — `feat(engine): produceStructureLabels reads structureStore`

---

## Task 3: `produceFamousLabels` (galaxy-side join)

Port the famous arm of `produceLabels`, deriving the famous label inputs from `galaxyStore` (`get(Source.Famous)` worldPos+diameterKpc ⋈ `famousMeta` name) — the 2-asset join, now entirely galaxy-side. Add the `galaxyStore` famous-label visibility flag (Decision A).

**Files:**
- Create: `src/services/engine/presentation/famousLabelStyle.ts`
- Create: `src/services/engine/presentation/produceFamousLabels.ts`
- Modify: `src/@types/engine/data/GalaxyStore.d.ts` + `src/services/engine/data/createGalaxyStore.ts` (add `famousLabelsVisible` getter + `setFamousLabelsVisible`)
- Test: `tests/services/engine/presentation/produceFamousLabels.test.ts` + extend `createGalaxyStore.test.ts`

- [x] **Step 1: Write the failing tests** — galaxyStore: `famousLabelsVisible` defaults true, setter flips it. produceFamousLabels: apparent-size gate (`minApparentSizePx` vs projected `apparentDiameterKpc`); fade band smoothstep; lifted label + vertical `MarkerLine` anchor (`labelAnchorOffsetMpc`); per-POI `labelWorldEmMpc`; emits nothing when famousMeta empty OR famous catalog absent (graceful degrade); emits nothing when `famousLabelsVisible === false`; sets `prominencePx` to the galaxy's apparent diameter.

- [x] **Step 2: Run it, expect failure.**

- [x] **Step 3: Implement**

`GalaxyStore`: add `readonly famousLabelsVisible: boolean` + `setFamousLabelsVisible(v: boolean): void` (default true). `famousLabelStyle.ts`: the `famousGalaxy` row of `POI_STYLES`. `produceFamousLabels(state, ctx)`: read `state.data.galaxies`; if `!famousLabelsVisible` or meta empty or catalog absent/empty → `{ labels: [], lines: [], awake: false }`. Otherwise zip `famousMeta[i]` with catalog row `i` (the famous `.bin` is meta-aligned — verify against `buildPoisFromFamousMeta` before deleting it) into a local `FamousLabelInput` ({ id, name, worldPos, apparentDiameterKpc, minApparentSizePx, labelAnchorOffsetMpc, labelWorldEmMpc }) and port the famous label math verbatim (apparent-size gate, smoothstep fade, lift + line, per-POI em). Set `prominencePx`. The one-shot `labelLayer:'poi'` fade-in is omitted here (producers stay pure) and re-homed to the director in Task 5.

- [x] **Step 4: Run it, expect pass.**

- [x] **Step 5: Commit** — `feat(engine): produceFamousLabels — galaxy-side famous join`

---

## Task 4: Move declutter into the labelDirector merge

Relocate the `DECLUTTER_MARGIN_PX` greedy screen-space declutter from `poiSubsystem.produceLabels` to `labelDirectorSubsystem.runFrame`, so it de-collides labels **across** producers (structure vs famous vs youAreHere). This is the load-bearing behaviour-preservation step.

**Files:**
- Modify: `src/services/engine/subsystems/labelDirectorSubsystem.ts`
- Test: `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts` (extend)

- [x] **Step 1: Write the failing test** — register two stub producers each emitting a label whose projected screen positions are within `DECLUTTER_MARGIN_PX`; assert only the higher-`prominencePx` one survives the merge, AND its dropped partner's anchor line (id `${labelId}-anchor`) is also dropped. Off-screen labels (behind camera) are never dropped and never block. youAreHere (no `prominencePx`) participates with prominence 0.

- [x] **Step 2: Run it, expect failure.**

- [x] **Step 3: Implement**

In `labelDirectorSubsystem.runFrame`, after collecting `mergedLabels`/`mergedLines`: project each label's `worldPos` via `ctx.vp` (port the clip→screen + `onScreen` logic from `produceLabels`), sort by `prominencePx ?? 0` desc (stable index tiebreak), greedy-accept by `DECLUTTER_MARGIN_PX` against accepted on-screen anchors. Build an accepted label-id set; filter `mergedLines` to lines whose owning label survived (line id convention `${labelId}-anchor` — document this as the contract, or add `ownerLabelId` to `MarkerLine` if cleaner). Feed the decluttered arrays to the existing signature-hash + flush. Move `DECLUTTER_MARGIN_PX` into the director. Producers already stopped self-decluttering (Tasks 2/3 emit all candidates).

- [x] **Step 4: Run it, expect pass** + full suite still green (poiSubsystem still registered + still self-declutters at this point — it must be the ONLY label producer until Task 5, so the director declutter is a no-op over its single pre-decluttered output. NOTE: to avoid double-declutter, gate this task to land together with Task 5, OR have poiSubsystem stop self-decluttering first. Recommended: do Task 4 + Task 5 as one commit to keep the tree green — see Task 5.)

- [x] **Step 5: Commit** (folded into Task 5).

---

## Task 5: Switch the frame wiring to the new producers

Replace `poiSubsystem` in the per-frame paths: register `produceStructureLabels` + `produceFamousLabels` with the director (instead of `pois`), and point `runFrame` markers at `produceStructureMarkers`. `poiSubsystem` stays constructed only for the resolver paths (findPoi/getPoisForCategory) until Task 6.

**Files:**
- Modify: `src/services/engine/engine.ts` (registration), `src/services/engine/frame/runFrame.ts` (markers)

- [x] **Step 1: Write/adjust the failing test** — an engine-level or runFrame-level test asserting markers come from `structureStore` and labels include both structure + famous, decluttered once. (Reuse `wireSlots`/`runFrame` harnesses.)

- [x] **Step 2: Run it, expect failure.**

- [x] **Step 3: Implement**

`engine.ts:611`: replace `registerProducer(pois)` with `registerProducer(structureLabelProducer)` then `registerProducer(famousLabelProducer)` (LabelProducer-shaped wrappers around the Task 2/3 functions). `runFrame.ts:239`: `produceStructureMarkers(state, ctx)`. Stop `poiSubsystem.produceLabels` self-decluttering (it's no longer registered, so it simply isn't called — delete is Task 7). Land the Task 4 director declutter in this same commit so there's never a double-declutter window. Restore the one-shot `labelLayer:'poi'` fade-in in the director (fires on first non-empty merged label set) so it survives the producer split.

- [x] **Step 4: Run the full suite + typecheck** — visual-parity tests + pick-alignment must stay green.

- [x] **Step 5: Commit** — `refactor(engine): frame uses structure/famous producers + director declutter`

---

## Task 6: Repoint the resolver / visibility / counts paths to the stores

Move every remaining `poiSubsystem` reader onto `structureStore` (structures) and `galaxyStore` (famous label visibility).

**Files:**
- Modify: `src/services/engine/helpers/resolvePoiFromPick.ts` (narrow to `{ byCategory }` over `StructureRecord`), `runFrame.ts`, `wireInput.ts`, `engine.ts` (getPoi + visibility setters), `wirePoiProjection.ts` (counts).
- Test: `tests/services/engine/helpers/resolvePoiFromPick.test.ts` (restub), affected wiring tests.

- [ ] **Step 1: Adjust the failing tests** — `resolvePoiFromPick` stub becomes `{ byCategory(cat): StructureRecord[] }`; assert `byCategory(cat)[poiIndex]`. getPoi resolves a structure by id from `structureStore.byId`. Settings toggles route cluster/sc/void → `structureStore.setLabelVisible`/`setMarkerVisible`, famousGalaxy → `galaxyStore.setFamousLabelsVisible`.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement** — `resolvePoiFromPick(structures, {category, poiIndex})` → `structures.byCategory(category)[poiIndex] ?? null`, param typed `{ byCategory(c: StructureCategory): readonly StructureRecord[] }`, returns `StructureRecord | null`. `runFrame.ts:259` camera focus + `:455` hover and `wireInput.ts:90` click → pass `state.data.structures`. `engine.ts:495` `getPoi` → `state.data.structures.byId(id)`. `engine.ts:1251/1262` visibility → structure store (cluster/sc/void) + `galaxyStore.setFamousLabelsVisible` (famousGalaxy); `setCategoryMarkerVisible('famousGalaxy', …)` becomes a documented no-op. `wirePoiProjection.ts` counts → `structureStore.byCategory(cat).length`.

- [ ] **Step 4: Run the full suite + typecheck.**

- [ ] **Step 5: Commit** — `refactor(engine): POI resolver/visibility/counts read the stores`

---

## Task 7: Delete `poiSubsystem` + rename the projection wiring

With nothing reading it, remove the subsystem and the dual-write wiring half.

**Files:**
- Delete: `poiSubsystem.ts`, `PoiSubsystem.d.ts`, `CreatePoiSubsystemInput.d.ts`, `PoiGroupId.d.ts`.
- Modify: `engine.ts` (drop construction `pois: createPoiSubsystem()`, `destroy()` call, bag field), `EngineSubsystems` type.
- Rename: `wirePoiProjection.ts` → `wireStructureProjection.ts` (drop the `poiSubsystem.setGroup`/`clearGroup` calls; keep only `structureStore` writes + counts); update its caller in `wireSlots.ts` + its test.
- Rename: `buildPoisFromClusterCatalog.ts` → `clusterCatalogToStructures.ts` (returns `StructureRecord[]` already); delete `buildPoisFromFamousMeta.ts`.

- [ ] **Step 1:** Delete the files; update the subsystem bag type + `engine.ts` construction/destroy. `npm run typecheck` surfaces every dangling reference — fix until clean.
- [ ] **Step 2:** Rename `wirePoiProjection`→`wireStructureProjection`, drop the poiSubsystem writes, update `wireSlots.ts` + rename the test file. Delete `buildPoisFromFamousMeta.ts` + its test (join now in `produceFamousLabels`). Rename `buildPoisFromClusterCatalog`→`clusterCatalogToStructures` + its test.
- [ ] **Step 3:** Run the full suite + typecheck until green.
- [ ] **Step 4: Commit** — `refactor(engine): delete poiSubsystem; wireStructureProjection`

---

## Task 8: Collapse `PointOfInterest` + relocate `PoiCategory`/styles

Remove the now-vestigial `PointOfInterest` union and move the remaining shared types out of the deleted subsystem.

**Files:**
- Delete: `src/@types/engine/subsystems/PointOfInterest.d.ts`.
- Relocate: `PoiCategory` (from `poiSubsystem.ts`, already deleted in T7 — its consumers currently `import type { PoiCategory } from '...poiSubsystem'`) into `src/@types/data/PoiCategory.d.ts` (or fold structure uses into `StructureCategory`).

- [ ] **Step 1:** Grep every `PointOfInterest` and `PoiCategory` importer. For each: if it only ever sees structures, switch to `StructureRecord` / `StructureCategory`; if it genuinely spans the four-category space (`selectionEncoding`, settings toggles), import from the relocated `PoiCategory.d.ts`.
- [ ] **Step 2:** Delete `PointOfInterest.d.ts`. `npm run typecheck` until green.
- [ ] **Step 3:** Run the full suite + typecheck.
- [ ] **Step 4: Commit** — `refactor(engine): drop PointOfInterest union; relocate PoiCategory`

---

## Task 9: Behaviour-parity gate

- [ ] **Step 1: Full suite + typecheck + build** — `npm run test && npm run typecheck && npm run build`. Expected: all green; the new producer tests added, the deleted poiSubsystem tests removed.
- [ ] **Step 2: Manual smoke (dev server)** — confirm in the running dev server, identical to before: cluster/SC/void rings + halos (fade in/out at zoom extremes, significance dimming), featured structure labels + famous-galaxy labels (lifted + anchor line), label declutter in dense regions (Shapley/Virgo) including structure-vs-famous de-collision, cluster marker + label visibility toggles (independent axes), famous-label toggle, click/hover selection of a cluster ring (pick-index resolves the right structure), camera-focus-on-cluster dim. No behaviour change is the success criterion.
- [ ] **Step 3: Update memory** — mark Spec 3 implemented in `project_data_layer_redesign`; the engine data-layer redesign (all 3 specs) is complete.

---

## Self-review notes

- **Spec coverage:** three producers → Tasks 1–3; declutter→director → Task 4 (folded into 5); frame wiring → Task 5; resolver/visibility/counts → Task 6; deletions (`poiSubsystem`, builders, projection rename) → Task 7; `PointOfInterest`/`PoiCategory` → Task 8; parity → Task 9. Picking contract called out in Tasks 1 & 6.
- **Behaviour-preservation risks (call out to implementer):** (1) the declutter relocation must not double-declutter — Tasks 4+5 land together. (2) The `MarkerLine` ↔ label association for declutter drop (id convention vs `ownerLabelId`) — pick one and document. (3) the one-shot `labelLayer:'poi'` fade-in must survive the producer split (re-home in the director). (4) famous catalog↔meta row alignment — verify against `buildPoisFromFamousMeta` BEFORE deleting it.
- **Type consistency:** `StructureRecord`/`StructureCategory` (Spec 2) reused throughout; `PoiCategory` survives only where the four-category space is real (Decision C); `Label.prominencePx` defined in Task 2, consumed in Task 4.
- **Out of scope (parked, ADR 0005):** demand-driven unload; deep-readonly `EngineState` + typed setters; famous-galaxy deep-link (`#poi=famous-…`) resolution.
