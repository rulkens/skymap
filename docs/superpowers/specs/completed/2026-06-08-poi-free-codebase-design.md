# Make the codebase `poi`-free — design

**Date:** 2026-06-08
**Status:** design (awaiting plan)
**Worktree/branch:** `worktree-make-codebase-poi-free`
**Backlog item:** "Make the codebase `poi`-free (`poi*` → `structure*`)" (Priority: high)

## Motivation

The data layer is already `StructureRecord` / `StructureStore` and the InfoCard
family is `StructureDetailCard` / `CompactStructureCard`. The legacy `poi`
("point of interest") vocabulary survives at the engine / identity / URL edges.
An `entanglement-radar` pass (2026-06-08) found the wart is sharper than a
straight rename: **`poi` is one name for two genuinely different concepts**, and
a blind `poi → structure` rename would silently merge them.

### Concept A — `poi` already _means_ "structure"

These sites are about structures specifically; renaming to `structure` makes the
name **more** accurate:

- `isPoi(t): t is StructureRecord` — the predicate literally returns `StructureRecord`.
- `resolvePoiFromPick → StructureRecord`, `PickPoiInput`, `poiIndex` (ring-pick decode).
- `poiUrl.ts` / `parsePoiHash` / `poiIdToHash` / `#poi=` — encodes `StructureRecord.id`.
- `FocusState.poiId` — the focused structure id (membership cache key).
- `selectedPoi` engine param (`selectionRingPass`, `EngineSubsystemHandles`).
- `STRUCTURE_POI_STYLES` / `structurePoiStyles.ts` — already keyed by `StructureCategory`.

### Concept B — `poi` means "the focusable category superset"

`PoiCategory = StructureCategory | 'famousGalaxy'` is **not** a synonym for
`structure` — it is a strict superset including `famousGalaxy`. A mechanical
`Poi → Structure` rename here is a type collision (`StructureCategory` exists)
**and** a semantic lie (drops `famousGalaxy`). This type keys the SettingsPanel
**label/marker visibility toggles**.

Tracing why `famousGalaxy` is a member exposes the actual braid
(`engine.ts:261-323`):

- **Labels:** `famousGalaxy` _does_ bear labels (routed to the `galaxyNames`
  fade layer); structures bear labels (routed to the structure label layer).
- **Markers:** `famousGalaxy` has **no** ring/halo marker — the marker toggle
  for it is a dead no-op; only structures bear markers.

So the two real axes are different sets:

- **label-bearing** = `{famousGalaxy, cluster, supercluster, void, group}`
- **marker-bearing** = `{cluster, supercluster, void, group}` (structures only)

The current code crushes both into one `PoiCategory` union and pays for it with
`if (category === 'famousGalaxy')` branches and a **phantom `famousGalaxy` key**
in the marker visibility record. "Having a label / having a marker" is a
_property of the thing_, not a category that singles out famous galaxies — which
is exactly what makes `famousGalaxy` look out of place in the union.

## Goals

1. No `poi`/`Poi`/`POI` identifier, filename, or doc-comment survives in `src/`
   or the mirrored `tests/`. (`tools/` is already clean.)
2. `PoiCategory` and the `famousGalaxy` special-casing **dissolve** into
   registry-derived data — `famousGalaxy` becomes "just a row" with capability
   flags, not a hand-listed exception.
3. The `#poi=` deep-link folds entirely into `#focus=`; the `poiUrl` codec is
   deleted.

## Non-goals

- No back-compat for old `#poi=` shared links — they intentionally fall through
  to "no deep link" (decided 2026-06-08).
- No change to the structure data layer, `.ccat` format, or the `Source.Cluster`
  /`'cluster'` category vocabulary (already `Structure*`-clean).
- No render/visual behaviour change. The label & marker toggles behave
  identically; only the marker record sheds its dead `famousGalaxy` key.

---

## Part A — Dissolve `PoiCategory` into two registry-derived axes

### A1. Registry capability flags

Add to `SOURCE_REGISTRY` rows (via `SourceEntryBase` or per-variant):

```ts
// SourceEntryBase additions
/** True if this category carries toggleable on-screen text labels. */
readonly bearsLabel: boolean;
/** True if this category carries a ring/halo marker (structures only today). */
readonly bearsMarker: boolean;
/**
 * Which fade layer this category's labels live on. Present iff bearsLabel.
 *  - 'galaxyNames' — the shared galaxy-name layer (famousGalaxy)
 *  - 'structure'   — the per-structure-category label layer
 */
readonly labelLayer?: 'galaxyNames' | 'structure';
```

Settings per row:

| row                                 | bearsLabel | bearsMarker | labelLayer    |
| ----------------------------------- | ---------- | ----------- | ------------- |
| famousGalaxy                        | true       | false       | 'galaxyNames' |
| cluster                             | true       | true        | 'structure'   |
| supercluster                        | true       | true        | 'structure'   |
| void                                | true       | true        | 'structure'   |
| group                               | true       | true        | 'structure'   |
| sdss/glade/2mrs/milliquas/synthetic | false      | false       | —             |

### A2. Display metadata folded into the registry

The standalone `data/poiCategoryInfo.ts` (`POI_CATEGORY_INFO`, `PoiCategoryInfo`)
is **removed**. Its three fields move onto the label-bearing registry rows. The
existing `SourceEntryBase.label` already holds the short UI name
(`'Cluster'`, `'Famous'`), so only the longer + plural forms are new:

```ts
// SourceEntryBase additions (present iff bearsLabel)
/** Long form for detail surfaces ("Galaxy Cluster"). */
readonly detailLabel?: string;
/** Plural for list/toggle headers ("Clusters"). */
readonly plural?: string;
```

Mapping from the old table: old `shortLabel` ≡ existing `label`; old `label`
→ `detailLabel`; old `plural` → `plural`. (Note `famousGalaxy`'s existing
registry `label` is `'Famous'` but its old `shortLabel` was `'Galaxy'` — the
detail/short copy is reconciled in the plan; default to the old display-table
strings since those are what the UI renders today.)

A derived accessor (e.g. `categoryDisplayInfo(id)` or a derived
`CATEGORY_DISPLAY_INFO` map built from the registry) replaces every
`POI_CATEGORY_INFO[cat]` read.

### A3. Derived category sets + types

Derive from the registry (companion to `structureCategories.ts`):

```ts
// data/labelCategories.ts (new) — label-bearing rows, registry order
export const LABEL_CATEGORIES = /* registry rows where bearsLabel */;
export type LabelCategory = (typeof LABEL_CATEGORIES)[number];
// = 'famousGalaxy' | 'cluster' | 'supercluster' | 'void' | 'group'
```

- `LabelCategory` **replaces `PoiCategory`** (honest name; still contains
  `famousGalaxy` because famous galaxies genuinely _are_ the labelled galaxies —
  that is data, not a special case). `@types/engine/data/PoiCategory.d.ts` is
  deleted.
- The **marker** axis narrows to `StructureCategory` (markers are structure-only).

### A4. Visibility records re-typed

- `labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>`
- `markerCategoryVisibility: Readonly<Record<StructureCategory, boolean>>`
  — **drops the phantom `famousGalaxy` key.**

Touches `EngineSettingsState`, `UseEngineSettingsState`, `EngineCallbacks`,
`SettingsCallbackSeed`, `Selection`, `EngineLabelsHandle`, `useEngineSettings`,
`SettingsPanel`, `engine.ts` defaults, the 4 test fixtures. The hand-written
`{ famousGalaxy: true, cluster: true, ... }` default literals derive from the
category sets instead (also retires the backlog's "copy-pasted 8×
DEFAULT_CATEGORY_VISIBILITY" sub-item for these records).

### A5. Setters de-special-cased

- `setCategoryMarkerVisible(category: StructureCategory, …)` — the
  `if (category !== 'famousGalaxy')` no-op guard is **deleted**.
- `setCategoryLabelVisible(category: LabelCategory, …)` — fires the fade on the
  layer named by the row's `labelLayer` field (A1), replacing the
  `if (category === 'famousGalaxy')` branch. `galaxyNames` → fade
  `{kind:'labelLayer', layer:'galaxyNames'}` (plus `setFamousLabelsVisible`);
  `structure` → fade `{kind:'labelLayer', layer:'<structure>', category}`.

---

## Part B — Fold `#poi=` into `#focus=`

`camera.focusOn()` is already unified (accepts `GalaxyInfo | StructureRecord`),
so only the URL codec layer is split.

### B1. Single codec

- **Delete** `services/url/poiUrl.ts` (`parsePoiHash`, `poiIdToHash`) and its
  test.
- `FocusTarget` gains a structure variant:

  ```ts
  export type FocusTarget =
    | { kind: 'famous'; id: string }
    | { kind: 'pgc'; pgc: bigint }
    | { kind: 'sdss'; objID: bigint }
    | { kind: 'pos'; raDeg: number; decDeg: number }
    | { kind: 'structure'; id: string }; // NEW
  ```

- `parseFocusHash`: a `focus=` body whose id begins with a structure-category
  prefix (`cluster-` / `supercluster-` / `void-` / `group-`) parses to
  `{ kind: 'structure', id }`; otherwise the existing galaxy ladder is unchanged.
  (Galaxy famous-ids never use those prefixes, so no collision.)
- `selectionToFocusId`: for a structure selection, return `info.id` verbatim
  (structure ids are already curated + stable, e.g. `cluster-virgo-m87`); the
  galaxy ladder is unchanged.

### B2. `hasDeepLink`

Drop the `#poi=` branch. The `#focus=` branch now also covers structures.

### B3. `useUrlSync`

Keep the **two pending slots** — galaxy resolution is async against loaded
catalogs; structure resolution is a synchronous table lookup. They are genuinely
different resolution sources and must not be complected. The fold is purely at
the codec/parse-routing level:

- `initialPendingFromHash` parses one `#focus=` hash; a `kind:'structure'`
  result routes to the structure slot, everything else to the galaxy slot. The
  second parser call (`parsePoiHash`) is removed.
- `InitialPending`'s `{ kind: 'poi'; poiId }` → `{ kind: 'structure'; id }`.
- Slot/state rename: `pendingPoiId` → `pendingStructureId`.
- `computeDesiredHash`: a structure target writes `focus=<id>` (via
  `selectionToFocusId`), not `poi=<id>`.

---

## Part C — Mechanical `poi → structure` renames

All sites where `poi` already means "structure":

| Now                                                                                 | Becomes                                                                                           |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `services/engine/isPoi.ts` `isPoi()`                                                | `isStructure.ts` `isStructure()`                                                                  |
| `resolvePoiFromPick.ts`, `resolvePoiFromPick`, `PickPoiInput`, `poiIndex`           | `resolveStructureFromPick.ts`, `resolveStructureFromPick`, `PickStructureInput`, `structureIndex` |
| `structurePoiStyles.ts`, `STRUCTURE_POI_STYLES`                                     | `structureMarkerStyles.ts`, `STRUCTURE_MARKER_STYLES`                                             |
| `FocusState.poiId`                                                                  | `FocusState.structureId`                                                                          |
| `FocusState.category: 'cluster'\|'supercluster'\|'void'`                            | `StructureCategory` (also picks up the missing `group`)                                           |
| `selectedPoi` param (`selectionRingPass`, `EngineSubsystemHandles`, `engine.ts`)    | `selectedStructure`                                                                               |
| `structureMarkerRenderer` `poiIndex` packing / `StructureMarkerRenderer` `poiIndex` | `structureIndex`                                                                                  |
| `produceStructureMarkers` `poiIndex`                                                | `structureIndex`                                                                                  |
| `CreateClickResolverInput` `poiIndex`                                               | `structureIndex`                                                                                  |

Plus all `poi`/`POI` in doc-comments (`commitGalaxyFocus`, `commitStructureFocus`,
`clearAll`, `selectionSubsystem`, `buildStaticAnchorStructures`,
`structureMembership`, `assetWiring`, `FocusState`, …).

Test files renamed to match: `isPoi.test.ts` → `isStructure.test.ts`,
`resolvePoiFromPick.test.ts` → `resolveStructureFromPick.test.ts`,
`wireInput.poi.test.ts` → `wireInput.structure.test.ts`,
`pickRenderer.poi.test.ts` → `pickRenderer.structure.test.ts`,
`EngineCameraHandle.poi.test.ts` → `EngineCameraHandle.structure.test.ts`,
`poiCategories.test.ts` → `labelCategories.test.ts` (re-scoped to the derived
sets). `poiUrl.test.ts` is **deleted**; its structure-id round-trip cases move
into `focusUrl.test.ts`.

---

## Type changes (contract)

```ts
// @types/engine/data/LabelCategory.d.ts (replaces PoiCategory.d.ts)
export type LabelCategory = (typeof LABEL_CATEGORIES)[number];

// @types/camera/FocusTarget.d.ts — add the structure variant (B1)

// @types/engine/state/FocusState.d.ts
readonly structureId: string;          // was poiId
readonly category: StructureCategory;  // was 'cluster' | 'supercluster' | 'void'

// @types/settings/EngineSettingsState.d.ts
readonly labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
readonly markerCategoryVisibility: Readonly<Record<StructureCategory, boolean>>;

// @types/data/SourceEntryBase.d.ts — add bearsLabel, bearsMarker, labelLayer?,
//                                     detailLabel?, plural? (A1, A2)
```

## Testing

- The rename is type-driven: a missed Concept-A/B site won't compile.
  `npm run typecheck` + the full `npm test` suite are the safety net.
- New `focusUrl` tests: `#focus=cluster-virgo-m87` ↔ `{kind:'structure'}`
  round-trip; each structure-category prefix; galaxy ladder regression
  unaffected; a structure id is never mis-parsed as a famous id.
- New test: a `#poi=…` hash now yields no deep link (documents the intentional
  break) — added to `hasDeepLink` / `focusUrl` tests.
- New `labelCategories` test: `LABEL_CATEGORIES` / `MARKER_CATEGORIES` derive
  the expected sets from the registry; the marker set excludes `famousGalaxy`.
- `setCategoryMarkerVisible` / `setCategoryLabelVisible` tests updated for the
  narrowed types and the `labelLayer`-driven routing.

## Execution

Per project workflow: `subagent-driven-development`. Edits delegated to
background implementer subagents; the main thread runs `npm test` /
`typecheck`, prettiers touched files, and commits. Branch + PR (squash-merge).
No data rebuild or R2 sync — this is code-only (the `cluster*→structure*`
artifact rename from #280 already handled the deploy side).

## Out of scope (follow-ups)

- The broader `STRUCTURE_CATEGORY_META` DRY consolidation beyond the display-info
  fold done here (the `hasBulkCatalog` flag, the `POI_CATEGORIES_WITH_MARKERS`
  derivation) — see `docs/BACKLOG.md`.
- Promoting the Milky Way to a first-class `Source` — separate backlog item.
