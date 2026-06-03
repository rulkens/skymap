# Engine Per-Type Data Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every engine data type one authoritative app-side home — `state.data.{ galaxies, structures, filaments, volumes }`, each a typed store with a query API — and migrate every consumer off the scattered locations (`state.sources.catalogs`, `state.sources.famousMeta`, `state.sources.clusterBulk`, `state.settings.volumes.fields`, transient filament status).

**Architecture:** Four plain-factory stores (no class), each returning a frozen object of methods over closed-over state. Slot commits become the only writers; producers / UI / pick / camera become read-only consumers of the query API. This is a **state-shape refactor with NO behaviour change** — every existing engine/render/pick/camera test must stay green. It is Spec 2 of 3 in the engine data-layer redesign (ADR 0005): Spec 1 (`wireSlots` refactor) landed in #237; Spec 3 (presentation realignment) consumes these stores.

**Tech Stack:** TypeScript (strict), Vitest. No new runtime deps.

**Source of truth:** [`docs/superpowers/specs/2026-06-01-engine-data-stores-design.md`](../specs/2026-06-01-engine-data-stores-design.md) and [ADR 0005](../../adrs/0005-engine-data-layer-and-asset-loading.md). Read both in full before starting.

---

## Decisions (resolved — defaults chosen)

The spec is precise about the store APIs but left two interim-wiring questions open. **Both are RESOLVED in favour of the defaults below** — implement the default path; the alternatives are recorded only for provenance.

### Decision A — `structureStore` ↔ `poiSubsystem` interim wiring (gates Task 9) — RESOLVED: default

`structureStore` is the authoritative home for **structure** records (anchors + bulk), and the spec is explicit it does **not** hold famous galaxies (those are galaxy data; their *label* moves in Spec 3). But `poiSubsystem` still exists in Spec 2 and still merges three groups (`staticAnchors` → `famous` → `clusterBulk`) for its per-frame `produceMarkers` / `produceLabels`, and the ADR says "Famous galaxies may remain an interim labeled-anchor member until Spec 3."

So in Spec 2 the per-frame producer path is **not** rewritten (that's Spec 3). The question is only: *where does `poiSubsystem` get its structure groups from once `structureStore` is authoritative?*

**Default assumption in this plan:** keep `poiSubsystem` as the per-frame producer untouched, but make `structureStore` the authoritative *data* home that **feeds** `poiSubsystem` at the existing wiring sites. Concretely: the anchors/bulk write sites write to `structureStore`, and the wiring that today calls `poiSubsystem.setGroup('staticAnchors'|'clusterBulk', …)` is sourced from `structureStore.all()` / `byCategory(...)`. Famous stays exactly as today (`buildPoisFromFamousMeta` → `poiSubsystem.setGroup('famous', …)`), reading `famousMeta` from `galaxyStore` (Task 8). Non-producer readers (camera focus, membership, click resolver) migrate to `structureStore`. This is the minimal change that makes the store authoritative with zero behaviour change.

**Alternative the user may prefer:** defer ALL structure migration to Spec 3 and have Spec 2 introduce `structureStore` as the home only for `clusterBulk` + anchors *data* with no consumer rewiring yet. Smaller blast radius, but leaves two homes for structure data during the gap. Confirm which.

### Decision B — `volumes.fields` migration vs `DemandCtx` (gates Task 10) — RESOLVED: default

The spec says `volumeStore` absorbs `state.settings.volumes.fields`. But `DemandCtx` (`src/@types/loading/DemandCtx.d.ts`) exposes `settings: Readonly<EngineSettingsState>` and the wiring predicates read `ctx.settings.volumes.fields[FIELD]?.enabled` (`assetWiring.ts:151,160`). Moving the field params off `settings` onto `state.data.volumes` means those predicates lose their read path.

**Default assumption in this plan:** `volumeStore` becomes the authoritative home, and `DemandCtx` gains a read surface for it (a `volumeField: (id) => VolumeFieldParams | undefined` accessor) so predicates query the store instead of `ctx.settings`. `VolumeFieldParams` is the renamed/relocated `VolumeFieldSettings` (`src/@types/settings/VolumeFieldSettings.d.ts`).

**Alternative the user may prefer:** leave `volumes.fields` on `settings` and have `volumeStore` be a thin *view* (registered ids + param accessors that read through to `settings.volumes.fields`), avoiding the `DemandCtx` change. The spec's migration-map row says "`state.settings.volumes.fields` → `state.data.volumes.fields`", which argues for the relocation, but the `DemandCtx` coupling is a real cost. Confirm which.

---

## File-structure map

**New types** (`src/@types/`, one type per file, deep relative imports, no barrels):

- `src/@types/engine/data/EngineData.d.ts` — the `EngineData` bag: `{ galaxies, structures, volumes, filaments }`.
- `src/@types/engine/data/GalaxyStore.d.ts` — `GalaxyStore` type.
- `src/@types/engine/data/StructureStore.d.ts` — `StructureStore` type.
- `src/@types/engine/data/VolumeStore.d.ts` — `VolumeStore` type.
- `src/@types/engine/data/FilamentStore.d.ts` — `FilamentStore` type.
- `src/@types/engine/data/StructureRecord.d.ts` — `StructureRecord` (extracted from the non-famous arms of `PointOfInterest`).
- `src/@types/engine/data/StructureCategory.d.ts` — `'cluster' | 'supercluster' | 'void'`.
- `src/@types/engine/data/StructureGroupId.d.ts` — `'anchors' | 'bulk'`.
- `src/@types/engine/data/VolumeFieldParams.d.ts` — relocated from `VolumeFieldSettings` (only if Decision B = relocate).
- `src/@types/data/VolumeFieldId.d.ts` — confirm whether this already exists; reuse if so.

**New factories** (`src/services/engine/data/` — a new sibling folder under `services/engine/`, matching the `camera/` `frame/` `phases/` layout; rationale: stores are engine-owned runtime state, not loading or wiring):

- `src/services/engine/data/createGalaxyStore.ts`
- `src/services/engine/data/createStructureStore.ts`
- `src/services/engine/data/createVolumeStore.ts`
- `src/services/engine/data/createFilamentStore.ts`
- `src/services/engine/data/createEngineData.ts` — assembles the four into one `EngineData`.

**New tests** (`tests/` mirrors `src/`):

- `tests/services/engine/data/createGalaxyStore.test.ts`
- `tests/services/engine/data/createStructureStore.test.ts`
- `tests/services/engine/data/createVolumeStore.test.ts`
- `tests/services/engine/data/createFilamentStore.test.ts`
- `tests/services/engine/data/forbiddenPaths.test.ts` — the migration-safety sweep.

**Modified (state shape + construction):**

- `src/@types/engine/state/EngineState.d.ts:88-114` — add `data: EngineData`.
- `src/@types/engine/state/EngineSourceState.d.ts:43-75` — remove `catalogs`, `famousMeta`, `clusterBulk` (keep `pickMask`, `drawMask`, `tier`).
- `src/services/engine/engine.ts:299` — construct `state.data` via `createEngineData()`.

**Modified (writers — the only mutation sites):**

- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts:187` — `state.data.galaxies.setCatalog(source, cloud)`.
- `src/services/loading/slots/famousMetaSlot.ts:32,39` — `state.data.galaxies.setFamousMeta(...)`.
- `src/services/loading/slots/clusterCatalogSlot.ts:39,43` — structure bulk group → `structureStore`.
- `src/services/loading/slots/{cf4DensitySlot,mcpmSlot,syntheticVolumeSlots}.ts` + `engine.ts:915-1049` — volume field params → `volumeStore`.

**Modified (readers — full list per grep, addressed task-by-task):**

- galaxies (`sources.catalogs`): `clusterMembership.ts`, `engine.ts`, `runFrame.ts`, `selectionRingPass.ts`, `diskRadiusRingPass.ts`, `galaxyCatalogSourceRegistry.ts`, `wirePoiProjection.ts`, `wireInput.ts`, plus types `BiasCorrectionDeps.d.ts`, `SelectionSubsystem.d.ts`.
- famousMeta: `famousMetaSlot.ts`, `engine.ts`, `runFrame.ts`, `diskRadiusRingPass.ts`, `wirePoiProjection.ts`, `buildPoisFromFamousMeta.ts`, `wireInput.ts`, plus type `EngineAssetSlots.d.ts`.
- clusterBulk: `clusterCatalogSlot.ts`, `wirePoiProjection.ts`, plus type `EngineAssetSlots.d.ts`.
- volumes.fields: `cf4DensitySlot.ts`, `mcpmSlot.ts`, `syntheticVolumeSlots.ts`, `engine.ts`, `runFrame.ts`, `encodeHdrSingle.ts`, `encodeHdrSplit.ts`, `assetWiring.ts`, `volumeUpsamplePass.ts`, `registerOverlayFades.ts`, `buildVolumeFieldsSnapshot.ts`, plus types `VolumeFieldSettings.d.ts`, `DemandCtx.d.ts`.

---

## Task 1: `StructureRecord` / `StructureCategory` / `StructureGroupId` types

Extract the structure shape from the existing `PointOfInterest` discriminated union. Today's `PointOfInterest` = `ClusterPoi | SuperclusterPoi | VoidPoi | FamousGalaxyPoi` (`src/@types/engine/subsystems/PointOfInterest.d.ts`). `StructureRecord` is the **non-famous** arms only — exactly the spec's field list (`id`, `name`, `worldPos`, `category`, `featured`, `physicalRadiusMpc`, `apparentRadiusMpc?`, `significance?`, `abell?`, `description?`).

**Reuse decision (resolved):** do NOT invent a parallel type. Define `StructureRecord = ClusterPoi | SuperclusterPoi | VoidPoi` by extracting those three arms. The cleanest mechanical move that keeps Spec 3 able to dissolve `PointOfInterest`: define `StructureRecord` as its own type now and have `PointOfInterest`'s structure arms reference it, so there is one source of truth for the structure shape. `StructureCategory` is the structure-only discriminant (`PoiCategory` minus `'famousGalaxy'`).

**Files:**
- Create: `src/@types/engine/data/StructureCategory.d.ts`
- Create: `src/@types/engine/data/StructureGroupId.d.ts`
- Create: `src/@types/engine/data/StructureRecord.d.ts`
- Test: `tests/@types/engine/data/structureRecord.types.test.ts`

- [ ] **Step 1: Write the failing type-level test**

```ts
// tests/@types/engine/data/structureRecord.types.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';
import type { StructureCategory } from '../../../../src/@types/engine/data/StructureCategory';
import type { StructureGroupId } from '../../../../src/@types/engine/data/StructureGroupId';

describe('StructureRecord types', () => {
  it('a cluster record carries abell + radius and a structure category', () => {
    const rec: StructureRecord = {
      id: 'A1656', name: 'Coma', worldPos: [0, 0, 0],
      category: 'cluster', featured: true, physicalRadiusMpc: 2, abell: 'A1656',
    };
    expectTypeOf(rec.category).toMatchTypeOf<StructureCategory>();
  });
  it('StructureCategory excludes famousGalaxy', () => {
    expectTypeOf<StructureCategory>().toEqualTypeOf<'cluster' | 'supercluster' | 'void'>();
  });
  it('StructureGroupId is anchors | bulk', () => {
    expectTypeOf<StructureGroupId>().toEqualTypeOf<'anchors' | 'bulk'>();
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/@types/engine/data/structureRecord.types.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the three type files**

`StructureCategory.d.ts` exports `'cluster' | 'supercluster' | 'void'` with a docblock noting it is `PoiCategory` minus `'famousGalaxy'`. `StructureGroupId.d.ts` exports `'anchors' | 'bulk'` (docblock: spec renames `PoiGroupId`'s `staticAnchors`/`clusterBulk`; `famous` is dropped because famous is galaxy data). `StructureRecord.d.ts` defines the record by extracting the extended-structure arms; `worldPos` uses the `Vec3` alias (import from `src/@types/math/Vec3`). Mirror the field docs from `PointOfInterest.d.ts` (timeless, terse). Follow the convention rule from CLAUDE.md (`type` not `interface`).

- [ ] **Step 4: Run it, expect pass**

Run: `npm run test -- tests/@types/engine/data/structureRecord.types.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-point `PointOfInterest`'s structure arms at `StructureRecord` (single source of truth)**

In `src/@types/engine/subsystems/PointOfInterest.d.ts`, replace the inline `ClusterPoi | SuperclusterPoi | VoidPoi` arm definitions with a reference to `StructureRecord` (so `PointOfInterest = StructureRecord | FamousGalaxyPoi`). Verify `npm run typecheck` stays green — every existing `PointOfInterest` consumer must still narrow on `category` unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/data/StructureCategory.d.ts src/@types/engine/data/StructureGroupId.d.ts src/@types/engine/data/StructureRecord.d.ts src/@types/engine/subsystems/PointOfInterest.d.ts tests/@types/engine/data/structureRecord.types.test.ts
git commit -m "feat(engine): StructureRecord/Category/GroupId types extracted from PointOfInterest"
```

---

## Task 2: `galaxyStore` (rich)

**API (spec §galaxyStore):** `catalogs: ReadonlyMap<SourceType, GalaxyCatalog>`, `famousMeta: readonly FamousMetaEntry[]`, `setCatalog(s, c)`, `removeCatalog(s)`, `get(s)`, `setFamousMeta(m)`.

**Files:**
- Create: `src/@types/engine/data/GalaxyStore.d.ts`
- Create: `src/services/engine/data/createGalaxyStore.ts`
- Test: `tests/services/engine/data/createGalaxyStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/engine/data/createGalaxyStore.test.ts
import { describe, it, expect } from 'vitest';
import { createGalaxyStore } from '../../../../src/services/engine/data/createGalaxyStore';
import type { GalaxyCatalog } from '../../../../src/@types/data/GalaxyCatalog';

const fakeCatalog = (count: number) => ({ count } as unknown as GalaxyCatalog);

describe('createGalaxyStore', () => {
  it('starts empty', () => {
    const s = createGalaxyStore();
    expect(s.catalogs.size).toBe(0);
    expect(s.famousMeta).toEqual([]);
    expect(s.get('glade')).toBeUndefined();
  });
  it('setCatalog / get / removeCatalog round-trip', () => {
    const s = createGalaxyStore();
    const c = fakeCatalog(3);
    s.setCatalog('glade', c);
    expect(s.get('glade')).toBe(c);
    expect(s.catalogs.get('glade')).toBe(c);
    s.removeCatalog('glade');
    expect(s.get('glade')).toBeUndefined();
  });
  it('setFamousMeta replaces and exposes a readonly view', () => {
    const s = createGalaxyStore();
    s.setFamousMeta([{ id: 'm31' } as never]);
    expect(s.famousMeta.map((e) => e.id)).toEqual(['m31']);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/data/createGalaxyStore.test.ts`
Expected: FAIL — `createGalaxyStore` not found.

- [ ] **Step 3: Define the type, then the factory**

`GalaxyStore.d.ts`: the spec's exact shape, `catalogs` typed `ReadonlyMap`, `famousMeta` typed `readonly FamousMetaEntry[]` (import `SourceType`, `GalaxyCatalog`, `FamousMetaEntry` from their `@types` homes). `createGalaxyStore.ts`: a plain factory closing over a private `Map<SourceType, GalaxyCatalog>` and a private `FamousMetaEntry[]`; return a frozen object whose `catalogs` getter exposes the map (the `ReadonlyMap` type makes it read-only to consumers) and `famousMeta` getter exposes the array. Setters mutate the private state in place. Match the immutability-leaning convention: consumers get read-only views, mutation only via setters. Add a didactic module header explaining why a factory + closure (not a class) and why mutation is concentrated in the setters.

- [ ] **Step 4: Run it, expect pass**

Run: `npm run test -- tests/services/engine/data/createGalaxyStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/data/GalaxyStore.d.ts src/services/engine/data/createGalaxyStore.ts tests/services/engine/data/createGalaxyStore.test.ts
git commit -m "feat(engine): galaxyStore factory (catalogs + famousMeta)"
```

---

## Task 3: `structureStore` (rich)

**API (spec §structureStore):** keyed groups `setGroup(id, records)` / `clearGroup(id)` with `StructureGroupId = 'anchors' | 'bulk'`; `all()` (concatenated in `anchors` → `bulk` order — preserve the pick-index alignment contract); `byId(id)`; `byCategory(c)`; two independent visibility axes `markerVisible(c)` / `labelVisible(c)` / `setMarkerVisible(c, v)` / `setLabelVisible(c, v)`.

**Files:**
- Create: `src/@types/engine/data/StructureStore.d.ts`
- Create: `src/services/engine/data/createStructureStore.ts`
- Test: `tests/services/engine/data/createStructureStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/engine/data/createStructureStore.test.ts
import { describe, it, expect } from 'vitest';
import { createStructureStore } from '../../../../src/services/engine/data/createStructureStore';
import type { StructureRecord } from '../../../../src/@types/engine/data/StructureRecord';

const rec = (id: string, category: StructureRecord['category'] = 'cluster'): StructureRecord =>
  ({ id, name: id, worldPos: [0, 0, 0], category, featured: true, physicalRadiusMpc: 1 });

describe('createStructureStore', () => {
  it('all() concatenates anchors before bulk, preserving within-group order', () => {
    const s = createStructureStore();
    s.setGroup('bulk', [rec('b1'), rec('b2')]);
    s.setGroup('anchors', [rec('a1')]);
    expect(s.all().map((r) => r.id)).toEqual(['a1', 'b1', 'b2']);
  });
  it('setGroup replaces only its own group', () => {
    const s = createStructureStore();
    s.setGroup('anchors', [rec('a1')]);
    s.setGroup('bulk', [rec('b1')]);
    s.setGroup('anchors', [rec('a2')]);
    expect(s.all().map((r) => r.id)).toEqual(['a2', 'b1']);
  });
  it('clearGroup drops only its group', () => {
    const s = createStructureStore();
    s.setGroup('anchors', [rec('a1')]);
    s.setGroup('bulk', [rec('b1')]);
    s.clearGroup('bulk');
    expect(s.all().map((r) => r.id)).toEqual(['a1']);
  });
  it('byId and byCategory resolve across groups in all() order', () => {
    const s = createStructureStore();
    s.setGroup('anchors', [rec('a1', 'cluster')]);
    s.setGroup('bulk', [rec('b1', 'cluster'), rec('v1', 'void')]);
    expect(s.byId('b1')?.id).toBe('b1');
    expect(s.byId('nope')).toBeNull();
    expect(s.byCategory('cluster').map((r) => r.id)).toEqual(['a1', 'b1']);
  });
  it('marker and label visibility are independent per category, default true', () => {
    const s = createStructureStore();
    expect(s.markerVisible('cluster')).toBe(true);
    expect(s.labelVisible('cluster')).toBe(true);
    s.setMarkerVisible('cluster', false);
    expect(s.markerVisible('cluster')).toBe(false);
    expect(s.labelVisible('cluster')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/data/createStructureStore.test.ts`
Expected: FAIL — `createStructureStore` not found.

- [ ] **Step 3: Define the type, then the factory**

`StructureStore.d.ts`: the spec's exact API; `all()`/`byCategory()` return `readonly StructureRecord[]`. `createStructureStore.ts`: close over a `Map<StructureGroupId, readonly StructureRecord[]>` and two `Map<StructureCategory, boolean>` visibility records (default true). `all()` concatenates groups in fixed `['anchors','bulk']` order — document that this preserves the ring pick-path's `instance_index → getPoisForCategory` alignment (carried over from `PoiGroupId`'s ordering contract). `byId` linear-scans `all()`; `byCategory` filters `all()`. `setGroup` takes a defensive copy (callers may mutate their array afterward — same contract as today's `poiSubsystem.setGroup`).

- [ ] **Step 4: Run it, expect pass**

Run: `npm run test -- tests/services/engine/data/createStructureStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/data/StructureStore.d.ts src/services/engine/data/createStructureStore.ts tests/services/engine/data/createStructureStore.test.ts
git commit -m "feat(engine): structureStore factory (groups + visibility axes)"
```

---

## Task 4: `volumeStore` (thin)

**API (spec §volumeStore):** `fields: ReadonlyMap<VolumeFieldId, VolumeFieldParams>`, `registered(): readonly VolumeFieldId[]`, `params(id)`, `setParams(id, p)`. (Voxel cubes stay on `scalarVolumeRenderer`; the store tracks which fields exist + their params.) `VolumeFieldParams` is the relocated `VolumeFieldSettings` — see Decision B.

**Files:**
- Create: `src/@types/engine/data/VolumeStore.d.ts`
- Create: `src/@types/engine/data/VolumeFieldParams.d.ts` (re-export or relocate `VolumeFieldSettings`; resolve under Decision B)
- Create: `src/services/engine/data/createVolumeStore.ts`
- Test: `tests/services/engine/data/createVolumeStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/engine/data/createVolumeStore.test.ts
import { describe, it, expect } from 'vitest';
import { createVolumeStore } from '../../../../src/services/engine/data/createVolumeStore';
import type { VolumeFieldParams } from '../../../../src/@types/engine/data/VolumeFieldParams';

const params = (over: Partial<VolumeFieldParams> = {}): VolumeFieldParams =>
  ({ enabled: false, intensity: 1, contrast: 1, densityScale: 1, paletteId: 'viridis', trim: 0, exposure: 1, ...over } as VolumeFieldParams);

describe('createVolumeStore', () => {
  it('starts with no registered fields', () => {
    const s = createVolumeStore();
    expect(s.registered()).toEqual([]);
    expect(s.params('rhizome')).toBeUndefined();
  });
  it('setParams registers + stores; params reads back', () => {
    const s = createVolumeStore();
    s.setParams('rhizome', params({ enabled: true }));
    expect(s.registered()).toEqual(['rhizome']);
    expect(s.params('rhizome')?.enabled).toBe(true);
    expect(s.fields.get('rhizome')?.enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/data/createVolumeStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Define types + factory**

Resolve Decision B first. If relocate: create `VolumeFieldParams.d.ts` with the `VolumeFieldSettings` shape (move the type, update the ~3 importers, keep the field docs), then delete `VolumeFieldSettings.d.ts`. `VolumeStore.d.ts`: spec API; `fields` typed `ReadonlyMap<VolumeFieldId, VolumeFieldParams>`. `createVolumeStore.ts`: close over a `Map<VolumeFieldId, VolumeFieldParams>`; `registered()` returns `[...map.keys()]`; `setParams` sets in place. Confirm `VolumeFieldId` already exists in `@types` and reuse it.

- [ ] **Step 4: Run it, expect pass**

Run: `npm run test -- tests/services/engine/data/createVolumeStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/data/VolumeStore.d.ts src/@types/engine/data/VolumeFieldParams.d.ts src/services/engine/data/createVolumeStore.ts tests/services/engine/data/createVolumeStore.test.ts
git commit -m "feat(engine): volumeStore factory (registered fields + params)"
```

---

## Task 5: `filamentStore` (thin)

**API (spec §filamentStore):** `loaded: boolean`, `stripCount: number`, `vertexCount: number`, `setLoaded(stripCount, vertexCount)`. (Geometry stays on `filamentRenderer`; the store tracks status.)

**Files:**
- Create: `src/@types/engine/data/FilamentStore.d.ts`
- Create: `src/services/engine/data/createFilamentStore.ts`
- Test: `tests/services/engine/data/createFilamentStore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/engine/data/createFilamentStore.test.ts
import { describe, it, expect } from 'vitest';
import { createFilamentStore } from '../../../../src/services/engine/data/createFilamentStore';

describe('createFilamentStore', () => {
  it('starts not-loaded with zero counts', () => {
    const s = createFilamentStore();
    expect(s.loaded).toBe(false);
    expect(s.stripCount).toBe(0);
    expect(s.vertexCount).toBe(0);
  });
  it('setLoaded flips loaded and records counts', () => {
    const s = createFilamentStore();
    s.setLoaded(12, 3400);
    expect(s.loaded).toBe(true);
    expect(s.stripCount).toBe(12);
    expect(s.vertexCount).toBe(3400);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/data/createFilamentStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Define type + factory**

`FilamentStore.d.ts`: spec API. `createFilamentStore.ts`: close over `loaded`/`stripCount`/`vertexCount` (getters); `setLoaded(strip, vert)` sets all three (`loaded = true`).

- [ ] **Step 4: Run it, expect pass**

Run: `npm run test -- tests/services/engine/data/createFilamentStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/data/FilamentStore.d.ts src/services/engine/data/createFilamentStore.ts tests/services/engine/data/createFilamentStore.test.ts
git commit -m "feat(engine): filamentStore factory (status + counts)"
```

---

## Task 6: `EngineData` bag + wire into `EngineState` + construct

**Files:**
- Create: `src/@types/engine/data/EngineData.d.ts`
- Create: `src/services/engine/data/createEngineData.ts`
- Modify: `src/@types/engine/state/EngineState.d.ts:88-114`
- Modify: `src/services/engine/engine.ts:299`
- Test: `tests/services/engine/data/createEngineData.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/services/engine/data/createEngineData.test.ts
import { describe, it, expect } from 'vitest';
import { createEngineData } from '../../../../src/services/engine/data/createEngineData';

describe('createEngineData', () => {
  it('assembles the four empty stores', () => {
    const d = createEngineData();
    expect(d.galaxies.catalogs.size).toBe(0);
    expect(d.structures.all()).toEqual([]);
    expect(d.volumes.registered()).toEqual([]);
    expect(d.filaments.loaded).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/data/createEngineData.test.ts`
Expected: FAIL.

- [ ] **Step 3: Define `EngineData`, factory, wire into state**

`EngineData.d.ts`: `{ galaxies: GalaxyStore; structures: StructureStore; volumes: VolumeStore; filaments: FilamentStore }`. `createEngineData.ts`: calls the four factories. In `EngineState.d.ts`, add `data: EngineData;` to the `EngineState` type and update the module-header bullet list to include `state.data — per-type data stores`. In `engine.ts:299`, add `data: createEngineData(),` to the `const state: EngineState = { … }` literal.

- [ ] **Step 4: Run it, expect pass; typecheck still green**

Run: `npm run test -- tests/services/engine/data/createEngineData.test.ts && npm run typecheck`
Expected: test PASS; typecheck PASS (the old `sources.*` fields are still present, so nothing breaks yet).

- [ ] **Step 5: Commit**

```bash
git add src/@types/engine/data/EngineData.d.ts src/services/engine/data/createEngineData.ts src/@types/engine/state/EngineState.d.ts src/services/engine/engine.ts tests/services/engine/data/createEngineData.test.ts
git commit -m "feat(engine): EngineData bag wired into EngineState"
```

---

## Task 7: Migrate galaxy catalogs (`sources.catalogs` → `galaxyStore`)

Migrate the single writer + all readers, then remove `catalogs` from `EngineSourceState`.

**Files (writer):** `galaxyCatalogSourceRegistry.ts:187`.
**Files (readers):** `clusterMembership.ts`, `engine.ts`, `runFrame.ts`, `selectionRingPass.ts`, `diskRadiusRingPass.ts`, `galaxyCatalogSourceRegistry.ts`, `wirePoiProjection.ts`, `wireInput.ts`, plus types `BiasCorrectionDeps.d.ts`, `SelectionSubsystem.d.ts`.
**Files (state):** `EngineSourceState.d.ts:58`.

- [ ] **Step 1: Update the writer**

`galaxyCatalogSourceRegistry.ts:187` → `state.data.galaxies.setCatalog(source, cloud)`.

- [ ] **Step 2: Update every reader**

Replace each `state.sources.catalogs.get(s)` → `state.data.galaxies.get(s)`, `state.sources.catalogs` (iteration) → `state.data.galaxies.catalogs`. Where a type (`BiasCorrectionDeps`, `SelectionSubsystem`) declares `catalogs: Map<…>`, retype it `ReadonlyMap<…>` from the store or accept the `GalaxyStore` itself — follow whichever keeps the dep surface minimal.

- [ ] **Step 3: Remove `catalogs` from `EngineSourceState` and typecheck**

Delete `catalogs` (line 58) + its docblock from `EngineSourceState.d.ts`. Run `npm run typecheck` — it must surface any reader you missed (this is the safety net). Fix until green.

- [ ] **Step 4: Run the full suite**

Run: `npm run test && npm run typecheck`
Expected: PASS (behaviour parity — pick/hover/framing tests exercise these readers).

- [ ] **Step 5: Commit**

```bash
git add -p   # stage only the touched files listed above (NEVER git add -A)
git commit -m "refactor(engine): galaxy catalogs read from galaxyStore"
```

---

## Task 8: Migrate `famousMeta` (`sources.famousMeta` → `galaxyStore`)

**Files (writer):** `famousMetaSlot.ts:32,39`.
**Files (readers):** `engine.ts`, `runFrame.ts`, `diskRadiusRingPass.ts`, `wirePoiProjection.ts`, `buildPoisFromFamousMeta.ts`, `wireInput.ts`, plus type `EngineAssetSlots.d.ts`.
**Files (state):** `EngineSourceState.d.ts:59`.

- [ ] **Step 1: Update the writer**

`famousMetaSlot.ts:32` → `state.data.galaxies.setFamousMeta(s.value.meta)`; `:39` → `state.data.galaxies.setFamousMeta([])`.

- [ ] **Step 2: Update readers**

Replace `state.sources.famousMeta` → `state.data.galaxies.famousMeta` at each reader. `buildPoisFromFamousMeta.ts` keeps building the `famous` POI group (Spec 3 evicts it later) but now reads `famousMeta` from `galaxyStore`.

- [ ] **Step 3: Remove `famousMeta` from `EngineSourceState`; typecheck**

Delete `famousMeta` (line 59) + docblock. `npm run typecheck` until green.

- [ ] **Step 4: Run the full suite**

Run: `npm run test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(engine): famousMeta read from galaxyStore"
```

---

## Task 9: Migrate structures (`sources.clusterBulk` + anchors → `structureStore`)

**Gated by Decision A.** Tasks below assume the default (structureStore authoritative; feeds the untouched `poiSubsystem`).

**Files (writer):** `clusterCatalogSlot.ts:39,43` (bulk group); the static-anchor build site (currently in the wiring that calls `poiSubsystem.setGroup('staticAnchors', …)` — locate via `buildStaticAnchorPois` / `wirePoiProjection.ts`).
**Files (readers / feeders):** `wirePoiProjection.ts` (feeds `poiSubsystem` groups from the store; click resolver / camera focus / membership read the store), `clusterMembership.ts` if it reads structure extent.
**Files (state):** `EngineSourceState.d.ts:60-66` (remove `clusterBulk`).

- [x] **Step 1: Failing integration test for the feed**

Add a test under `tests/services/engine/wiring/` asserting that after the cluster-catalog slot commits a payload, `structureStore.byCategory('cluster')` returns the decoded bulk records AND `poiSubsystem.getPoisForCategory('cluster')` still returns the same set in the same order (pick-index alignment preserved). Use the existing cluster-catalog fixture from `tests/services/loading/slots`.

- [x] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/wiring/`
Expected: FAIL — store is empty / not fed.

- [x] **Step 3: Convert the `ClusterCatalogPayload` into `StructureRecord[]` and write to the store**

`clusterCatalogSlot.ts:39` → map the payload's bulk entries to `StructureRecord` and `state.data.structures.setGroup('bulk', records)`; `:43` → `state.data.structures.clearGroup('bulk')`. Move the static-anchor records to `state.data.structures.setGroup('anchors', …)`. Then feed `poiSubsystem` from the store (`setGroup('clusterBulk', store.byCategory(...))` etc.) at the existing wiring site, keeping the merged order identical.

- [x] **Step 4: Migrate non-producer readers**

Camera-focus tween, membership search, and the click/`findPoi` resolver for structures read `structureStore.byId` / `byCategory` instead of `sources.clusterBulk` / the poi list. Remove `clusterBulk` from `EngineSourceState`. `npm run typecheck` until green.

> **Deviation (deferred to Spec 3):** `clusterBulk` was removed from `EngineSourceState` (no reader of the forbidden path remains). However, the camera-focus / membership / `findPoi` resolvers were NOT repointed at `structureStore` — they resolve via `poiSubsystem.findPoi`, which intentionally resolves BOTH structures AND famous galaxies through one table. Splitting that resolution so structures come from `structureStore` while famous keeps coming from `poiSubsystem` is exactly the producer/presentation realignment Spec 3 owns. Doing it here would either break famous-galaxy click resolution or require dual-store lookups that Spec 3 will immediately rework. Since `poiSubsystem` is still fed the identical records (behaviour parity preserved) and no consumer reads the removed `sources.clusterBulk`, deferring is the correct minimal-blast-radius call.

- [x] **Step 5: Run the full suite**

Run: `npm run test && npm run typecheck`
Expected: PASS (the pick-index-alignment test in `poiSubsystem.test.ts` is the key guard).

- [x] **Step 6: Commit**

```bash
git commit -m "refactor(engine): structures owned by structureStore, feeding poiSubsystem"
```

---

## Task 10: Migrate volume field params (`settings.volumes.fields` → `volumeStore`)

**Gated by Decision B.** Tasks below assume the default (relocate to `volumeStore`; `DemandCtx` gains a `volumeField` accessor).

**Files (writers):** `cf4DensitySlot.ts:48-51`, `mcpmSlot.ts:40-43`, `syntheticVolumeSlots.ts:95-98`, `engine.ts:915-1049` (the per-field setters + add/remove).
**Files (readers):** `runFrame.ts`, `encodeHdrSingle.ts`, `encodeHdrSplit.ts`, `assetWiring.ts:151,160`, `volumeUpsamplePass.ts`, `registerOverlayFades.ts`, `buildVolumeFieldsSnapshot.ts`.
**Files (contract):** `DemandCtx.d.ts` (+ its builder), `volumeFieldDefaults.ts` (seeding).
**Files (state):** `EngineSettingsState` (remove `volumes.fields`).

- [x] **Step 1: Failing test for the demand accessor**

Add a test asserting the `DemandCtx` built from a state whose `volumeStore` has `rhizome` enabled returns `ctx.volumeField('rhizome')?.enabled === true`, and that the MCPM/CF4 wiring `demand` predicate (`assetWiring.ts`) fires off the store, not `ctx.settings`.

- [x] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/engine/wiring/`
Expected: FAIL.

- [x] **Step 3: Add the `DemandCtx` surface + migrate writers/readers**

Add `volumeField: (id: VolumeFieldId) => VolumeFieldParams | undefined` to `DemandCtx.d.ts` and its builder (sourced from `state.data.volumes`). Repoint the volume slot commits + `engine.ts` setters to `state.data.volumes.setParams(id, …)` / `params(id)`. Repoint each reader (`buildVolumeFieldsSnapshot`, `runFrame`, `encodeHdr*`, `volumeUpsamplePass`, `registerOverlayFades`, `assetWiring` predicates) to the store. Move the construction-time seeding (`volumeFieldDefaults.ts` → today seeds `settings.volumes.fields`) to seed `volumeStore` — preserving the spec-noted invariant that volume fields seed at construction from `SOURCE_REGISTRY` (see memory `project_volume_field_seeding`). Remove `volumes.fields` from `EngineSettingsState`.

> **Notes on the as-built result:**
> - **`VolumeFieldParams` rename not done** (Decision B was already settled to keep the `VolumeFieldSettings` name in Task 4). The accessor returns `VolumeFieldSettings | undefined`.
> - **Readers were narrower than the plan feared.** `runFrame` / `encodeHdr*` / `volumeUpsamplePass` / `registerOverlayFades` don't read `settings.volumes.fields` directly — they consume the derived `buildVolumeFieldsSnapshot`, so repointing that one helper covered them all. The only direct readers were `assetWiring` predicates + `buildVolumeFieldsSnapshot`.
> - **Seeding** lives in `engine.ts` construction (right after the state literal) iterating `seedVolumeFields()` into `state.data.volumes.setParams(...)` — keeps `createEngineData`/`createVolumeStore` empty-by-default (their Task 4/6 tests still pass) while satisfying the seed-at-construction invariant.
> - **`volumeStore` gained a `remove(id)`** method (parity with the old `delete settings.volumes.fields[id]` in `removeVolumeField`); per-knob `engine.ts` setters use copy-on-write (`setParams(id, { ...cur, knob })`) so mutation stays on the store's setter seam.

- [x] **Step 4: Run the full suite**

Run: `npm run test && npm run typecheck`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git commit -m "refactor(engine): volume field params owned by volumeStore"
```

---

## Task 11: Migrate filament status → `filamentStore`

Today the spec notes filament counts are "transient" (nowhere durable). Find the filament slot commit (`src/services/loading/slots/` filament/skeleton slot) and the status UI reader.

**Files (writer):** the filament/skeleton slot commit.
**Files (reader):** filament status UI (StatusBar or the filament settings row).

- [ ] **Step 1: Failing test**

Add a test asserting that after the filament slot commits, `state.data.filaments.loaded === true` with the decoded strip/vertex counts.

- [ ] **Step 2: Run it, expect failure**

Run: `npm run test -- tests/services/loading/slots/`
Expected: FAIL.

- [ ] **Step 3: Write to + read from the store**

On filament slot commit, call `state.data.filaments.setLoaded(stripCount, vertexCount)`. Point the status reader at `state.data.filaments`.

- [ ] **Step 4: Run the full suite**

Run: `npm run test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(engine): filament status tracked in filamentStore"
```

---

## Task 12: Migration-safety sweep test

The spec calls for a greppable forbidden-path assertion that no code still reads the old locations.

**Files:**
- Create: `tests/services/engine/data/forbiddenPaths.test.ts`

- [ ] **Step 1: Write the sweep test**

```ts
// tests/services/engine/data/forbiddenPaths.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = [
  'sources.catalogs',
  'sources.famousMeta',
  'sources.clusterBulk',
  'settings.volumes.fields',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

describe('no consumer reads the pre-store data locations', () => {
  it.each(FORBIDDEN)('"%s" appears nowhere under src/', (needle) => {
    const offenders = walk('src')
      .filter((f) => !f.endsWith('.d.ts')) // type homes may keep historical doc refs
      .filter((f) => readFileSync(f, 'utf8').includes(needle));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test -- tests/services/engine/data/forbiddenPaths.test.ts`
Expected: PASS if Tasks 7–11 are complete. If it fails, the offender list names the file to fix.

- [ ] **Step 3: Commit**

```bash
git add tests/services/engine/data/forbiddenPaths.test.ts
git commit -m "test(engine): forbid reads of pre-store data locations"
```

---

## Task 13: Behaviour-parity gate

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npm run test && npm run typecheck && npm run build`
Expected: all green; 590+ tests still pass.

- [ ] **Step 2: Manual smoke (dev server)**

Ask the user to confirm in the running dev server: survey toggle, cluster marker + label visibility, famous-galaxy InfoCard text, volume field sliders, filament status — all behave exactly as before. (This is a no-behaviour-change refactor; the visible result is "nothing changed.")

- [ ] **Step 3: Update the backlog**

In `docs/BACKLOG.md`, the "Specs awaiting plans" entry for Engine data stores now has a plan — leave the spec where it is (it moves to `completed/` with the plan once shipped, per the backlog process). Add nothing new; `/feature-done` handles the move.

---

## Self-review notes

- **Spec coverage:** every store (§galaxyStore/structureStore/volumeStore/filamentStore) → Tasks 2–5; every migration-map row → Tasks 7–11; the sweep test → Task 12; behaviour parity → Task 13. The `tier`/`drawMask` stay-put boundary is respected (only `catalogs`/`famousMeta`/`clusterBulk` are removed from `EngineSourceState`).
- **Out of scope (honoured):** producer split + famous-label eviction (Spec 3); construction purity (Spec 1, landed); deep-`readonly` EngineState + typed setters (parked own spec). Task 8 deliberately keeps `buildPoisFromFamousMeta` producing the `famous` group — it just reads from `galaxyStore`.
- **Type consistency:** `StructureRecord`/`StructureCategory`/`StructureGroupId` defined in Task 1 and used unchanged in Task 3 + Task 9; `VolumeFieldParams` defined in Task 4 and used in Task 10; `GalaxyStore`/`StructureStore`/`VolumeStore`/`FilamentStore` defined in Tasks 2–5 and assembled in Task 6.
- **Open risks flagged to the user:** Decisions A and B at the top. Both have executable defaults but change Task 9 / Task 10 shape if the user picks the alternative.
