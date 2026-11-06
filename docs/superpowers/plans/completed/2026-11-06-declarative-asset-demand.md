# Declarative asset demand (PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every `AssetWiringRow` declares its demand as data (`AssetDemand`) that one core evaluator turns into
demand/release edges, with behaviour identical to today except the two flagged changes.

**Architecture:** the row's `demand` function and its `release?` become `demand: AssetDemand`. `reevaluateDemand`
asks `evaluateAssetDemand(row, ctx, entries)` once per row and reads its `{ demand, release }`. The band
distance moves into one shared helper used by both the fade and the evaluator. Body-texture and mesh rows ride
a transitional `{ fn, release? }` variant, which PR B deletes.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-declarative-asset-demand-design.md`

## Global Constraints

- `type` aliases, never `interface`; one type per `@types/` file; one function per `utils/` file; deep relative imports.
- Comments explain why only; module header ≤ 10 lines (`docs/superpowers/conventions/comments.md`).
- Moves and renames go through `npm run move-files -- <from> <to>`, never `git mv`.
- Commits: repo identity, **no `Co-Authored-By` trailer**, never `git add -A`, never `git stash`.
- **Tasks 4–7 run only after the prep PR (`prep/gated-slots-release-gpu`) has merged**, followed by `git merge main` into this branch. Those tasks make rows release when switched off, which needs every slot's `onRelease`.

## Review Focus

1. **A banded row whose band names `from` a body** (satellites: `from: SCENE_EARTH.id`). The distance must use
   Earth's live position at `ctx.simDays`, not the origin. Owned by Task 7's test.
2. **Release while lifted.** With the palette open or a satellite selected, and the camera far away, satellites
   must neither release nor stop demanding. Owned by Task 7.
3. **Companion rows** (famousGalaxiesMeta). They must still load once the parent leaves `idle` and never release.
   Owned by Task 2 (the evaluator test) and Task 3 (the expand test).
4. **Toggle-off release of a row whose slot is mid-fetch** (`loading`). The evict edge only fires on
   `ready`/`error`, so a loading slot finishes first and then releases on the next pass. The existing loop guard
   at `reevaluateDemand.ts:59-63` must stay as it is. Owned by Task 3, which keeps that guard verbatim.
5. **A row with a bad declaration** (unknown band key, or an edge the band lacks). It must throw at table build
   (`createLayers`), not fail silently per frame inside the per-row try/catch. Owned by Task 2.

---

### Task 1: Extract `bandDistanceMpc`

**Files:** `src/services/engine/presentation/bandValueOf.ts` (modify), `src/services/engine/presentation/bandDistanceMpc.ts` (create)

**Signature:** `bandDistanceMpc(band: EntryBand, camPosMpc: Readonly<Vec3>, bodyStates: ReadonlyMap<string, BodyState>): number`
(use whatever map type `BandEye['snapshot']['bodyStates']` already is).
**Behaviour:** this is today's logic from `bandValueOf.ts:19-25` and `:34`. With no `from`, it returns the
origin `hypot`. For a region id it returns `regionRelativeDistanceMpc`. For a body it returns the distance to
that body, or Infinity when the body is missing. `bandValueOf` calls it.

- [x] Move the logic; `bandValueOf` keeps its signature. No new test: `tests/services/engine/presentation/bandValueOf*.test.ts` already covers every branch.
- [x] `npm test -- bandValueOf` passes.
- [x] Commit `refactor(visibility): bandDistanceMpc shared by fade and demand`.

### Task 2: `AssetDemand` types, the evaluator and the build-time check

**review: yes** (it decides every asset's load and release)

**Files:**
- Create:
  - `src/@types/loading/AssetDemand.d.ts`
  - `src/@types/loading/NearGate.d.ts`
  - `src/@types/loading/DemandFn.d.ts`
  - `src/services/engine/wiring/evaluateAssetDemand.ts`
  - `src/services/engine/wiring/assertAssetDemands.ts`
- Tests:
  - `tests/services/engine/wiring/evaluateAssetDemand.test.ts`
  - `tests/services/engine/wiring/assertAssetDemands.test.ts`

**Contract:**

```ts
export type DemandFn = (ctx: DemandCtx) => boolean;
export type NearGate = { readonly band: string; readonly edge: 'in' | 'out'; readonly lead: number; readonly release: number };
export type AssetDemand =
  | 'always'
  | 'whenSearching'
  | { readonly companionOf: AssetKey }
  /** Transitional, PR B deletes it: body textures and mesh rows only. */
  | { readonly fn: DemandFn; readonly release?: DemandFn }
  | {
      readonly shown?: VisibilityAddress | { readonly address: VisibilityAddress; readonly items: readonly string[] };
      readonly labelsCount?: true;
      readonly tiers?: readonly Tier[];
      readonly near?: NearGate;
      readonly alsoWhen?: readonly ('searching' | 'selected')[];
    };

evaluateAssetDemand(
  row: Pick<AssetWiringRow, 'demand' | 'gates'>,
  ctx: DemandCtx,
  entries: readonly VisibilityEntry[],
): { readonly demand: boolean; readonly release: boolean }

assertAssetDemands(rows: readonly AssetWiringRow[], entries: readonly VisibilityEntry[]): void // throws
```

**Rules** (copied from the spec):

- `'always'` → demand, never release.
- `'whenSearching'` → demand = `ctx.ui.paletteOpen`, never release.
- `companionOf` → demand = `ctx.slotState(k) !== 'idle'`, never release.
- `fn` → `{ demand: fn(ctx), release: release?.(ctx) ?? false }`.
- Object form:
  - **Resolve `shown`.** When it is omitted, use `gates`: an address string means the entry's own switch, and
    `{address, item}` means that one item.
  - An address string on an entry with `items` means any of its items. `{address, items}` means any of those.
  - Each switch is `visibilitySwitchOf(ctx.settings, entry, item)`.
  - With `labelsCount`, the label entry whose `of` is that address also counts, through its own
    `visibilitySwitchOf`.
  - An object-form row with neither `shown` nor `gates` is a build-time error.
  - `tierOk` = `tiers` is absent or includes `ctx.tier`.
  - **`near` load and release tests.** Take `d = bandDistanceMpc(band, ctx.cameraPosMpc, deriveBodyStates(ctx.simDays))`,
    with the band from the shown entry's `bands[near.band]`.
    - `out` edge (with `e = out[1]`): load when `d ≤ e·lead`, release when `d > e·release`.
    - `in` edge (with `e = in[0]`): load when `d ≥ e/lead`, release when `d < e/release`.
    - With no `near`, the row always loads and never releases on scale.
  - `lifted` = (`'searching'` ∧ `paletteOpen`) ∨ (`'selected'` ∧ `ctx.selectedKinds` overlaps the shown entry's `selects`).
  - **demand** = `shown && tierOk && (nearLoad || lifted)`.
  - **release** = `!tierOk || !shown || (!lifted && nearRelease)`.

**`assertAssetDemands` throws** with the row key in the message on any of these:

- the address resolves to no entry;
- `near.band` is missing from that entry's bands;
- the band lacks the `near.edge` side;
- `lead < 1` or `release < lead`;
- `selected` is used on an entry with no `selects`;
- an object form has neither `shown` nor `gates`.

Tests, using a small hand-built `entries` fixture with one `out` band, one `in` band, one `from`-body band and
one label entry:

- [x] `'always' demands and never releases`
- [x] `'whenSearching' follows the palette and never releases`
- [x] `companionOf demands once the parent leaves idle and never releases`
- [x] `an object row releases when its switch is off`: switch off → `{ demand: false, release: true }`
- [x] `tiers excludes and releases outside the listed tiers`
- [x] `out edge loads within e·lead and releases beyond e·release`: assert at `e·lead·0.99` (demand), `e·lead·1.01` (neither), `e·release·1.01` (release)
- [x] `in edge loads beyond e/lead and releases below e/release`: the mirror values
- [x] `a from-body band measures from the body's live position`: a stub `deriveBodyStates` (or a real `simDays` where the body sits off-origin) gives a distance the origin `hypot` would get wrong
- [x] `alsoWhen lifts the scale gate but never the switch or tier`: far + palette open + `'searching'` → demand, no release; same with the switch off → release
- [x] `labelsCount: a label switch alone demands`
- [x] `assertAssetDemands` cases: one test per throw above
- [x] `npm test -- evaluateAssetDemand assertAssetDemands` passes.
- [x] Commit.

### Task 3: The loop reads the evaluator; every row wrapped as `fn` (no behaviour change)

**review: yes**

**Files:**
- Core:
  - `src/@types/loading/AssetWiringRow.d.ts`
  - `src/@types/loading/DemandCtx.d.ts` (header doc only)
  - `src/services/engine/wiring/reevaluateDemand.ts`
  - `src/utils/loading/expandCompanionRows.ts`
  - `src/services/engine/phases/createLayers.ts` (calls `assertAssetDemands` after `expandCompanionRows`)
- Every row file (grep `demand:` under `src/layers` and `src/services/engine/wiring`): `constellationsAssetRows`,
  `localBubbleAssetRows`, `filamentsAssetRows`, `flowAssetRows`, `cosmicWebDensityAssetRows`,
  `starCatalogAssetRows`, `galaxyCatalogAssetRows`, `structureAssetRows`, `satellitesAssetRows`,
  `bodyAssetRows`, `meshAssetRows`.
- Tests: their `*.test.ts` that call `row.demand(ctx)` / `row.release(ctx)`, plus
  `tests/utils/loading/expandCompanionRows.test.ts`, `reevaluateDemand.test.ts` and `demandTable.test.ts`.

**Change:**

```diff
-  demand: (ctx: DemandCtx) => boolean;
-  release?: (ctx: DemandCtx) => boolean;
+  demand: AssetDemand;
```

- [x] `reevaluateDemand.ts`: compute `const verdict = evaluateAssetDemand(row, ctx, state.visibilityEntries)` once per row. Use `verdict.demand` at `:36` and `:70`, and `verdict.release` at `:62`. The fetch-time re-check at `:45` re-evaluates with a fresh `buildDemandCtx(state)`. Keep every other guard as it is.
- [x] `expandCompanionRows` emits `demand: { companionOf: row.companionOf }`.
- [x] Every row: `demand: { fn: <its current demand>, release: <its current release> }`. This is mechanical, with no value changes.
- [x] Rewrite the `DemandCtx` header (`DemandCtx.d.ts:1-75`) from "what predicates read" to "the evaluator's input". Keep the per-surface why, cut the rest.
- [x] Tests: replace each `row.demand(ctx)` / `row.release?.(ctx)` call with `evaluateAssetDemand(row, ctx, entries).demand` / `.release`. Write no new tests; the existing assertions are the behaviour-identity proof.
- [x] `npm run typecheck && npm test` passes.
- [x] Commit `refactor(loading): rows declare AssetDemand; loop reads one evaluator`.

### Task 4: Switch-only, constant and search rows as data

**Files:**
- Rows:
  - `constellationsAssetRows.ts`, `filamentsAssetRows.ts`, `flowAssetRows.ts`
  - `cosmicWebDensityAssetRows.ts` (also delete its "load-once: no release" header lines `:1-5` that the prep made stale)
  - `starCatalogAssetRows.ts`
  - `galaxyCatalogAssetRows.ts` (points get `{ tiers }`, pgcAlias gets `'whenSearching'`, hiResFamous gets `'always'`)
  - `bodyAssetRows.ts` (atlas only: `'always'`)
- Their tests.
- Backlog: `docs/BACKLOG.md:107` index line and `docs/backlog/2026-09-13-volume-field-vram-release.md`, both deleted.

**Values:**

- Switch-only rows → `{}` (shown from `gates`).
- Galaxy points → `{ tiers: TIER_LADDER.filter((t) => tierTarget(source, t) !== 0) }`. Delete the `excluded` closure.
- famousStarsMeta → `'always'`.

- [x] Add one test to each touched row file only where the declaration can be wrong: `galaxy points: SDSS lists no 'small' tier` (assert `tiers` excludes `small` for SDSS and includes it for 2MRS).
- [x] Update the existing switch tests in those files to also assert the switched-off release (`{ demand: false, release: true }`), which is the flagged change.
- [x] `npm test` passes. Commit.

### Task 5: Structure catalog as data

**Files:** `src/layers/structure/catalog/load/structureAssetRows.ts`, `tests/layers/structure/catalog/load/structureAssetRows.test.ts`

**Value:** `{ shown: { address: 'structureRing', items: BULK_CATALOG_CATEGORIES }, labelsCount: true }`.

- [x] Check `hasSectionSwitch(settings, 'structures')`. If it is true, the section rule now applies (the flagged change), so add the test `section off stops the structure catalog demand`. If it is false, note in the commit body that nothing changed.
- [x] Keep or adapt `ring on`, `label only on` and `galaxy-group alone does not demand` (the last is the reason `BULK_CATALOG_CATEGORIES` exists).
- [x] `npm test -- structureAssetRows` passes. Commit.

### Task 6: localBubble as data

**Files:** `src/layers/localBubble/shell/load/localBubbleAssetRows.ts`, its test

**Value:** `{ near: { band: 'shell', edge: 'out', lead: 2, release: 4 } }`. With out[1] = `NEIGHBOURHOOD_RECEDE_KPC` = 10 kpc, load stays at < 20 kpc and release at > 40 kpc. Delete `DEMAND_DISTANCE_MPC` and `RELEASE_DISTANCE_MPC`.

- [x] Tests:
  - `loads inside 20 kpc`: demand at 19.9 kpc;
  - `holds between 20 and 40 kpc`: neither demand nor release at 30 kpc;
  - `releases beyond 40 kpc`: release at 40.1 kpc;
  - `releases when switched off at Earth`: the flagged change.
- [x] `npm test -- localBubbleAssetRows` passes. Commit.

### Task 7: Satellites as data

**review: yes** (body-relative band)

**Files:** `src/layers/satellites/catalog/load/satellitesAssetRows.ts`, `src/layers/satellites/points/data/satelliteFades.ts`, their tests

**Value:** `{ shown: 'satellites', near: { band: 'nearEarth', edge: 'out', lead: 1.5, release: 2.5 }, alsoWhen: ['searching', 'selected'] }`.
With `goneBeyondKm` = 600,000, that keeps load at < 900,000 km and release at > 1,500,000 km. Delete
`loadWithinKm` / `releaseBeyondKm` from `SATELLITE_FADES`, and delete `cameraEarthKm` / `anyClassShown`. Keep
the module header's explanation of the selection arm.

- [x] Tests:
  - `loads within 900,000 km of Earth`;
  - `holds at 1,200,000 km`;
  - `releases beyond 1,500,000 km`.
  - Measure each from Earth's position at a `simDays` where Earth is not at the origin.
  - `palette open loads from anywhere and never releases`;
  - `a selected satellite loads from anywhere and never releases`;
  - `every class off releases even with the palette open`.
- [x] `npm test -- satellites` passes. Commit.

## Definition of Done

- **Deliverables:**
  - `AssetDemand`, `NearGate` and `DemandFn` types;
  - `evaluateAssetDemand`, `assertAssetDemands` and `bandDistanceMpc`;
  - no row file contains `(ctx) =>` except the transitional `fn` in `bodyAssetRows.ts` and `meshAssetRows.ts`;
  - the localBubble literals and `SATELLITE_FADES.loadWithinKm`/`releaseBeyondKm` are gone.
- **Observable behaviour** (dev server, Debug Panel → asset loading):
  - at Earth boot, the same slots load as on main;
  - switching flow, filaments or a galaxy catalog off moves its slot to `idle` and its GPU ledger rows disappear;
  - switching it back on reloads it;
  - flying out past 40 kpc releases the Local Bubble;
  - with the palette open far from Earth, satellites still load.
- **Deferred to PR B:**
  - `size` gates;
  - `drawPxPerRad`;
  - the band approach on survey rows;
  - survey galaxy lifts;
  - deleting the `fn` variant and the load-radius files;
  - deleting the "Scale-gated asset demand" backlog item.
