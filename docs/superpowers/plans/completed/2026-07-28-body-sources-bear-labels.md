# Body sources bear labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `famousStar`, `earth`, `planet`, and a new `sun` row honest `bearsLabel: true` source entries, so their label gates live beside every other label-bearing source instead of exiled in the cross-cutting `labels` cluster.

**Architecture:** The `SOURCE_REGISTRY` already models "this source bears labels, on this layer, with this display text" — four rows flip the flag and fill the fields, and `LABEL_CATEGORIES` / `LabelCategory` / `CATEGORY_DISPLAY_INFO` widen 6 → 10 with no edit. `famousStar` becomes a `starCatalogs.items` row (the mirror of `famousGalaxy`); `earth` / `planet` / `sun` become a new `bodies.items` cluster, the fifth source-type cluster. One prep refactor replaces two hardcoded routing chains with a table keyed on `SOURCE_REGISTRY[cat].type`.

**Tech Stack:** TypeScript, Redux Toolkit + redux-saga, React (presentational + container split), Vitest.

## Global Constraints

Copied verbatim from the spec and CLAUDE.md. Every task's requirements implicitly include this section.

- **`type` aliases, never `interface`** — `export type X = { ... }` for all TS shapes.
- **One symbol per file in `src/utils/` and `src/@types/`** — every `@types/` file exports exactly ONE type; filename = the exported symbol's name. Deep relative imports, no barrels.
- **No barrel exports for components** — import React components directly from their `.tsx`.
- **Didactic comments** — explain _why_ and _what the alternative was_. Timeless: no dates, no PR references, no "previously this was X". Match the multi-paragraph module-header style already in these files.
- **Presentational components import nothing from `store/` or `state/`** — all store reach lives in the paired `containers/<Name>Container.tsx`, which is `memo`'d and uses `useCallback(..., [dispatch])`.
- **File moves/renames go through `npm run move-files`**, never `git mv` + hand-edited imports.
- **`Source` enum codes are append-only BY VALUE.** Never renumber. `Constellations: 25` is the current highest, so the Sun takes **26** (see "Corrections to the spec" below — the spec says 25, which is now taken).
- **Test what can break** — no runtime type tests, no constant/registry restatements, no mirror tests. See `docs/superpowers/conventions/testing.md`.
- **Verification gate at every task boundary:** `npm test` green AND `npm run typecheck` clean. The slices are vertical — no task may leave a field half-migrated.
- **Never `git add -A` / `git add .`** — stage specific paths. Format only touched files.

## Corrections to the spec

Four things the spec (`docs/superpowers/specs/2026-07-28-body-sources-bear-labels.md`) did not account for, found while grounding this plan against the code. Each is handled in the task noted.

1. **`Source.Sun` is 26, not 25.** The spec says "`Sun: 25` follows `GaiaStars: 24`", but `Constellations: 25` already exists (`src/data/source.ts:190`) — it landed after the grill. Codes are append-only by value, so the Sun takes 26. → Task 5.

2. **`StarCatalogSourceEntry` must become a union.** It requires `binBaseName: string`, `tiered`, `drawBudget`, and `crossfadePc` (`src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts:22-29`) — `famousStar` has none of them (it is a seeded body map, not a `.bin`). Retyping `famousStar` to `type: 'starCatalog'` therefore needs the entry type split into a survey variant and a seeded variant, discriminated by `binBaseName: string | null`. This mirrors `VolumeSourceEntry`, which already uses `binBaseName: null` for its runtime-generated debug fixtures. → Task 3.

3. **`assetWiring`'s `STAR_CATALOG_SOURCES` would try to fetch a non-existent `.bin`.** It derives from `SOURCE_ENTRIES.filter(e => e.type === 'starCatalog')` (`src/services/engine/wiring/assetWiring.ts:140-142`), so `famousStar` would gain a demand row and the fetcher would request `undefined-<tier>.bin`. The filter must narrow to `binBaseName !== null`. → Task 3.

4. **`LabelHome.read` cannot take `EngineSettingsState`.** The spec's contract is `read: (settings: EngineSettingsState, id) => boolean`, but `projectLabelCategoryVisibility`'s docblock (`src/state/settings/projectLabelCategoryVisibility.ts:29-37`) explains that it takes the individual cluster records precisely so the container's `useMemo` rebuilds only when a stable reference changes. `state.settings` gets a new identity on EVERY settings write under Immer, so reading through it would re-render the Labels section on every unrelated slider drag. This plan uses a `LabelHomes` bundle of the five authoritative homes instead, preserving that stability. → Task 1.

One deliberate behaviour change, already approved in the grill (D5/D6) and repeated here so no reviewer flags it as a regression: **turning off "Famous Stars" no longer mutes the Sun's caption.** The Sun gets its own row; its caption follows `bodies.items.sun.labelEnabled`.

---

## File Structure

**Created:**

| File                                                            | Responsibility                                         |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `src/@types/settings/LabelHomes.d.ts`                           | The five authoritative label-visibility homes, bundled |
| `src/@types/settings/LabelHome.d.ts`                            | One source type's label read/write pair                |
| `src/data/labels/labelHomeBySourceType.ts`                      | `LABEL_HOME_BY_SOURCE_TYPE` — the dispatch table       |
| `src/@types/data/LabelBearingSourceType.d.ts`                   | The registry types that can bear labels                |
| `src/@types/data/starCatalog/SurveyStarCatalogSourceEntry.d.ts` | Star catalog that ships a `.bin`                       |
| `src/@types/data/starCatalog/SeededStarCatalogSourceEntry.d.ts` | Star catalog seeded from the body store                |
| `src/@types/data/body/BodySourceEntry.d.ts`                     | `type: 'body'` registry row                            |
| `src/@types/data/body/BodyId.d.ts`                              | `Extract<AnyEntry, { type: 'body' }>['id']`            |
| `src/@types/settings/BodyItemSettings.d.ts`                     | `DataItemSettings & { labelEnabled }`                  |
| `src/data/bodies/bodyIds.ts`                                    | `BODY_IDS` runtime companion                           |
| `src/data/sources/sun.ts`                                       | `SUN_ENTRY`                                            |
| `src/@types/components/SectionRow.d.ts`                         | The panel's one uniform row shape                      |

**Deleted:** `src/@types/data/body/FamousStarSourceEntry.d.ts`, `EarthSourceEntry.d.ts`, `PlanetSourceEntry.d.ts`.

**Modified (principal):** `src/data/source.ts`, `src/data/sources.ts`, `src/data/sources/{famous-star,earth,planet}.ts`, `src/@types/data/SourceEntry.d.ts`, `src/@types/data/SourceEntryBase.d.ts`, `src/@types/animation/{LabelLayerId,CategoryLabelLayer,FadeId,VisibilityLayerKey}.d.ts`, `src/@types/settings/{EngineSettingsState,LabelSettings}.d.ts`, `src/state/settings/{initialState,settingsSlice,selectors,projectLabelCategoryVisibility}.ts`, `src/services/engine/wiring/{fadeLayers,assetWiring}.ts`, `src/services/animation/visibilityActionRow.ts`, `src/store/effects/watchFadesSaga.ts`, `src/services/engine/frame/{visibleStars,passes/foregroundLabelsLayer}.ts`, `src/components/SettingsPanel/{LabelsAndGuidesSection,StarsSection}.tsx`, `src/components/containers/{LabelsAndGuidesSectionContainer,StarsSectionContainer}.tsx`, `src/@types/engine/settings/SettingsSnapshot.d.ts`, `src/state/tour/captureSettings.ts`.

---

### Task 1: Prep — type-keyed label dispatch table

Replaces two hardcoded routing chains (the read chain in `projectLabelCategoryVisibility`, the write chain in `LabelsAndGuidesSectionContainer`) with one table keyed on `SOURCE_REGISTRY[cat].type`. **Behaviour-identical** — the table has exactly the three source types that bear labels today. This is the prep commit; it lands before any feature commit.

**Files:**

- Create: `src/@types/settings/LabelHomes.d.ts`
- Create: `src/@types/settings/LabelHome.d.ts`
- Create: `src/@types/data/LabelBearingSourceType.d.ts`
- Create: `src/data/labels/labelHomeBySourceType.ts`
- Modify: `src/state/settings/projectLabelCategoryVisibility.ts` (whole file)
- Modify: `src/components/containers/LabelsAndGuidesSectionContainer.tsx:88-102`
- Test: `tests/data/labels/labelHomeBySourceType.test.ts` (create)

**Interfaces:**

- Consumes: `LabelCategory`, `SOURCE_REGISTRY`, the settings slice's three label setters.
- Produces:
  - `type LabelHomes` — `{ structures, galaxyCatalogs, milkyWayLabelEnabled }` today; Tasks 3–4 add `starCatalogs` and `bodies`.
  - `type LabelHome = { read: (homes: LabelHomes, id: LabelCategory) => boolean; write: (id: LabelCategory, enabled: boolean) => Action }`
  - `type LabelBearingSourceType` — `'structure' | 'galaxyCatalog' | 'milkyWay'` today; Tasks 3–4 add `'starCatalog'` and `'body'`.
  - `const LABEL_HOME_BY_SOURCE_TYPE: Record<LabelBearingSourceType, LabelHome>`
  - `projectLabelCategoryVisibility(homes: LabelHomes): Record<LabelCategory, boolean>` — **signature change** from three positional args to one bundle.

- [x] **Step 1: Write the failing test**

`tests/data/labels/labelHomeBySourceType.test.ts`:

```ts
/**
 * The dispatch table's whole contract: for a category of each label-bearing
 * source type, the `write` action's payload lands where `read` looks. A
 * miswired row (reading `structures` but writing the galaxy-catalog setter)
 * would leave a checkbox that visibly refuses to flip — this is the test that
 * catches it, and no compiler check can.
 */
import { describe, it, expect } from 'vitest';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../../src/data/labels/labelHomeBySourceType';
import { SOURCE_REGISTRY } from '../../../src/data/sources';
import { LABEL_CATEGORIES } from '../../../src/data/structure/labelCategories';
import { settingsReducer, type SettingsState } from '../../../src/state/settings/settingsSlice';
import { initialSettingsState } from '../../../src/state/settings/initialState';
import type { LabelCategory } from '../../../src/@types/engine/data/LabelCategory';
import type { LabelHomes } from '../../../src/@types/settings/LabelHomes';

function homesOf(settings: SettingsState): LabelHomes {
  return {
    structures: settings.structures.items,
    galaxyCatalogs: settings.galaxyCatalogs.items,
    milkyWayLabelEnabled: settings.milkyWay.labelEnabled,
  };
}

function homeFor(cat: LabelCategory) {
  const entry = Object.values(SOURCE_REGISTRY).find((e) => e.id === cat)!;
  return LABEL_HOME_BY_SOURCE_TYPE[entry.type as keyof typeof LABEL_HOME_BY_SOURCE_TYPE];
}

describe('LABEL_HOME_BY_SOURCE_TYPE', () => {
  it('round-trips read-after-write for every label-bearing category', () => {
    for (const cat of LABEL_CATEGORIES) {
      const home = homeFor(cat);
      expect(home, `no label home for '${cat}'`).toBeDefined();

      const off = settingsReducer(initialSettingsState(), home.write(cat, false));
      expect(home.read(homesOf(off), cat), `'${cat}' should read false`).toBe(false);

      const on = settingsReducer(off, home.write(cat, true));
      expect(home.read(homesOf(on), cat), `'${cat}' should read true`).toBe(true);
    }
  });
});
```

Adjust the `settingsReducer` / `initialSettingsState` import names to whatever `src/state/settings/settingsSlice.ts` and `initialState.ts` actually export — read those two files first and match. If the slice exports only the configured `settingsSlice`, use `settingsSlice.reducer` and `settingsSlice.getInitialState()`.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/labels/labelHomeBySourceType.test.ts`
Expected: FAIL — "Failed to resolve import ... labelHomeBySourceType".

- [x] **Step 3: Create the three types**

`src/@types/data/LabelBearingSourceType.d.ts`:

```ts
/**
 * LabelBearingSourceType — the `SOURCE_REGISTRY` types whose rows can carry
 * `bearsLabel: true`.
 *
 * A hand-curated subset of `SourceEntry['type']` rather than a derivation,
 * because the derivation would have to run over the registry VALUES (which
 * types can't see) — `bearsLabel` is a per-row flag, not a per-type one. The
 * pairing is enforced instead by `LABEL_HOME_BY_SOURCE_TYPE` being a total
 * `Record` over this union: a new label-bearing type fails the build until it
 * gets a home.
 *
 * `milkyWay` is a member in its own right, not an escape hatch — its label is
 * produced by the Milky-Way registry row like any other category. It differs
 * only in WHERE its bit is stored (a singleton scalar, no `items` record),
 * which is exactly what its `LabelHome` row encapsulates.
 */
export type LabelBearingSourceType = 'structure' | 'galaxyCatalog' | 'milkyWay';
```

`src/@types/settings/LabelHomes.d.ts`:

```ts
/**
 * LabelHomes — the authoritative homes of per-category label visibility,
 * bundled for the projection and the dispatch table.
 *
 * Label visibility is not stored in one place: each label-bearing source type
 * keeps its bit beside that source's OTHER visibility axis, so a reader walks
 * one item row to learn everything about a category. This bundle gathers those
 * homes without flattening them into a fourth stored copy that could drift.
 *
 * ### Why these fields and not `EngineSettingsState`
 *
 * Under Immer, `state.settings` gets a fresh identity on EVERY settings write,
 * so a projection keyed off the whole bag would rebuild — and re-render the
 * Labels section — on an unrelated slider drag. Each field here is the exact
 * stable reference a selector returns, so the container's `useMemo` rebuilds
 * only when a label home actually changes.
 */

import type { StructureId } from '../data/structure/StructureId';
import type { GalaxyCatalogId } from '../data/galaxyCatalog/GalaxyCatalogId';
import type { StructureItemSettings } from './StructureItemSettings';
import type { GalaxyCatalogItemSettings } from './GalaxyCatalogItemSettings';

export type LabelHomes = {
  readonly structures: Record<StructureId, StructureItemSettings>;
  readonly galaxyCatalogs: Record<GalaxyCatalogId, GalaxyCatalogItemSettings>;
  readonly milkyWayLabelEnabled: boolean;
};
```

`src/@types/settings/LabelHome.d.ts`:

```ts
/**
 * LabelHome — one source type's label-visibility read/write pair.
 *
 * The two directions of the same fact: `read` pulls a category's label bit out
 * of the bundled homes, `write` produces the action that sets it. Keeping them
 * on ONE row is what makes the table's correctness locally checkable — a
 * mismatched pair (reading the structure record, writing the galaxy-catalog
 * setter) is visible in three lines rather than split across a projection
 * module and a container.
 *
 * `write` returns RTK's `Action` supertype: these are dispatched verbatim, and
 * the slice creators enforce payload correctness at their own call sites — the
 * same posture `VISIBILITY_ACTION_ROW` takes.
 */

import type { Action } from '@reduxjs/toolkit';
import type { LabelCategory } from '../engine/data/LabelCategory';
import type { LabelHomes } from './LabelHomes';

export type LabelHome = {
  readonly read: (homes: LabelHomes, id: LabelCategory) => boolean;
  readonly write: (id: LabelCategory, enabled: boolean) => Action;
};
```

- [x] **Step 4: Create the table**

`src/data/labels/labelHomeBySourceType.ts`:

```ts
/**
 * LABEL_HOME_BY_SOURCE_TYPE — where each label-bearing source type keeps its
 * per-category label bit, and how to write it.
 *
 * Callers resolve a category's home with
 * `LABEL_HOME_BY_SOURCE_TYPE[SOURCE_REGISTRY[cat].type]`, so a new
 * label-bearing source type is ONE row here rather than a fresh branch in both
 * the read projection and the container's write handler. It replaces a pair of
 * hardcoded chains that had to be kept in mirror-image agreement by hand:
 * `isStructureId → === 'milkyWay' → else galaxy-catalog`, spelled once for
 * reads and once for writes.
 *
 * `milkyWay` is a row like any other. Its `read`/`write` reach a singleton
 * scalar rather than an `items` record — a genuine difference (one disk, one
 * "You are here" label, no per-record catalog), so it is expressed as that
 * row's implementation rather than smoothed away by synthesising a one-entry
 * items record, which would pretend the overlay is a catalog.
 */

import type { LabelHome } from '../../@types/settings/LabelHome';
import type { LabelBearingSourceType } from '../../@types/data/LabelBearingSourceType';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import {
  setStructureLabelEnabled,
  setMilkyWayLabelEnabled,
  setGalaxyCatalogLabelEnabled,
} from '../../state/settings/settingsSlice';

export const LABEL_HOME_BY_SOURCE_TYPE: Readonly<Record<LabelBearingSourceType, LabelHome>> = {
  structure: {
    read: (homes, id) => homes.structures[id as StructureId].labelEnabled,
    write: (id, enabled) => setStructureLabelEnabled({ id: id as StructureId, enabled }),
  },
  galaxyCatalog: {
    read: (homes, id) => homes.galaxyCatalogs[id as GalaxyCatalogId].labelEnabled,
    write: (id, enabled) => setGalaxyCatalogLabelEnabled({ id: id as GalaxyCatalogId, enabled }),
  },
  // The singleton overlay: one scalar, no per-record row to index.
  milkyWay: {
    read: (homes) => homes.milkyWayLabelEnabled,
    write: (_id, enabled) => setMilkyWayLabelEnabled(enabled),
  },
};
```

The `as StructureId` / `as GalaxyCatalogId` casts are the table's one unavoidable seam: `LabelHome.read` is uniform over `LabelCategory` (that is what makes the table a `Record`), while each row indexes a record keyed by its own narrower id union. The registry lookup that selects the row is what guarantees the cast holds.

- [x] **Step 5: Rewrite the projection to use the table**

Replace the whole body of `src/state/settings/projectLabelCategoryVisibility.ts`. Keep the module docblock's first paragraph and the "why milkyWay is a scalar" section (both still true); replace the "This projection partitions structure vs galaxy catalog…" sentence and the "Why these arguments" section with the text below.

```ts
/**
 * projectLabelCategoryVisibility — pure projection of the per-category label
 * visibility into the flat `Record<LabelCategory, boolean>` the SettingsPanel
 * reads for its label checkboxes.
 *
 * Each label-bearing source type keeps its label bit beside that source's other
 * visibility axis, so the bits live in several authoritative homes. This
 * projection merges them into the single record the panel wants, routing each
 * category through `LABEL_HOME_BY_SOURCE_TYPE[SOURCE_REGISTRY[cat].type]`. The
 * React prop shape is therefore a derived view, not one more stored copy that
 * could drift.
 *
 * ### Why milkyWay is a scalar in the bundle, not an items row
 *
 * The other homes are uniform per-record item Records. `milkyWay` is a
 * singleton-overlay axis with no per-record catalog (one disk, one "You are
 * here" label), so it has no item row to read — it carries a single
 * `labelEnabled` boolean. Passing that boolean directly, rather than
 * synthesising a one-entry `items` record to force uniformity, keeps the
 * singleton-vs-per-record difference honest instead of pretending the overlay
 * is a catalog. Its `LabelHome` row absorbs the difference.
 *
 * ### Why a LabelHomes bundle (not EngineSettingsState)
 *
 * Every field of the bundle is the stable reference a selector returns, so the
 * React side feeds it from `useMemo` and the record is rebuilt exactly when a
 * label home changes. Reading through the whole settings bag would rebuild on
 * every unrelated write — Immer hands out a fresh identity each time.
 */

import type { LabelCategory } from '../../@types/engine/data/LabelCategory';
import type { LabelHomes } from '../../@types/settings/LabelHomes';
import type { LabelBearingSourceType } from '../../@types/data/LabelBearingSourceType';
import { LABEL_CATEGORIES } from '../../data/structure/labelCategories';
import { LABEL_HOME_BY_SOURCE_TYPE } from '../../data/labels/labelHomeBySourceType';
import { SOURCE_ENTRIES } from '../../data/sourceEntries';

/**
 * Category id → its registry row's source type. Built once: the panel calls
 * the projection on every relevant settings change, and a linear registry scan
 * per category per call would be quadratic for no reason.
 */
const SOURCE_TYPE_BY_CATEGORY = new Map<string, LabelBearingSourceType>(
  SOURCE_ENTRIES.filter((e) => e.bearsLabel).map((e) => [e.id, e.type as LabelBearingSourceType]),
);

export function projectLabelCategoryVisibility(homes: LabelHomes): Record<LabelCategory, boolean> {
  return Object.fromEntries(
    LABEL_CATEGORIES.map((c) => [
      c,
      LABEL_HOME_BY_SOURCE_TYPE[SOURCE_TYPE_BY_CATEGORY.get(c)!].read(homes, c),
    ]),
  ) as Record<LabelCategory, boolean>;
}
```

- [x] **Step 6: Rewrite the container's write handler**

In `src/components/containers/LabelsAndGuidesSectionContainer.tsx`, replace the `useMemo` at lines 83-86 and the `onSetLabelCategoryVisibility` `useCallback` at lines 91-102:

```tsx
const labelHomes = useMemo(
  () => ({
    structures: structureItems,
    galaxyCatalogs: galaxyCatalogItems,
    milkyWayLabelEnabled,
  }),
  [structureItems, galaxyCatalogItems, milkyWayLabelEnabled],
);

const labelCategoryVisibility = useMemo(
  () => projectLabelCategoryVisibility(labelHomes),
  [labelHomes],
);

// One table lookup replaces the former three-way chain. The registry row's
// `type` names the home; the home knows how to write it.
const onSetLabelCategoryVisibility = useCallback(
  (category: LabelCategory, enabled: boolean) => {
    const entry = SOURCE_REGISTRY_BY_ID[category];
    dispatch(LABEL_HOME_BY_SOURCE_TYPE[entry.type].write(category, enabled));
  },
  [dispatch],
);
```

Add a module-level lookup beside the imports (the container needs id → entry, and the registry is keyed by numeric code):

```tsx
const SOURCE_REGISTRY_BY_ID = Object.fromEntries(
  SOURCE_ENTRIES.filter((e) => e.bearsLabel).map((e) => [e.id, e]),
) as Record<LabelCategory, { readonly type: LabelBearingSourceType }>;
```

Drop the now-unused `isStructureId`, `setStructureLabelEnabled`, `setMilkyWayLabelEnabled`, and `setGalaxyCatalogLabelEnabled` imports. Update the container's docblock: replace the "### 3-way dispatch guard" section with a "### Label dispatch" section pointing at `LABEL_HOME_BY_SOURCE_TYPE`.

- [x] **Step 7: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS. Fix any test that constructed `projectLabelCategoryVisibility(a, b, c)` positionally — pass the bundle instead. Behaviour is unchanged, so no test's _assertions_ should need editing; only call shapes.

- [x] **Step 8: Commit**

```bash
git add src/@types/settings/LabelHomes.d.ts src/@types/settings/LabelHome.d.ts src/@types/data/LabelBearingSourceType.d.ts src/data/labels/labelHomeBySourceType.ts src/state/settings/projectLabelCategoryVisibility.ts src/components/containers/LabelsAndGuidesSectionContainer.tsx tests/data/labels/labelHomeBySourceType.test.ts
git commit -m "refactor(labels): route label visibility through a source-type table"
```

---

### Task 2: Widen the label-layer vocabulary

Renames `galaxyNames` → `galaxy`, adds `starCatalog` and `body`, and retypes `FadeId`'s label discriminator from `category?: StructureId` to `item?: LabelCategory`. Pure vocabulary change — no new rows, no behaviour change.

**Files:**

- Modify: `src/@types/animation/LabelLayerId.d.ts` (whole file)
- Modify: `src/@types/animation/CategoryLabelLayer.d.ts:15`
- Modify: `src/@types/animation/FadeId.d.ts:44-51, 86-90`
- Modify: `src/@types/data/SourceEntryBase.d.ts:28-50` (docblock only)
- Modify: `src/services/engine/wiring/fadeLayers.ts:137-170`
- Modify: every producer/test that spells `'galaxyNames'` or `category:` on a `labelLayer` FadeId

**Interfaces:**

- Consumes: Task 1's table (untouched here).
- Produces: `LabelLayerId = 'milkyWay' | 'structure' | 'galaxy' | 'scaleBar' | 'starCatalog' | 'body'`; `FadeId`'s labelLayer arm gains `item?: LabelCategory`.

- [x] **Step 1: Find every call site**

Run: `grep -rn "galaxyNames" src tests --include="*.ts" --include="*.tsx"`
Run: `grep -rn "kind: 'labelLayer'" src tests --include="*.ts" --include="*.tsx"`

Record both lists — every hit is edited in Step 2. There is no test to write first: this step is a rename, and the compiler is the oracle. (Per `testing.md`, a test asserting a union's members is a constant restatement and must not be added.)

- [x] **Step 2: Rewrite the three type files**

`src/@types/animation/LabelLayerId.d.ts`:

```ts
/**
 * LabelLayerId — string-literal identifier for each label layer that
 * participates in the unified fade registry.
 *
 * Each layer fades independently. The registry keys
 * `{ kind: 'labelLayer', layer }` by the layer ID, so a future label layer is
 * added by extending this union; nothing in the registry itself needs to learn
 * the new value.
 *
 * The names track the SOURCE TYPE that produces the layer's labels, so a
 * registry row's `labelLayer` reads as "which of my siblings do I share a fade
 * with". `scaleBar` is the one member with no producing source type — it is a
 * React-side HUD element, reserved for tour integration.
 *
 * Current layers:
 *   - milkyWay    — the "You are here" Milky Way label (a single label +
 *                   marker line) emitted by produceMilkyWayLabel. The layer
 *                   fade carries the user toggle + load-in ramp; the producer
 *                   owns the camera-distance fade.
 *   - structure   — cluster + named-anchor labels emitted by
 *                   `produceStructureLabels`.
 *   - galaxy      — per-galaxy name labels (the famous-galaxy atlas names).
 *   - starCatalog — curated star-map captions, emitted through the
 *                   foreground-labels layer on the NEAR0 slab.
 *   - body        — scene-body captions (Sun, Earth, planets), likewise on the
 *                   foreground-labels layer.
 *   - scaleBar    — the on-screen scale-bar HUD. Constructed by React,
 *                   not a GPU layer; reserved for tour integration.
 */
export type LabelLayerId =
  | 'milkyWay'
  | 'structure'
  | 'galaxy'
  | 'starCatalog'
  | 'body'
  | 'scaleBar';
```

`src/@types/animation/CategoryLabelLayer.d.ts` — replace line 15 and the `scaleBar` sentence in its docblock:

```ts
/**
 * CategoryLabelLayer — the fade layers a label-bearing *category* can route to.
 *
 * This is the subset of `LabelLayerId` reachable from a SOURCE_REGISTRY row's
 * `labelLayer` field. `scaleBar` is the only excluded layer — a React-side HUD
 * element with no owning source row. Every other layer IS category-routable:
 * each is produced by a registry row like any other category.
 *
 * Derived from `LabelLayerId` via `Exclude` rather than re-spelled, so the
 * subset can never name a layer that doesn't exist on the fade registry — and
 * a new label layer is category-routable by default, which is the common case.
 */
export type CategoryLabelLayer = Exclude<LabelLayerId, 'scaleBar'>;
```

`Exclude` rather than the spec's widened `Extract`: the exclusion list is the one that stays short as layers are added, and it makes "a new layer is category-routable" the default rather than something to remember.

`src/@types/animation/FadeId.d.ts` — replace the `labelLayer` bullet (lines 44-51) and the union arm (86-90):

```ts
 *   - labelLayer   — one logical label layer (milkyWay, structure, galaxy
 *                    names, star-map captions, scene-body captions, scale
 *                    bar). Discriminator: `layer: LabelLayerId`. A layer whose
 *                    source fans out per item additionally keys on
 *                    `item: LabelCategory` so each source's labels are a
 *                    distinct controller; singleton layers carry no item.
```

```ts
  | {
      readonly kind: 'labelLayer';
      readonly layer: LabelLayerId;
      readonly item?: LabelCategory;
    }
```

Add `import type { LabelCategory } from '../engine/data/LabelCategory';` and drop the now-unused `StructureId` import **only if** nothing else in the file uses it (the `structure` arm does — keep it).

- [x] **Step 3: Update every call site from Step 1**

In `src/services/engine/wiring/fadeLayers.ts`:

```ts
  layer({
    key: 'surveyLabel',
    expand: () => [undefined],
    handle: () => ({ kind: 'labelLayer', layer: 'galaxy' }),
    seed: (s) => (s.galaxyCatalogs.items.famousGalaxy.labelEnabled ? 1 : 0),
    intent: (s) => s.galaxyCatalogs.items.famousGalaxy.labelEnabled,
  }),
```

```ts
  layer({
    key: 'structureLabel',
    expand: () => STRUCTURE_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'structure', item: id }),
    seed: (s, id) => (s.structures.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.structures.items[id].labelEnabled,
  }),
```

Apply the same `category:` → `item:` and `'galaxyNames'` → `'galaxy'` edits to every other hit from Step 1 (label producers, fade-registry key serialization, tests).

Also update `SourceEntryBase.d.ts`'s `bearsLabel` and `labelLayer` docblocks, which name `galaxyNames` and enumerate "the two real label sets":

```ts
  /**
   * True if this source carries toggleable on-screen text labels.
   * Drives the label-visibility record and the fade-layer routing in the
   * label subsystem. Bulk galaxy catalogs (sdss, glade, 2mrs, milliquas,
   * desiDeep, synthetic) and the survey-wide Gaia bin are false: they render
   * millions of points and no names.
   *
   * This is a CAPABILITY, not a routing detail — a source that puts a name on
   * screen sets it, whichever renderer draws that name. Setting it from "does
   * this go through the COSMO label system" is what previously left the
   * near-field bodies marked false while they captioned every frame.
   */
  readonly bearsLabel: boolean;
```

```ts
  /**
   * Which fade layer this source's labels live on. Present iff bearsLabel.
   * See `LabelLayerId` for the layer set. Absent on non-label-bearing rows.
   */
  readonly labelLayer?: CategoryLabelLayer;
```

- [x] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS. TypeScript flags every missed rename; there should be no runtime behaviour change, so any _assertion_ failure means a call site was edited wrongly.

- [x] **Step 5: Commit**

```bash
git add src/@types/animation/LabelLayerId.d.ts src/@types/animation/CategoryLabelLayer.d.ts src/@types/animation/FadeId.d.ts src/@types/data/SourceEntryBase.d.ts src/services/engine/wiring/fadeLayers.ts
git add <every other file edited in Step 3>
git commit -m "refactor(labels): name label layers after their source type"
```

---

### Task 3: `famousStar` becomes a label-bearing star-catalog row

The `famousStars` singleton cluster becomes `starCatalogs.items.famousStar` — the mirror of `famousGalaxy`. Its caption gate moves from `labels.starLabelsEnabled` to that row's `labelEnabled`.

**Files:**

- Create: `src/@types/data/starCatalog/SurveyStarCatalogSourceEntry.d.ts`
- Create: `src/@types/data/starCatalog/SeededStarCatalogSourceEntry.d.ts`
- Delete: `src/@types/data/body/FamousStarSourceEntry.d.ts`
- Modify: `src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts` (becomes the union)
- Modify: `src/@types/data/SourceEntry.d.ts`, `src/data/sources/famous-star.ts`, `src/data/sources.ts` (docblock)
- Modify: `src/services/engine/wiring/assetWiring.ts:140-142`
- Modify: `src/services/engine/wiring/fadeLayers.ts`, `src/services/animation/visibilityActionRow.ts`, `src/store/effects/watchFadesSaga.ts`, `src/@types/animation/VisibilityLayerKey.d.ts`
- Modify: `src/@types/settings/EngineSettingsState.d.ts`, `src/state/settings/{initialState,selectors,settingsSlice}.ts`, `src/data/defaults.ts`
- Modify: `src/@types/data/LabelBearingSourceType.d.ts`, `src/@types/settings/LabelHomes.d.ts`, `src/data/labels/labelHomeBySourceType.ts`
- Modify: `src/services/engine/frame/visibleStars.ts`, `src/services/engine/frame/passes/foregroundLabelsLayer.ts`
- Modify: `src/components/SettingsPanel/StarsSection.tsx`, `src/components/containers/{StarsSectionContainer,LabelsAndGuidesSectionContainer}.tsx`
- Test: `tests/services/engine/frame/visibleStars.test.ts` (create or extend)

**Interfaces:**

- Consumes: Task 1's `LabelHome` / `LabelHomes` / `LabelBearingSourceType`; Task 2's `'starCatalog'` `LabelLayerId`.
- Produces:
  - `FAMOUS_STAR_ENTRY` with `type: 'starCatalog'`, `bearsLabel: true`, `labelLayer: 'starCatalog'`, `binBaseName: null`, `detailLabel: 'Famous Star'`, `shortLabel: 'Star'`, `plural: 'Famous Stars'`.
  - `StarCatalogId` widens to `'gaiaStars' | 'famousStar'`.
  - `VisibilityLayerKey` gains `'starCatalogLabel'`.
  - `settings.famousStars`, `settings.labels.starLabelsEnabled`, `selectFamousStarsEnabled`, `selectStarLabelsEnabled`, `setFamousStarsEnabled`, `setStarLabelsEnabled`, `DEFAULT_FAMOUS_STARS_ENABLED` are all **deleted**.

- [x] **Step 1: Write the failing test**

`tests/services/engine/frame/visibleStars.test.ts` — the single highest-value test in the change. Match the surrounding tests' fixture helpers; `tests/state/settings/makeSettingsFixture.ts` already exists and should be used rather than hand-built literals.

```ts
/**
 * `visibleStars` must keep the Sun on screen when the curated famous-star map
 * is muted — the toggle hides the MAP, never the solar system's anchor. The
 * behaviour used to be a hardcoded id exemption; after the migration it is
 * emergent from two independent gates, which is exactly the kind of change
 * that can silently drop the Sun.
 */
import { describe, it, expect } from 'vitest';
import { visibleStars } from '../../../../src/services/engine/frame/visibleStars';
import { makeSettingsFixture } from '../../../state/settings/makeSettingsFixture';

const STARS = [
  { id: 'sun', name: 'Sun' },
  { id: 'sirius', name: 'Sirius' },
  { id: 'vega', name: 'Vega' },
];

function stateWith(famousStarMapOn: boolean) {
  const settings = makeSettingsFixture();
  settings.starCatalogs.items.famousStar.enabled = famousStarMapOn;
  return { settings, data: { bodies: { stars: STARS } } } as never;
}

describe('visibleStars', () => {
  it('draws the whole seeded map when the famous-star row is on', () => {
    expect(visibleStars(stateWith(true)).map((s) => s.id)).toEqual(['sun', 'sirius', 'vega']);
  });

  it('draws the Sun alone when the famous-star row is off', () => {
    expect(visibleStars(stateWith(false)).map((s) => s.id)).toEqual(['sun']);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/engine/frame/visibleStars.test.ts`
Expected: FAIL — `settings.starCatalogs.items.famousStar` is undefined.

- [x] **Step 3: Split the star-catalog entry type**

`src/@types/data/starCatalog/SurveyStarCatalogSourceEntry.d.ts` — today's `StarCatalogSourceEntry` body verbatim (keep its whole docblock), renamed, with `binBaseName` retyped:

```ts
import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * A star catalog streamed from disk — the survey-wide Gaia bin today.
 *
 * Its presentation defaults live in-row (like `VolumeSourceEntry`) rather than
 * in a separate settings table, so the draw budget and the crossfade band that
 * hands off to the procedural Milky-Way cloud sit next to the `binBaseName`
 * they govern. Leaf stars ARE pickable — `drawPick` stamps a resolved star's
 * identity into the NEAR0 pick pass — and the `code` tags the source in that
 * pick encoding, but a star's identity is its record index and is never
 * persisted to the `.bin`.
 */
export type SurveyStarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Filename stem under public/data/; loader appends `-<tier>.bin`. */
  readonly binBaseName: string;
  /** Ships per-tier `.bin` variants (always true for this source). */
  readonly tiered: boolean;
  /** Per-frame drawn-point budget: typical + hard cap. */
  readonly drawBudget: { readonly typical: number; readonly hardCap: number };
  /** Camera-distance crossfade band to the procedural MW cloud, parsecs. */
  readonly crossfadePc: { readonly inner: number; readonly outer: number };
};
```

`src/@types/data/starCatalog/SeededStarCatalogSourceEntry.d.ts`:

```ts
import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * A star catalog seeded from the body store rather than streamed from disk —
 * the curated famous-star neighbourhood (the hand-picked nearby-star map).
 *
 * The curated twin of the survey-wide Gaia bin: same source type, because both
 * are star catalogs the user toggles as a set and both key
 * `settings.starCatalogs.items`. It carries `binBaseName: null` to say it ships
 * no asset — the same signal `VolumeSourceEntry` uses for its runtime-generated
 * fixtures — and therefore none of the survey row's loader/draw-budget fields.
 * The asset-demand table filters on that null, so a seeded catalog never
 * requests a `.bin` that doesn't exist.
 *
 * Unlike the Gaia bin it DOES bear labels: the map's star names caption the
 * final descent through `foregroundLabelsLayer`.
 */
export type SeededStarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Always null: this catalog is seeded in code, not loaded from disk. */
  readonly binBaseName: null;
};
```

`src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts` becomes:

```ts
import type { SurveyStarCatalogSourceEntry } from './SurveyStarCatalogSourceEntry';
import type { SeededStarCatalogSourceEntry } from './SeededStarCatalogSourceEntry';

/**
 * StarCatalog-typed row of the SOURCE_REGISTRY — a star set the user toggles
 * as a unit, keying `settings.starCatalogs.items`.
 *
 * Two variants, discriminated by `binBaseName`: a SURVEY catalog streams
 * tiered `.bin` point clouds from disk (`binBaseName: string`), while a SEEDED
 * catalog is built in code from the body store (`binBaseName: null`) and so
 * carries none of the loader's fields. Readers that need a filename narrow on
 * `binBaseName !== null`; readers that only need the shared visibility/label
 * axes need no narrowing at all, which is the common case.
 */
export type StarCatalogSourceEntry = SurveyStarCatalogSourceEntry | SeededStarCatalogSourceEntry;
```

Point `src/data/sources/gaia-stars.ts` at `SurveyStarCatalogSourceEntry`. Delete `src/@types/data/body/FamousStarSourceEntry.d.ts` and drop it from `SourceEntry.d.ts`'s union + docblock.

- [x] **Step 4: Retype the famous-star registry row**

`src/data/sources/famous-star.ts`:

```ts
import type { SeededStarCatalogSourceEntry } from '../../@types/data/starCatalog/SeededStarCatalogSourceEntry';
import { Source } from '../source';

export const FAMOUS_STAR_ENTRY = {
  type: 'starCatalog',
  code: Source.FamousStar,
  id: 'famousStar',
  label: 'Famous Star',
  // A collection of bodies sitting at the observer's near field, not a sky
  // patch — allSky:true matches the other non-catalog rows (the coverage-mask
  // logic only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the famous stars are part of the baseline near-field scene,
  // resolved only on close approach through their content-layer. The flag never
  // reaches ALL_VISIBLE_MASK (galaxy-catalog rows only), so it's a scene-intent
  // marker, not a bitmask contributor.
  visible: true,
  // The star map captions its members on the final descent, so it bears labels
  // like any other named source — the foreground-labels layer draws them on the
  // NEAR0 slab rather than the COSMO one, which is a routing detail, not a
  // capability difference.
  bearsLabel: true,
  labelLayer: 'starCatalog',
  bearsMarker: false,
  detailLabel: 'Famous Star',
  shortLabel: 'Star',
  plural: 'Famous Stars',
  // Seeded in code from the body store, so no asset ships for it.
  binBaseName: null,
} as const satisfies SeededStarCatalogSourceEntry;
```

Fix the asset-demand filter in `src/services/engine/wiring/assetWiring.ts:140-142` — without this the loader requests a `.bin` for a catalog that has none:

```ts
/**
 * Star-catalog sources that actually ship an asset, derived from the registry
 * rather than re-spelled. A SEEDED catalog (`binBaseName: null`, the curated
 * famous-star map) is built in code and has no `.bin` to demand, so it is
 * filtered out here — including it would have the fetcher request a filename
 * assembled from a null stem. `code` is the numeric `Source` twin of each row.
 */
const STAR_CATALOG_SOURCES: readonly SourceType[] = SOURCE_ENTRIES.filter(
  (e) => e.type === 'starCatalog' && e.binBaseName !== null,
).map((e) => e.code);
```

- [x] **Step 5: Move the settings home**

In `src/@types/settings/EngineSettingsState.d.ts`: delete the whole `famousStars` cluster (lines 317-335) and update the `starCatalogs` docblock — replace "Today the sole row is the survey-wide Gaia bin (`gaiaStars`) … will add a label-bearing row later" with:

```
   * Two rows today: the survey-wide Gaia bin (`gaiaStars`), which carries
   * `labelEnabled` inertly because the star renderer draws no per-star names,
   * and the curated famous-star map (`famousStar`), whose `labelEnabled` gates
   * its captions on the final descent. `famousStar.enabled` gates the SEEDED
   * MAP, not the solar system: with it off the star layers draw the Sun alone
   * (see `visibleStars`).
```

In `src/state/settings/initialState.ts`: delete the `famousStars` cluster (lines 201-207) and its `DEFAULT_FAMOUS_STARS_ENABLED` import. The existing `starCatalogs.items` derivation already seeds `famousStar` from the entry's `visible` flag, so no seed edit is needed — but update the trailing comment to stop saying `labelEnabled` is inert for every row.

Delete `DEFAULT_FAMOUS_STARS_ENABLED` from `src/data/defaults.ts:283`, `setFamousStarsEnabled` from `settingsSlice.ts:167-174` (and its export), and `selectFamousStarsEnabled` from `selectors.ts:152-160`.

Then delete `labels.starLabelsEnabled`: remove the field from `src/@types/settings/LabelSettings.d.ts`, from `initialState.ts:222`, and remove `setStarLabelsEnabled` + `selectStarLabelsEnabled`.

- [x] **Step 6: Wire the fade + intent rows**

`src/@types/animation/VisibilityLayerKey.d.ts` — add `| 'starCatalogLabel'` and a docblock note:

```
 * Note on `starCatalogLabel` / `bodyLabel`: these are CLUSTER-level rows — one
 * intent across every star catalog / every body — matching how `surveyLabel`
 * addresses all galaxy-catalog labels at once. Per-item keys are added when a
 * tour beat actually needs to address one body's caption alone.
```

`src/services/engine/wiring/fadeLayers.ts` — add beside `surveyLabel`:

```ts
  // curated star-map captions — per StarCatalogId, settings-derived seed (the
  // seed is in code, not demand-loaded, so there is no guard and the seed
  // follows the toggle).
  layer({
    key: 'starCatalogLabel',
    expand: () => STAR_CATALOG_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'starCatalog', item: id }),
    seed: (s, id) => (s.starCatalogs.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.starCatalogs.items[id].labelEnabled,
  }),
```

Import `STAR_CATALOG_IDS` from `../../../data/starCatalog/starCatalogIds`.

`src/services/animation/visibilityActionRow.ts` — add under the per-item section:

```ts
  starCatalogLabel: (on, settings) =>
    Object.keys(settings.starCatalogs.items).map((id) =>
      setStarCatalogLabelEnabled({ id: id as StarCatalogId, enabled: on }),
    ),
```

Import `setStarCatalogLabelEnabled` and `type StarCatalogId`.

`src/store/effects/watchFadesSaga.ts` — add to `FADE_ROW`:

```ts
  [setStarCatalogLabelEnabled.type]: 'starCatalogLabel',
```

- [x] **Step 7: Add the star-catalog label home**

`src/@types/data/LabelBearingSourceType.d.ts` — add `| 'starCatalog'`.

`src/@types/settings/LabelHomes.d.ts` — add the field:

```ts
  readonly starCatalogs: Record<StarCatalogId, StarCatalogItemSettings>;
```

`src/data/labels/labelHomeBySourceType.ts` — add the row:

```ts
  starCatalog: {
    read: (homes, id) => homes.starCatalogs[id as StarCatalogId].labelEnabled,
    write: (id, enabled) => setStarCatalogLabelEnabled({ id: id as StarCatalogId, enabled }),
  },
```

In `LabelsAndGuidesSectionContainer.tsx`, select `selectStarCatalogItems` and add it to the `labelHomes` memo + deps. If `selectStarCatalogItems` does not exist yet, add it to `src/state/settings/selectors.ts` beside `selectGalaxyCatalogItems`, matching that selector's shape.

Finally, delete the `toggle-label-stars` entry from the container's `nonCategoryRows` array and its `starLabelsEnabled` / `onSetStarLabelsEnabled` plumbing — the "Famous Stars" row now arrives via `LABEL_CATEGORIES`.

- [x] **Step 8: Repoint the two readers**

`src/services/engine/frame/visibleStars.ts` — replace the settings read; the Sun exemption stays for now (Task 5 removes it):

```ts
if (state.settings.starCatalogs.items.famousStar.enabled) return stars;
```

`src/services/engine/frame/passes/foregroundLabelsLayer.ts`:

- In `draw`, replace lines 456 and 461:

```ts
const starMapLabelsEnabled = state.settings.starCatalogs.items.famousStar.labelEnabled;
const starMapEnabled = state.settings.starCatalogs.items.famousStar.enabled;
```

- In the `baseTarget` ternary (lines 509-519), substitute `starMapLabelsEnabled` for `starLabelsEnabled` and `starMapEnabled` for `famousStarsEnabled`. Leave the shape alone; Task 5 flattens it.
- In `enabled()` (line 397), substitute the same:

```ts
state.settings.starCatalogs.items.famousStar.labelEnabled ||
  state.settings.labels.planetLabelsEnabled;
```

- Update the module docblock's "Three independent mute switches" paragraph to name the new homes.

`src/components/SettingsPanel/StarsSection.tsx` + `StarsSectionContainer.tsx` — delete the bespoke famous-stars checkbox and its `famousStarsEnabled` prop. `famousStar` now renders through the existing `STAR_CATALOG_IDS.map` row loop, which the section's own docblock already calls "the extension point for a future famous-star catalog". Delete that anticipatory wording; it has arrived.

- [x] **Step 9: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS, including both new `visibleStars` cases. Update `tests/state/settings/makeSettingsFixture.ts` to drop `famousStars` / `starLabelsEnabled` and seed both `starCatalogs.items` rows. Tests referencing `setFamousStarsEnabled` or `labels.starLabelsEnabled` move to the new fields.

- [x] **Step 10: Commit**

```bash
git add src/@types/data/starCatalog src/@types/data/SourceEntry.d.ts src/@types/data/LabelBearingSourceType.d.ts src/@types/settings src/@types/animation/VisibilityLayerKey.d.ts src/data src/state src/services src/components tests
git commit -m "feat(stars): make famousStar a label-bearing star-catalog row"
```

---

### Task 4: `earth` + `planet` become the `bodies` cluster

**Files:**

- Create: `src/@types/data/body/BodySourceEntry.d.ts`, `BodyId.d.ts`; `src/@types/settings/BodyItemSettings.d.ts`; `src/data/bodies/bodyIds.ts`
- Delete: `src/@types/data/body/EarthSourceEntry.d.ts`, `PlanetSourceEntry.d.ts`
- Modify: `src/data/sources/{earth,planet}.ts`, `src/data/sources.ts`, `src/@types/data/SourceEntry.d.ts`
- Modify: `src/@types/settings/{EngineSettingsState,LabelSettings,LabelHomes}.d.ts`, `src/@types/data/LabelBearingSourceType.d.ts`
- Modify: `src/state/settings/{initialState,settingsSlice,selectors}.ts`, `src/data/labels/labelHomeBySourceType.ts`
- Modify: `src/@types/animation/VisibilityLayerKey.d.ts`, `src/services/engine/wiring/fadeLayers.ts`, `src/services/animation/visibilityActionRow.ts`, `src/store/effects/watchFadesSaga.ts`
- Modify: `src/services/engine/frame/passes/foregroundLabelsLayer.ts`
- Modify: `src/components/containers/LabelsAndGuidesSectionContainer.tsx`
- Test: `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts` (extend)

**Interfaces:**

- Consumes: Task 1's table, Task 2's `'body'` `LabelLayerId`, Task 3's precedent for a per-item label row.
- Produces:
  - `type BodySourceEntry = SourceEntryBase & { type: 'body'; code: number }`
  - `type BodyId = Extract<AnyEntry, { readonly type: 'body' }>['id']` — `'earth' | 'planet'` after this task, `| 'sun'` after Task 5.
  - `const BODY_IDS: readonly BodyId[]`
  - `type BodyItemSettings = DataItemSettings & { labelEnabled: boolean }`
  - `settings.bodies: { items: Record<BodyId, BodyItemSettings> }`
  - `setBodyItemEnabled` / `setBodyLabelEnabled` slice actions, `selectBodyItems` selector.
  - `VisibilityLayerKey` gains `'bodyLabel'`. `settings.labels` shrinks to `{ focusedOnly }`.

- [x] **Step 1: Write the failing test**

Extend `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts` (match its existing harness — it already builds a state and inspects emitted labels):

```ts
it('mutes only the planet captions when the planet row s label is off', () => {
  const state = makeForegroundState();
  state.settings.bodies.items.planet.labelEnabled = false;
  state.settings.bodies.items.earth.labelEnabled = true;

  const drawn = drawAndCollectLabels(state);
  expect(drawn.some((l) => l.kind === 'planet')).toBe(false);
  expect(drawn.some((l) => l.kind === 'earth')).toBe(true);
});

it('mutes only the Earth caption when the earth row s label is off', () => {
  const state = makeForegroundState();
  state.settings.bodies.items.earth.labelEnabled = false;
  state.settings.bodies.items.planet.labelEnabled = true;

  const drawn = drawAndCollectLabels(state);
  expect(drawn.some((l) => l.kind === 'earth')).toBe(false);
  expect(drawn.some((l) => l.kind === 'planet')).toBe(true);
});
```

These two are the behaviour D1 buys: the merged "Planet names" toggle splits, so Earth and the planets must now mute independently. Reuse the file's existing state builder and label-collection helper rather than inventing new ones — read the file first and match its names.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts`
Expected: FAIL — `settings.bodies` is undefined.

- [x] **Step 3: Create the body types**

`src/@types/data/body/BodySourceEntry.d.ts`:

```ts
import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * Body-typed row of the SOURCE_REGISTRY — a true-scale near-field object in
 * the final descent (Earth, the Solar-System planets, the Sun).
 *
 * One `type` across all three because they share every axis that matters to
 * the registry: seeded in code (a body's identity is its stable seed id, never
 * persisted), drawn by their own content layers, pickable on the NEAR0 pick
 * pass via `drawPick`, and captioned through the foreground-labels layer. What
 * differs between them — texture sets, orbital elements, lighting — lives in
 * the body store, not here. Splitting them into three registry types bought
 * nothing but three copies of this shape, and cost the uniform
 * `settings.bodies.items[id]` accessor the other source-type clusters have.
 */
export type BodySourceEntry = SourceEntryBase & {
  readonly type: 'body';
  /** Stable numeric tag; not persisted, only used as the registry key. */
  readonly code: number;
};
```

`src/@types/data/body/BodyId.d.ts`:

```ts
import type { SOURCE_REGISTRY } from '../../../data/sources';

type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];

/**
 * The closed set of body ids — the key domain for `settings.bodies.items`.
 * Derived from the `type: 'body'` registry rows, so a new near-field body
 * widens the union automatically. The runtime iterable companion is
 * `BODY_IDS` in `data/bodies/bodyIds`.
 */
export type BodyId = Extract<AnyEntry, { readonly type: 'body' }>['id'];
```

`src/data/bodies/bodyIds.ts`:

```ts
import { SOURCE_ENTRIES } from '../sourceEntries';

/**
 * BODY_IDS — the body-only id list, the tight key domain for
 * `settings.bodies.items`.
 *
 * `SOURCE_IDS` spans every registry kind, so keying a body-items record by it
 * would let a foreign id slip in. Filtering to `type === 'body'` gives a key
 * domain that admits exactly the near-field bodies — the same narrowing
 * `STAR_CATALOG_IDS` / `STRUCTURE_IDS` do for their clusters. Order is registry
 * source-code order; it is purely iteration order, since per-body state comes
 * from the keyed `items` record, not list position.
 */
export const BODY_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => e.id);
```

`src/@types/settings/BodyItemSettings.d.ts`:

```ts
import type { DataItemSettings } from './DataItemSettings';

/**
 * BodyItemSettings — per-item settings for one near-field body (held in
 * `settings.bodies.items`, keyed by body id).
 *
 * A body adds a label axis on top of the universal visibility axis, exactly as
 * a star catalog or a structure does: `enabled` is the body itself, and
 * `labelEnabled` is its caption. Co-locating both on one row means a reader
 * walks one entry to learn everything about a body's visibility, instead of
 * cross-indexing the item record against a separate label bag.
 */
export type BodyItemSettings = DataItemSettings & {
  /** Whether this body's caption is shown (the body itself is the base `enabled`). */
  labelEnabled: boolean;
};
```

- [x] **Step 4: Retype the two registry rows**

`src/data/sources/earth.ts` — keep the `allSky` / `visible` comments verbatim, replace the `bearsLabel` comment and add the label fields:

```ts
import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

export const EARTH_ENTRY = {
  type: 'body',
  code: Source.Earth,
  id: 'earth',
  label: 'Earth',
  // A single body sitting at the observer's near field, not a sky patch —
  // allSky:true matches the other non-catalog rows (the coverage-mask logic
  // only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the body is part of the baseline near-field scene, resolved
  // only on close approach through its content-layer. The flag never reaches
  // ALL_VISIBLE_MASK (galaxy-catalog rows only), so it's a scene-intent marker,
  // not a bitmask contributor.
  visible: true,
  // Earth captions itself on the final descent, so it bears labels like any
  // other named source — the foreground-labels layer draws the caption on the
  // NEAR0 slab rather than the COSMO one, which is a routing detail.
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Earth',
  shortLabel: 'Earth',
  plural: 'Earth',
} as const satisfies BodySourceEntry;
```

`src/data/sources/planet.ts` — same treatment, with `type: 'body'`, `detailLabel: 'Planet'`, `shortLabel: 'Planet'`, `plural: 'Planets'`.

`plural: 'Earth'` is not a typo: `plural` is the list/toggle header string, and the panel row for the single Earth reads "Earth".

Delete `EarthSourceEntry.d.ts` / `PlanetSourceEntry.d.ts`, replace both in `SourceEntry.d.ts`'s union with `BodySourceEntry`, and update the `'famousStar'/'planet'/'earth'` bullet in `src/data/sources.ts`'s header to a single `'body'` bullet.

- [x] **Step 5: Add the settings cluster**

`src/@types/settings/EngineSettingsState.d.ts` — add after `starCatalogs`:

```ts
/**
 * Near-field body gates — the FIFTH source-type cluster, one `items` row per
 * `BodyId`, each carrying the visibility axis (`enabled`) and the caption
 * axis (`labelEnabled`).
 *
 * No cluster-level `enabled`: unlike the four data clusters there is no
 * "hide all bodies" intent — the bodies ARE the destination of the descent,
 * and a master gate over them would have no caller. Adding one when a caller
 * appears is a one-line change; inventing it now would be a knob nothing
 * turns.
 */
bodies: {
  items: Record<BodyId, BodyItemSettings>;
}
```

`src/state/settings/initialState.ts` — seed it from the registry, mirroring `starCatalogs`:

```ts
    // Body rows are DERIVED from the registry's body entries, so the seed can't
    // drift from the body set, and each row's `enabled` comes from that entry's
    // `visible` field — SOURCE_REGISTRY stays the single source of truth for
    // default visibility. `labelEnabled` seeds true: the captions are the
    // descent's navigation aids and show until the user mutes them.
    bodies: {
      items: Object.fromEntries(
        SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => [
          e.id,
          { enabled: e.visible, labelEnabled: true },
        ]),
      ) as Record<BodyId, BodyItemSettings>,
    },
```

`src/state/settings/settingsSlice.ts` — add beside the star-catalog reducers:

```ts
    // ── bodies (fifth source-type cluster) ──────────────────────────────────
    // Per-body visibility / caption axes. No cluster-level gate: there is no
    // "hide all bodies" intent (see EngineSettingsState).
    setBodyItemEnabled: (
      settings,
      action: PayloadAction<{ id: BodyId; enabled: boolean }>,
    ) => {
      settings.bodies.items[action.payload.id].enabled = action.payload.enabled;
    },
    setBodyLabelEnabled: (
      settings,
      action: PayloadAction<{ id: BodyId; enabled: boolean }>,
    ) => {
      settings.bodies.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
```

Export both. Add `selectBodyItems` to `selectors.ts` beside `selectStarCatalogItems`.

Delete `labels.planetLabelsEnabled` from `LabelSettings.d.ts` and `initialState.ts` (so `labels: { focusedOnly: false }`), plus `setPlanetLabelsEnabled` and `selectPlanetLabelsEnabled`. `LabelSettings`'s docblock is now true as written — it really is cross-cutting.

- [x] **Step 6: Wire fade, intent, and label home**

`VisibilityLayerKey.d.ts` — add `| 'bodyLabel'`.

`fadeLayers.ts` — add beside `starCatalogLabel`:

```ts
  // scene-body captions — per BodyId, settings-derived seed (bodies are seeded
  // in code, so no demand-loaded guard).
  layer({
    key: 'bodyLabel',
    expand: () => BODY_IDS,
    handle: (id) => ({ kind: 'labelLayer', layer: 'body', item: id }),
    seed: (s, id) => (s.bodies.items[id].labelEnabled ? 1 : 0),
    intent: (s, id) => s.bodies.items[id].labelEnabled,
  }),
```

`visibilityActionRow.ts`:

```ts
  bodyLabel: (on, settings) =>
    Object.keys(settings.bodies.items).map((id) =>
      setBodyLabelEnabled({ id: id as BodyId, enabled: on }),
    ),
```

`watchFadesSaga.ts` FADE_ROW: `[setBodyLabelEnabled.type]: 'bodyLabel',`

`LabelBearingSourceType.d.ts` — add `| 'body'`. `LabelHomes.d.ts` — add `readonly bodies: Record<BodyId, BodyItemSettings>;`. `labelHomeBySourceType.ts` — add:

```ts
  body: {
    read: (homes, id) => homes.bodies[id as BodyId].labelEnabled,
    write: (id, enabled) => setBodyLabelEnabled({ id: id as BodyId, enabled }),
  },
```

In `LabelsAndGuidesSectionContainer.tsx`: select `selectBodyItems`, add to the `labelHomes` memo + deps, and delete the `toggle-label-planets` entry from `nonCategoryRows` along with its `planetLabelsEnabled` / `onSetPlanetLabelsEnabled` plumbing. "Earth" and "Planets" now arrive via `LABEL_CATEGORIES`.

- [x] **Step 7: Repoint the caption gate**

`foregroundLabelsLayer.ts`, in `draw`, replace the `planetLabelsEnabled` read with per-body lookups and flatten the caption-kind branch. The nested ternary at lines 509-519 becomes a lookup that asks each caption's own source:

```ts
// Each caption asks its OWN source's label gate — the same registry-derived
// home the settings panel writes. `sun`/`star` route to the star map's row,
// `earth`/`planet` to their body rows; the constellation kind never reaches
// here (those captions carry their own layer opacity).
const bodyItems = state.settings.bodies.items;
const starMapRow = state.settings.starCatalogs.items.famousStar;
const labelGateFor = (kind: ForegroundCaption['kind']): boolean => {
  switch (kind) {
    case 'earth':
      return bodyItems.earth.labelEnabled;
    case 'planet':
      return bodyItems.planet.labelEnabled;
    case 'sun':
    case 'star':
      return starMapRow.labelEnabled;
    case 'constellation':
      return true;
  }
};
```

and the `baseTarget` derivation:

```ts
const baseTarget = !labelGateFor(label.kind)
  ? 0
  : label.kind === 'earth' || label.kind === 'planet'
    ? 1
    : label.kind === 'sun'
      ? fadeBand(SCALE_FADE_BANDS.sunCaption, distanceMpc)
      : starMapRow.enabled
        ? fadeBand(SCALE_FADE_BANDS.starCaption, distanceMpc / SCALE_UNITS.PC_TO_MPC)
        : 0;
```

Update `enabled()`'s `bodyDemand` to OR the live gates:

```ts
starMapRow.labelEnabled || bodyItems.earth.labelEnabled || bodyItems.planet.labelEnabled;
```

reading `state.settings.*` directly there (the `enabled` hook has no local aliases). Update the module docblock's stage-1 paragraph: it currently describes "three independent mute switches" by their old names.

- [x] **Step 8: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS, both new cases included. Update `makeSettingsFixture.ts` to seed `bodies.items` and drop `labels.planetLabelsEnabled`.

- [x] **Step 9: Commit**

```bash
git add src/@types/data/body src/@types/data/SourceEntry.d.ts src/@types/data/LabelBearingSourceType.d.ts src/@types/settings src/@types/animation/VisibilityLayerKey.d.ts src/data src/state src/services src/components tests
git commit -m "feat(bodies): give Earth and the planets their own label rows"
```

---

### Task 5: The Sun becomes its own body row

Dissolves the Sun's gate exemption into data. `visibleStars`' hardcoded id filter disappears: the seeded map contributes iff `famousStar.enabled`, the Sun contributes iff `bodies.items.sun.enabled` (seeded true and never read — the inert-axis idiom `gaiaStars.labelEnabled` already uses, since hiding the render origin has no defined meaning for the sphere, bloom, and orbit foci).

**Deliberate behaviour change:** turning off the famous-star map's labels no longer mutes the Sun's caption.

**Files:**

- Create: `src/data/sources/sun.ts`
- Modify: `src/data/source.ts` (append `Sun: 26`; fix the stale "three contiguous body codes" comments at 146, 162-166, 177-179)
- Modify: `src/data/sources.ts` (register the row)
- Modify: `src/services/engine/frame/visibleStars.ts` (whole file)
- Modify: `src/services/engine/frame/passes/foregroundLabelsLayer.ts` (`labelGateFor`'s `sun` arm)
- Test: `tests/services/engine/frame/visibleStars.test.ts`, `tests/.../foregroundLabelsLayer.test.ts`

**Interfaces:**

- Consumes: Task 4's `BodySourceEntry`, `BodyId`, `BODY_IDS`, `bodies` cluster — all widen automatically.
- Produces: `Source.Sun = 26`; `SUN_ENTRY`; `BodyId` widens to `'earth' | 'planet' | 'sun'`; `bodies.items.sun`.

- [x] **Step 1: Write the failing tests**

Add to `tests/services/engine/frame/visibleStars.test.ts`:

```ts
it('keeps the Sun when the map is off because the Sun is its own row', () => {
  const state = stateWith(false);
  state.settings.bodies.items.sun.enabled = true;
  expect(visibleStars(state).map((s) => s.id)).toEqual(['sun']);
});
```

Add to `tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts`:

```ts
it('keeps the Sun caption when the famous-star map s labels are off', () => {
  const state = makeForegroundState();
  state.settings.starCatalogs.items.famousStar.labelEnabled = false;
  state.settings.bodies.items.sun.labelEnabled = true;

  const drawn = drawAndCollectLabels(state);
  expect(drawn.some((l) => l.kind === 'sun')).toBe(true);
  expect(drawn.some((l) => l.kind === 'star')).toBe(false);
});
```

The second test IS the approved behaviour change (D5/D6). It is the reason this task exists — do not "fix" it back.

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/engine/frame/visibleStars.test.ts tests/services/engine/frame/passes/foregroundLabelsLayer.test.ts`
Expected: FAIL — `bodies.items.sun` is undefined.

- [x] **Step 3: Append the Source code**

In `src/data/source.ts`, after `Constellations: 25`:

```ts
  /**
   * The Sun — the descent's aim point and the render origin, a body row in its
   * own right rather than a member of the curated star map. Modelling it as a
   * row is what lets the star map's gate be a plain membership test instead of
   * an id exemption threaded through the star layers and the caption pipeline.
   * Not persisted (a body's identity is its stable seed id) but pickable on the
   * NEAR0 pick pass via `drawPick`. Appended at 26 — never renumber the codes
   * below it.
   */
  Sun: 26,
```

Fix the three stale comments that claim the body codes are contiguous — `FamousStar` is now a star catalog and `Sun` sits past `GaiaStars`/`Constellations`:

- Line ~146 (`FamousStar`): replace "the first of the three contiguous body codes" with "The curated star-catalog twin of the survey-wide Gaia bin (code 24)."
- Lines ~162-166 (`Earth`): drop the "last of the three contiguous body codes (FamousStar=21, Planet=22, Earth=23)" clause, keeping "Codes are append-only by VALUE; the insertion order in this const is cosmetic."
- Lines ~177-179 (`GaiaStars`): drop "the first code after the three contiguous body codes (…)".

- [x] **Step 4: Add the registry row**

`src/data/sources/sun.ts`:

```ts
import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

/**
 * The Sun — the near-field descent's aim point, and the origin the whole
 * solar-system scene is expressed relative to.
 *
 * A body row rather than a member of the curated star map. The Sun used to
 * ride the famous-star seed set with an exemption at every gate that set
 * touched — the star layers' visible-set filter, the caption pipeline's target
 * derivation, its own caption kind and fade band. Modelling it as its own row
 * turns the first two of those into ordinary data: the map's gate becomes a
 * plain membership test, and the Sun's caption reads its own `labelEnabled`.
 * The caption kind and fade band stay — those are declutter and pacing
 * concerns, not visibility routing, and the Sun genuinely does out-rank every
 * other caption.
 */
export const SUN_ENTRY = {
  type: 'body',
  code: Source.Sun,
  id: 'sun',
  label: 'Sun',
  // A single body at the near-field origin, not a sky patch — allSky:true
  // matches the other non-catalog rows.
  allSky: true,
  // Always on: `bodies.items.sun.enabled` is seeded from this and never read,
  // because hiding the render origin has no defined meaning for the sphere,
  // the bloom, or the orbit foci that hang off it. The axis exists so the
  // bodies cluster keeps ONE per-item shape — the same inert-axis idiom
  // `gaiaStars.labelEnabled` uses.
  visible: true,
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Sun',
  shortLabel: 'Sun',
  plural: 'Sun',
} as const satisfies BodySourceEntry;
```

Register it in `src/data/sources.ts`: import `SUN_ENTRY` and add `[Source.Sun]: SUN_ENTRY,` after `[Source.Constellations]: CONSTELLATIONS_ENTRY,`. Registry key insertion order is load-bearing for `SOURCE_ENTRIES` iteration order, which is the panel's row order — appending puts "Sun" after "Planets" in the Labels list. If the checkpoint order (Famous Stars, Sun, Earth, Planets) is wanted, place the key beside the other body rows instead; either is correct, so pick appended and let the visual pass decide.

- [x] **Step 5: Decomplect `visibleStars`**

Replace `src/services/engine/frame/visibleStars.ts` entirely:

```ts
/**
 * visibleStars — the seeded star set the near-field star layers actually draw
 * this frame.
 *
 * Both star content rows (`starPointsLayer`, `starSpheresLayer`) feed their
 * `partitionStarsByResolution` call this set rather than `state.data.bodies.stars`
 * directly, so the gates are honoured in ONE place shared across all four call
 * sites (each layer's `enabled` gate + its `draw`), keeping the enable gate and
 * the drawn set from ever disagreeing.
 *
 * ### Two gates, no exemption
 *
 * The seed table holds the curated map AND the Sun, but they answer to
 * different rows: the map contributes iff `starCatalogs.items.famousStar.enabled`,
 * the Sun iff `bodies.items.sun.enabled`. Muting the neighbourhood therefore
 * leaves the descent's aim point on screen as a consequence of membership
 * rather than a hardcoded id exemption — the Sun is simply not in the set the
 * map's gate governs. The filter runs over the ≤130 static seed bodies, cheap
 * enough per frame; no cached array to keep in sync with a reseed.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { StarBody } from '../../../@types/scene/StarBody';

/** The Sun's id in the seeded star set — its own `bodies` row, not a map member. */
const SUN_BODY_ID = 'sun';

export function visibleStars(state: EngineState): readonly StarBody[] {
  const mapOn = state.settings.starCatalogs.items.famousStar.enabled;
  const sunOn = state.settings.bodies.items.sun.enabled;
  return state.data.bodies.stars.filter((star) => (star.id === SUN_BODY_ID ? sunOn : mapOn));
}
```

`SUN_BODY_ID` survives because the seed table is a flat star list with no per-star source tag — the id is how a reader tells the Sun's row from the map's. That is a lookup key, not an exemption.

- [x] **Step 6: Point the Sun caption at its own row**

In `foregroundLabelsLayer.ts`'s `labelGateFor`, split the `sun` case off from `star`:

```ts
        case 'sun':
          return bodyItems.sun.labelEnabled;
        case 'star':
          return starMapRow.labelEnabled;
```

Update the module docblock's stage-1 paragraph: the Sun's caption is now gated by its own body row and paced by its own `sunCaption` band — it no longer rides the star map's switch.

Add `'sun'` to the container's label rows implicitly (it arrives via `LABEL_CATEGORIES`) — no container edit needed.

- [x] **Step 7: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS. Seed `bodies.items.sun` in `makeSettingsFixture.ts`.

- [x] **Step 8: Commit**

```bash
git add src/data/source.ts src/data/sources.ts src/data/sources/sun.ts src/services/engine/frame/visibleStars.ts src/services/engine/frame/passes/foregroundLabelsLayer.ts tests
git commit -m "feat(bodies): model the Sun as its own row, dissolving its gate exemption"
```

---

### Task 6: Tour snapshot carries the new label homes

Today the tour captures `labels`, which held `starLabelsEnabled` / `planetLabelsEnabled`. Those fields are gone, so without this task a tour that muted captions would no longer restore them. Adding `starCatalogs` and `bodies` to the snapshot restores the round-trip.

**Files:**

- Modify: `src/@types/engine/settings/SettingsSnapshot.d.ts`
- Modify: `src/state/tour/captureSettings.ts`
- Test: `tests/state/tour/captureSettings.test.ts` (create or extend)

**Interfaces:**

- Consumes: Tasks 3–4's clusters.
- Produces: `SettingsSnapshot` picks ten clusters instead of eight.

- [x] **Step 1: Write the failing test**

```ts
/**
 * The tour mutates caption visibility during playback and must put it back.
 * When those bits moved out of the `labels` cluster the snapshot's Pick list
 * stopped covering them — this asserts the round-trip, which no compiler check
 * can (a missing Pick member is a smaller type, not an error).
 */
import { describe, it, expect } from 'vitest';
import { captureSettings } from '../../../src/state/tour/captureSettings';
import { makeSettingsFixture } from '../settings/makeSettingsFixture';

describe('captureSettings', () => {
  it('captures the per-body and per-star-catalog label gates', () => {
    const settings = makeSettingsFixture();
    settings.bodies.items.earth.labelEnabled = false;
    settings.starCatalogs.items.famousStar.labelEnabled = false;

    const snap = captureSettings({ settings });

    expect(snap.bodies.items.earth.labelEnabled).toBe(false);
    expect(snap.starCatalogs.items.famousStar.labelEnabled).toBe(false);
  });

  it('detaches the capture from later mutation', () => {
    const settings = makeSettingsFixture();
    const snap = captureSettings({ settings });
    settings.bodies.items.earth.labelEnabled = false;

    expect(snap.bodies.items.earth.labelEnabled).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/state/tour/captureSettings.test.ts`
Expected: FAIL — `snap.bodies` is undefined.

- [x] **Step 3: Widen the snapshot**

`src/@types/engine/settings/SettingsSnapshot.d.ts` — add two `Pick` members and two docblock bullets:

```ts
 *   - `starCatalogs`   — star-catalog gates + per-catalog caption toggles.
 *   - `bodies`         — per-body visibility + caption toggles.
```

```ts
export type SettingsSnapshot = Readonly<
  Pick<
    EngineSettingsState,
    | 'galaxyCatalogs'
    | 'structures'
    | 'volumes'
    | 'filaments'
    | 'milkyWay'
    | 'flow'
    | 'orbitTrails'
    | 'starCatalogs'
    | 'bodies'
    | 'labels'
  >
>;
```

Note in that docblock that `starCatalogs` brings its shared look knobs (`sizePx`, `brightness`, the exposure anchors) into the capture along with the gates — the module already captures whole clusters with zero per-field projection, and the same is true of `galaxyCatalogs` today, so this is consistent rather than a new policy.

`src/state/tour/captureSettings.ts` — destructure and clone the two new clusters; update the "eight tour-owned settings clusters" phrasing to "ten".

- [x] **Step 4: Verify and commit**

Run: `npm test && npm run typecheck`
Expected: PASS.

```bash
git add src/@types/engine/settings/SettingsSnapshot.d.ts src/state/tour/captureSettings.ts tests/state/tour/captureSettings.test.ts
git commit -m "fix(tour): capture the body and star-catalog label gates"
```

---

### Task 7: One uniform row array in the panel

The section currently sums its master tri-state across two differently-shaped collections because six rows derive from `bearsLabel` and four were hand-authored. After Tasks 3–5 only two hand-authored rows remain — `constellations` and `orbitTrails`, which are genuine _layer_ gates, not labels. Both shapes collapse to one row array built by the container.

**Files:**

- Create: `src/@types/components/SectionRow.d.ts`
- Modify: `src/components/SettingsPanel/LabelsAndGuidesSection.tsx` (whole file)
- Modify: `src/components/containers/LabelsAndGuidesSectionContainer.tsx`
- Test: `tests/components/SettingsPanel/LabelsAndGuidesSection.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces: `type SectionRow = { id: string; label: string; enabled: boolean; onChange: (enabled: boolean) => void }`; `LabelsAndGuidesSectionProps = { rows: ReadonlyArray<SectionRow> }`. `NonCategoryRow` is deleted.

- [x] **Step 1: Rewrite the section test**

Replace `tests/components/SettingsPanel/LabelsAndGuidesSection.test.ts`'s prop construction with the single `rows` array. Keep whatever the file already asserts about the tri-state master — that logic is the reason the component has a test at all. The master derivation is now one reduce over one array, so the assertions simplify but must still cover: all-on, all-off, mixed, and that clicking a mixed master clears everything.

```ts
const rows = [
  { id: 'toggle-label-cluster', label: 'Clusters', enabled: true, onChange: vi.fn() },
  { id: 'toggle-label-sun', label: 'Sun', enabled: false, onChange: vi.fn() },
  { id: 'toggle-constellations', label: 'Constellations', enabled: true, onChange: vi.fn() },
];
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/SettingsPanel/LabelsAndGuidesSection.test.ts`
Expected: FAIL — the component still requires `labelCategoryVisibility`.

- [x] **Step 3: Create the row type**

`src/@types/components/SectionRow.d.ts`:

```ts
/**
 * SectionRow — one labelled checkbox in a SettingsPanel section.
 *
 * The section renders rows and derives its master tri-state from them; it does
 * not know which settings cluster any row came from. That knowledge lives in
 * the container, which is the only place that can hold it without dragging
 * store imports into a presentational component. `id` is the checkbox element
 * id (and the label's `htmlFor`).
 */
export type SectionRow = {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly onChange: (enabled: boolean) => void;
};
```

- [x] **Step 4: Rewrite the section**

`src/components/SettingsPanel/LabelsAndGuidesSection.tsx`:

```tsx
// src/components/SettingsPanel/LabelsAndGuidesSection.tsx
/**
 * LabelsAndGuidesSection — presentational component for the Labels & Guides
 * thematic group inside the SettingsPanel.
 *
 * Renders a tri-state master toggle on the section header and one checkbox per
 * row in the body. Every row is the same shape whether it gates a label or a
 * guide overlay, so the master is one reduce over one array — the section has
 * no notion of "category rows" versus anything else. The container resolves
 * each row's settings home; this component only knows that a row is a labelled
 * boolean with a setter.
 *
 * Isolating this into its own component ensures a toggle re-renders ONLY this
 * section rather than the entire HUD.
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when the container's parent re-renders for an unrelated reason,
 * `memo` bails on the prop-compare step. The container's `useMemo`'d row array
 * has stable identity while its inputs are unchanged, making the bail effective.
 */

import { memo } from 'react';
import CollapsibleSection from './CollapsibleSection';
import styles from './SettingsPanel.module.css';
import type { SectionRow } from '../../@types/components/SectionRow';

type LabelsAndGuidesSectionProps = {
  /** Every checkbox the section renders, in display + master-derivation order. */
  rows: ReadonlyArray<SectionRow>;
};

function LabelsAndGuidesSection({ rows }: LabelsAndGuidesSectionProps) {
  // Tri-state click convention (Windows Explorer / Finder / GitHub file-tree):
  //   "none" → set all on; "all" or "mixed" → clear everything.
  const enabledCount = rows.reduce<number>((n, row) => (row.enabled ? n + 1 : n), 0);
  const allOn = rows.length > 0 && enabledCount === rows.length;
  const noneOn = enabledCount === 0;

  return (
    <CollapsibleSection
      title="Labels & Guides"
      headerToggle={allOn}
      headerToggleIndeterminate={!allOn && !noneOn}
      onHeaderToggleChange={() => {
        const targetEnabled = noneOn;
        for (const row of rows) row.onChange(targetEnabled);
      }}
    >
      {rows.map((row) => (
        <div className={styles.panelRow} key={row.id}>
          <label htmlFor={row.id}>{row.label}</label>
          <input
            id={row.id}
            type="checkbox"
            className={styles.toggle}
            checked={row.enabled}
            onChange={(e) => row.onChange(e.target.checked)}
          />
        </div>
      ))}
    </CollapsibleSection>
  );
}

export default memo(LabelsAndGuidesSection);
```

- [x] **Step 5: Build the rows in the container**

In `LabelsAndGuidesSectionContainer.tsx`, replace `labelCategoryVisibility` + `nonCategoryRows` with one memo. Element ids stay `toggle-label-<cat>` so existing selectors keep working:

```tsx
const rows: ReadonlyArray<SectionRow> = useMemo(
  () => [
    // The label rows, one per bearsLabel source — display text comes from the
    // registry (`plural`), so a new label-bearing source appears here with no
    // edit at all.
    ...LABEL_CATEGORIES.map((cat) => ({
      id: `toggle-label-${cat}`,
      label: CATEGORY_DISPLAY_INFO[cat].plural,
      enabled: labelCategoryVisibility[cat],
      onChange: (enabled: boolean) => onSetLabelCategoryVisibility(cat, enabled),
    })),
    // The guide rows. These are the only genuinely hand-authored entries left:
    // they gate LINE OVERLAYS, not labels, so they have no registry row's
    // label axis to derive from.
    {
      id: 'toggle-constellations',
      label: 'Constellations',
      enabled: constellationsEnabled,
      onChange: onToggleConstellations,
    },
    {
      id: 'toggle-orbit-trails',
      label: 'Orbit trails',
      enabled: orbitTrailsEnabled,
      onChange: onToggleOrbitTrails,
    },
  ],
  [
    labelCategoryVisibility,
    onSetLabelCategoryVisibility,
    constellationsEnabled,
    onToggleConstellations,
    orbitTrailsEnabled,
    onToggleOrbitTrails,
  ],
);

return <LabelsAndGuidesSection rows={rows} />;
```

Import `LABEL_CATEGORIES` and `CATEGORY_DISPLAY_INFO` here (they leave the section). Update the container docblock's "### Label-visibility projection" section to describe the row assembly.

- [x] **Step 6: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS. Any test that queried `toggle-label-stars` / `toggle-label-planets` moves to `toggle-label-famousStar` / `toggle-label-planet`.

- [x] **Step 7: Commit**

```bash
git add src/@types/components/SectionRow.d.ts src/components/SettingsPanel/LabelsAndGuidesSection.tsx src/components/containers/LabelsAndGuidesSectionContainer.tsx tests/components/SettingsPanel/LabelsAndGuidesSection.test.ts
git commit -m "refactor(settings-panel): one uniform row array for Labels & Guides"
```

---

### Task 8: Align the famous-star meta with the galaxy-catalog path

**Adjacent alignment, not required by the label feature.** Promoted from an adjacent
finding at the user's call: `famous_meta.json` rides the standard asset-slot machinery
(`famousMetaSlot`, `AssetKey: 'famousMeta'`, a slot on `EngineAssetSlots`, subscriber
writing `state.data.galaxies.setFamousMeta`), while `famous_stars_meta.json` has no slot
at all — `useFamousStarsMeta` calls the fetcher directly, a choice its own docblock
records ("We call the fetcher directly rather than routing through the engine's slot
wiring — same payload either way"). Now that `famousStar` is a `starCatalog` row beside
`famousGalaxy`'s `galaxyCatalog` row, the two curated sources should load their sidecars
the same way. Its own commit, distinct from both the prep and the feature diffs.

**Files:**

- Create: `src/services/loading/slots/famousStarsMetaSlot.ts`
- Modify: `src/@types/loading/AssetKey.d.ts` (add `'famousStarsMeta'`)
- Modify: `src/@types/engine/state/EngineAssetSlots.d.ts` (add the slot field)
- Modify: `src/@types/engine/data/BodyStore.d.ts` (add `famousStarsMeta` + `setFamousStarsMeta`)
- Modify: the `BodyStore` implementation (find it with `grep -rn "createBodyStore" src`)
- Modify: the boot path that mints `famousMeta` (find with `grep -rn "createFamousMetaSlot" src`)
- Modify: `src/hooks/useFamousStarsMeta.ts`
- Test: `tests/services/loading/slots/famousStarsMetaSlot.test.ts` (create)

**Interfaces:**

- Consumes: Task 3's `famousStar` star-catalog row (nothing else — this task is otherwise independent and could land on its own).
- Produces: `createFamousStarsMetaSlot: SlotFactory<FamousStarsPayload, CompanionAssetReq>`; `state.assetSlots.famousStarsMeta`; `state.data.bodies.famousStarsMeta` + `setFamousStarsMeta`.

- [x] **Step 1: Write the failing test**

`tests/services/loading/slots/famousStarsMetaSlot.test.ts` — the fail-soft contract is the
part worth testing: a missing sidecar must leave the engine running with an empty array,
which is exactly the branch a naive slot would let throw.

```ts
/**
 * The slot's contract is graceful degradation: the fetcher throws on HTTP
 * failure so a retry policy can branch on status, and the slot's subscriber
 * maps that to "feature off" by writing an empty array. A deployment without
 * `famous_stars_meta.json` must still render stars, just without enriched
 * InfoCard text.
 */
import { describe, it, expect, vi } from 'vitest';
import { createFamousStarsMetaSlot } from '../../../../src/services/loading/slots/famousStarsMetaSlot';

function fakeState() {
  return {
    data: { bodies: { setFamousStarsMeta: vi.fn() } },
  } as never;
}

describe('createFamousStarsMetaSlot', () => {
  it('writes the parsed meta into the body store on success', async () => {
    const state = fakeState();
    const slot = createFamousStarsMetaSlot(state, () => {});
    await slot.load({ tier: 'medium' });

    expect(state.data.bodies.setFamousStarsMeta).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'sun' })]),
    );
  });

  it('writes an empty array when the sidecar is missing', async () => {
    const state = fakeState();
    const slot = createFamousStarsMetaSlot(state, () => {});
    await slot.load({ tier: 'medium' }).catch(() => {});

    expect(state.data.bodies.setFamousStarsMeta).toHaveBeenCalledWith([]);
  });
});
```

Stub `fetch` per case (resolve with the JSON body; reject / 404 for the second). Match
however `tests/services/loading/` already stubs it — read a neighbouring slot test first
and reuse its harness rather than inventing one.

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/services/loading/slots/famousStarsMetaSlot.test.ts`
Expected: FAIL — "Failed to resolve import ... famousStarsMetaSlot".

- [x] **Step 3: Add the body-store field**

Mirror `GalaxyStore`'s `famousMeta` / `setFamousMeta` pair on `BodyStore`: a
`readonly famousStarsMeta: readonly FamousStarMetaEntry[]` defaulting to `[]`, and a
`setFamousStarsMeta(meta: readonly FamousStarMetaEntry[]): void` setter. Read
`GalaxyStore`'s pair and its implementation first, and match their shape exactly — the
point of this task is that the two are the same.

- [x] **Step 4: Create the slot**

`src/services/loading/slots/famousStarsMetaSlot.ts`:

```ts
/**
 * famousStarsMetaSlot — factory for the famous-star meta sidecar.
 *
 * Carries `famous_stars_meta.json` through the standard asset-slot machinery,
 * the star twin of `famousMetaSlot`. The two curated sources — the famous
 * galaxies and the famous stars — now load their sidecars by the same path,
 * so neither has a bespoke fetch to reason about.
 *
 * No `commit` step: there's nothing GPU-side to upload — the payload is pure
 * metadata consumed by the InfoCard via `state.data.bodies.famousStarsMeta`.
 * The subscriber writes the field; the render wake is `installSlotReadyWake`'s
 * job, not the factory's.
 *
 * **Graceful degradation on error.** The fetcher throws on HTTP failure (so
 * the retry policy distinguishes "really gone" from "transient flake"), and
 * this subscriber maps `kind: 'error'` → "feature off" by writing an empty
 * array. Net effect: the stars render without enriched InfoCard text, and the
 * engine keeps running.
 */

import { createAssetSlot } from '../AssetSlot';
import { famousStarsMetaFetcher } from '../fetchers/famousStarsMetaFetcher';
import type { FamousStarsPayload } from '../../../@types/loading/FamousStarsPayload';
import type { CompanionAssetReq } from '../../../@types/loading/CompanionAssetReq';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createFamousStarsMetaSlot: SlotFactory<FamousStarsPayload, CompanionAssetReq> = (
  state,
  _cb,
) => {
  const slot = createAssetSlot({
    name: 'famous-stars-meta',
    fetch: famousStarsMetaFetcher,
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      state.data.bodies.setFamousStarsMeta(s.value.meta);
    }
    if (s.kind === 'error') {
      // Defensive — the field defaults to `[]` already, but writing it again
      // here is explicit about the contract: missing sidecar disables enriched
      // InfoCard text but keeps the engine functional.
      state.data.bodies.setFamousStarsMeta([]);
      console.warn('[engine] famous-stars sidecar failed to load:', s.error);
    }
  });
  return slot;
};
```

- [x] **Step 5: Wire the slot**

Add `'famousStarsMeta'` to `AssetKey`, and a `famousStarsMeta: AssetSlot<FamousStarsPayload, CompanionAssetReq> | null` field to `EngineAssetSlots` with a docblock mirroring `famousMeta`'s. Mint and eagerly load it wherever `createFamousMetaSlot` is minted and loaded — same boot position, same eagerness (the JSON is tiny, and the InfoCard depends on the meta being present whenever a famous star is hovered).

- [x] **Step 6: Point the hook at the slot**

`useFamousStarsMeta` stops calling the fetcher. Read whatever bridge `useFamousMeta`'s
galaxy-side equivalent uses to surface engine store state to React and use the same one;
if `useFamousMeta` also still fetches directly, leave both hooks alone and note it — the
engine-side slot is the deliverable here, and converting both hooks is a separate
consistency pass.

Delete the "We call the fetcher directly rather than routing through the engine's slot
wiring — same payload either way" comment either way: it is no longer true of the
loading path.

- [x] **Step 7: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS. Existing `famousStarsMetaFetcher` tests are untouched — the fetcher itself does not change.

- [x] **Step 8: Commit**

```bash
git add src/services/loading/slots/famousStarsMetaSlot.ts src/@types/loading/AssetKey.d.ts src/@types/engine/state/EngineAssetSlots.d.ts src/@types/engine/data/BodyStore.d.ts src/hooks/useFamousStarsMeta.ts tests/services/loading/slots/famousStarsMetaSlot.test.ts
git add <the BodyStore implementation and the boot path touched in Steps 3 and 5>
git commit -m "refactor(loading): route the famous-star meta through an asset slot"
```

---

### Task 9: Entanglement radar + visual verification

**Files:** none created. This task produces a review and any follow-up fixes.

- [x] **Step 1: Run the radar over the whole diff**

Invoke the `entanglement-radar` skill with scope `git diff main...HEAD`. Report findings; apply only those that are real knots introduced by this change (a pre-existing documented knot gets referenced, not re-reported).

Specifically check the two places this change could have introduced a braid:

- `labelGateFor`'s switch in `foregroundLabelsLayer` — it is a second dispatch on caption kind beside `CAPTION_PRIORITY`. If both now enumerate the same union, consider whether the gate belongs as a field on `ForegroundCaption` (produced once by `sceneBodyLabels`, which already knows each caption's source) rather than re-derived in the layer.
- The `as StructureId` / `as BodyId` casts in `LABEL_HOME_BY_SOURCE_TYPE` — five of them now. Confirm the registry lookup that selects the row is genuinely what makes each cast sound, and that the comment says so.

- [x] **Step 2: Confirm the type-level fade coverage test still passes**

Run: `npm test -- fadeLayers`
Expected: the assertion that `FADE_LAYERS`' keys exactly cover `VisibilityLayerKey` passes with `starCatalogLabel` and `bodyLabel` present.

- [x] **Step 3: Visual pass**

Start the dev server (`/dev`) and ask the user to confirm:

- The Labels & Guides section shows ten label rows (Clusters, Superclusters, Voids, Groups, Famous Galaxies, Milky Way, Famous Stars, Earth, Planets, Sun) plus two guide rows (Constellations, Orbit trails).
- Toggling "Famous Stars" leaves the Sun's caption visible; toggling "Sun" mutes it.
- The Sun's sphere is unaffected by every toggle.
- The Stars section's famous-star row still gates the seeded map.

- [x] **Step 4: Run `/feature-done`**

Gate on the DoD, then relocate `docs/superpowers/plans/2026-07-28-body-sources-bear-labels.md` → `plans/completed/` and `docs/superpowers/specs/2026-07-28-body-sources-bear-labels.md` → `specs/completed/`, in the same PR (per `feedback_feature_done_before_merge`).

---

## Self-review notes

**Spec coverage.** Every spec section maps to a task: Registry entries → 3/4/5; Settings shape → 3/4; Prep → 1; Fade identity and intents → 2/3/4; Sun decomplection → 5; Panel → 7; Testing → the test steps of 3/4/5/6; Verification → 9. Task 8 is outside the spec — an adjacent finding the user promoted (see its preamble). The spec's "Out of scope" list is respected — no `bodies.enabled`, no live `sun.enabled`, no per-item `VisibilityLayerKey`s, no Earth look-dial move, no `bearsMarker` change, no Labels/Guides subheadings.

**One spec item deliberately extended:** Task 6 (tour snapshot) is listed in the spec only as a test, but the `labels` cluster shrink makes it a required code change or the round-trip silently regresses.

**Type consistency.** `LabelHome` / `LabelHomes` / `LabelBearingSourceType` / `LABEL_HOME_BY_SOURCE_TYPE` are spelled identically in Tasks 1, 3, 4. `BodyId` / `BODY_IDS` / `BodyItemSettings` in Tasks 4, 5. `SectionRow` in Task 7. `starCatalogLabel` / `bodyLabel` in Tasks 3, 4, 8. `setBodyLabelEnabled` is defined in Task 4 Step 5 and used in Steps 6 and 7 of the same task and in Task 5.
