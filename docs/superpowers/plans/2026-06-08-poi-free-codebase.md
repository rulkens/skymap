# Make the codebase `poi`-free — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all `poi`/`Poi`/`POI` vocabulary from `src/` + mirrored `tests/`, dissolving the two distinct concepts it hid (the label/marker category superset, and "structure") into honest, registry-derived names.

**Architecture:** Three phases. **A** dissolves `PoiCategory` into registry-derived capability flags (`bearsLabel`/`bearsMarker`/`labelLayer`) + a derived `LabelCategory` type, narrows the marker axis to `StructureCategory`, folds the display-metadata table into `SOURCE_REGISTRY`, and de-special-cases the visibility setters. **B** folds the `#poi=` deep-link into `#focus=` (deletes the `poiUrl` codec, adds a `structure` variant to `FocusTarget`). **C** is the mechanical `poi → structure` rename of every site where `poi` already means "structure". Keep build + typecheck green at every commit.

**Tech Stack:** TypeScript, Vite, React, Vitest. Source of truth: `docs/superpowers/specs/2026-06-08-poi-free-codebase-design.md`. Plan style: `docs/superpowers/conventions/plan-style.md` (contract code only — signatures + test names; no implementation bodies; cite files, don't paste).

**Execution notes:** Executing subagents cannot run `npm`/`npx`; the main thread runs `npm test -- <path>` / `npm run typecheck` and commits. Stage specific paths only (never `git add -A`/`.`). Prettier only touched files. Commit as the user's git identity with a `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

---

## Phase A — Dissolve `PoiCategory` into registry-derived axes

### Task A1: Add capability + display fields to the registry rows

**Files:**

- Modify: `src/@types/data/SourceEntryBase.d.ts`
- Modify: `src/data/sources.ts` (every `SOURCE_ENTRIES` row)
- Test: `tests/data/sources.test.ts`

**Contract** — add to `SourceEntryBase`:

```ts
/** True if this category carries toggleable on-screen text labels. */
readonly bearsLabel: boolean;
/** True if this category carries a ring/halo marker (structures only today). */
readonly bearsMarker: boolean;
/** Fade layer the labels live on. Present iff bearsLabel. */
readonly labelLayer?: 'galaxyNames' | 'structure';
/** Long form for detail surfaces ("Galaxy Cluster"). Present iff bearsLabel. */
readonly detailLabel?: string;
/** Plural for list/toggle headers ("Clusters"). Present iff bearsLabel. */
readonly plural?: string;
```

Per-row values (see spec §A1/§A2 table):

- `famousGalaxy`: `bearsLabel: true, bearsMarker: false, labelLayer: 'galaxyNames', detailLabel: 'Famous Galaxy', plural: 'Famous galaxies'`. (Keep its existing `label: 'Famous'`; the old display table's short form was `'Galaxy'` — see judgement note at end of plan.)
- `cluster/supercluster/void/group`: `bearsLabel: true, bearsMarker: true, labelLayer: 'structure'`, with `detailLabel`/`plural` copied from the old `POI_CATEGORY_INFO` rows (`src/data/poiCategoryInfo.ts:24-50`).
- `sdss/glade/2mrs/milliquas/synthetic`: `bearsLabel: false, bearsMarker: false` (omit `labelLayer`/`detailLabel`/`plural`).

- [ ] Add tests: `famousGalaxy row bears a label but no marker` (assert `bearsLabel` true, `bearsMarker` false, `labelLayer === 'galaxyNames'`); `structure rows bear both a label and a marker` (loop cluster/supercluster/void/group); `bulk survey rows bear neither` (assert sdss/glade false/false).
- [ ] Run: `npm test -- sources` → new tests FAIL (fields absent).
- [ ] Add the five fields to `SourceEntryBase`; populate every row in `sources.ts`.
- [ ] Run: `npm test -- sources` and `npm run typecheck` → PASS.
- [ ] Commit (`git add src/@types/data/SourceEntryBase.d.ts src/data/sources.ts tests/data/sources.test.ts`).

### Task A2: Derive `LABEL_CATEGORIES` + `LabelCategory` from the registry

**Files:**

- Create: `src/data/labelCategories.ts`
- Create: `src/@types/engine/data/LabelCategory.d.ts`
- Test: `tests/data/labelCategories.test.ts`

**Contract** (mirror `src/data/structureCategories.ts` + `src/@types/engine/data/StructureCategory.d.ts`):

```ts
// src/data/labelCategories.ts
export const LABEL_CATEGORIES = /* SOURCE_ENTRIES filtered by bearsLabel, mapped to .id, registry order */;
// src/@types/engine/data/LabelCategory.d.ts
export type LabelCategory = (typeof LABEL_CATEGORIES)[number];
```

- [ ] Add tests in `tests/data/labelCategories.test.ts`: `LABEL_CATEGORIES contains famousGalaxy and the four structure categories` (assert sorted equals `['cluster','famousGalaxy','group','supercluster','void']`); `LABEL_CATEGORIES is a superset of STRUCTURE_CATEGORIES`; `LABEL_CATEGORIES excludes bulk surveys` (no `'sdss'`/`'glade'`).
- [ ] Run: `npm test -- labelCategories` → FAIL (module absent).
- [ ] Implement `labelCategories.ts` (filter `SOURCE_ENTRIES` by `bearsLabel`) and the `LabelCategory` type alias.
- [ ] Run: `npm test -- labelCategories` + `npm run typecheck` → PASS.
- [ ] Commit.

### Task A3: Fold the display table into a registry-derived accessor

**Files:**

- Create: `src/data/categoryDisplayInfo.ts` (derived `CATEGORY_DISPLAY_INFO` keyed by `LabelCategory`, fields `{ label, shortLabel, plural }` sourced from the registry rows' `detailLabel`/`label`/`plural`)
- Modify: every `POI_CATEGORY_INFO` consumer (enumerate with `rg -l 'POI_CATEGORY_INFO|poiCategoryInfo|PoiCategoryInfo' src` — expect InfoCard / SettingsPanel family)
- Delete: `src/data/poiCategoryInfo.ts`
- Test: `tests/data/categoryDisplayInfo.test.ts` (rename from any `poiCategoryInfo` test if one exists; else new)

**Contract:**

```ts
export type CategoryDisplayInfo = { label: string; shortLabel: string; readonly plural: string };
export const CATEGORY_DISPLAY_INFO: Readonly<Record<LabelCategory, CategoryDisplayInfo>>;
```

Mapping: `shortLabel ← row.label`; `label ← row.detailLabel`; `plural ← row.plural`.

- [ ] Add tests: `CATEGORY_DISPLAY_INFO has a row per LabelCategory`; `cluster renders 'Galaxy Cluster' / 'Cluster' / 'Clusters'`; `famousGalaxy renders the famous display copy`.
- [ ] Run → FAIL.
- [ ] Implement `categoryDisplayInfo.ts` deriving from the registry; repoint every `POI_CATEGORY_INFO[x]` read to `CATEGORY_DISPLAY_INFO[x]`; delete `poiCategoryInfo.ts`.
- [ ] Run the touched tests + `npm run typecheck` → PASS. Confirm `rg 'POI_CATEGORY_INFO|poiCategoryInfo' src` is empty.
- [ ] Commit.

### Task A4: Rename `PoiCategory` → `LabelCategory`; retype the visibility records

**Files (enumerate first with `rg -l 'PoiCategory' src`):** `@types/settings/EngineSettingsState.d.ts`, `@types/settings/UseEngineSettingsState.d.ts`, `@types/engine/EngineCallbacks.d.ts`, `@types/engine/wiring/SettingsCallbackSeed.d.ts`, `@types/engine/subsystems/Selection.d.ts`, `@types/engine/handles/EngineLabelsHandle.d.ts`, `@types/engine/UseEngineReturn.d.ts`, `src/hooks/useEngine.ts`, `src/hooks/useEngineSettings.ts`, `src/components/SettingsPanel/SettingsPanel.tsx`, `src/services/engine/engine.ts`, `src/services/engine/labelStyleOverride.ts`, `src/services/engine/wiring/assetWiring.ts`, the 4 visibility-default fixtures under `tests/`.

- Delete: `src/@types/engine/data/PoiCategory.d.ts`

**Contract changes:**

```ts
readonly labelCategoryVisibility: Readonly<Record<LabelCategory, boolean>>;
readonly markerCategoryVisibility: Readonly<Record<StructureCategory, boolean>>; // narrowed — no famousGalaxy
// labelStyleOverride.ts:
export type LabelStyleOverrideTarget = 'youAreHere' | LabelCategory;
```

Default-visibility literals (`engine.ts:451-465`, `useEngineSettings.ts:174-188`) derive from `LABEL_CATEGORIES` / `STRUCTURE_CATEGORIES` instead of hand-listed `{ famousGalaxy: true, cluster: true, ... }`.

- [ ] Update/add fixture + type tests first where assertions exist (`tests/@types/engineSettingsState.labelCategoryVisibility.test.ts`): assert `markerCategoryVisibility` has no `famousGalaxy` key and `labelCategoryVisibility` does.
- [ ] Run → FAIL.
- [ ] Replace `PoiCategory` with `LabelCategory` import-by-import; narrow the marker record key type to `StructureCategory`; derive the default literals from the category sets; delete `PoiCategory.d.ts`.
- [ ] Run `npm run typecheck` + the touched tests → PASS. `rg 'PoiCategory' src tests` empty.
- [ ] Commit.

### Task A5: De-special-case the visibility setters

**Files:**

- Modify: `src/services/engine/engine.ts:261-323` (`setCategoryLabelVisible`, `setCategoryMarkerVisible`)
- Test: existing `tests/services/engine/setCategoryVisibleFade.test.ts`, `tests/services/engine/setSourceVisibleFade.test.ts`

**Contract:**

```ts
function setCategoryMarkerVisible(state, cb, category: StructureCategory, visible: boolean): void;
function setCategoryLabelVisible(state, cb, category: LabelCategory, visible: boolean): void;
```

- `setCategoryMarkerVisible`: drop the `if (category !== 'famousGalaxy')` guard entirely — every `StructureCategory` fires a `markerLayer` fade.
- `setCategoryLabelVisible`: replace the `if (category === 'famousGalaxy')` branch with a dispatch on the row's `labelLayer` field — `'galaxyNames'` fires the `galaxyNames` labelLayer fade (+ `setFamousLabelsVisible`); `'structure'` fires the structure labelLayer fade keyed by `category`.

- [ ] Update tests: `setCategoryMarkerVisible fires a markerLayer fade for every structure category`; `setCategoryLabelVisible routes famousGalaxy to the galaxyNames layer`; `...routes a structure category to the structure label layer`.
- [ ] Run → FAIL (guards still present / wrong signatures).
- [ ] Rewrite both setters per the contract.
- [ ] Run the two test files + `npm run typecheck` → PASS.
- [ ] Commit.

---

## Phase B — Fold `#poi=` into `#focus=`

### Task B1: Add the `structure` variant to the focus codec

**Files:**

- Modify: `src/@types/camera/FocusTarget.d.ts`
- Modify: `src/services/url/focusUrl.ts` (`parseFocusHash`, `selectionToFocusId`)
- Test: `tests/services/url/focusUrl.test.ts`

**Contract:**

```ts
export type FocusTarget =
  | { kind: 'famous'; id: string }
  | { kind: 'pgc'; pgc: bigint }
  | { kind: 'sdss'; objID: bigint }
  | { kind: 'pos'; raDeg: number; decDeg: number }
  | { kind: 'structure'; id: string }; // NEW
```

- `parseFocusHash`: a `focus=` body whose id starts with `cluster-` / `supercluster-` / `void-` / `group-` → `{ kind: 'structure', id }`; the existing pgc/sdss/pos/famous ladder is otherwise unchanged. Derive the prefix set from `STRUCTURE_CATEGORIES` (no hardcoded list).
- `selectionToFocusId(info: GalaxyInfo)` is galaxy-only; add a sibling path so a structure selection encodes to its `id` verbatim. (Check how `computeDesiredHash` calls it in B3 — the structure branch may bypass `selectionToFocusId` and use `record.id` directly. Pick whichever keeps the codec galaxy/structure split clean.)

- [ ] Add tests: `parseFocusHash routes cluster-virgo-m87 to kind structure`; one per category prefix; `a famous id without a structure prefix still routes to kind famous`; `pgc-/sdss-/pos@ ladder unchanged` (regression).
- [ ] Run: `npm test -- focusUrl` → FAIL.
- [ ] Implement the variant + prefix routing.
- [ ] Run → PASS + `npm run typecheck`.
- [ ] Commit.

### Task B2: Drop `#poi=` from `hasDeepLink`

**Files:**

- Modify: `src/utils/url/hasDeepLink.ts:44-58`
- Test: `tests/utils/url/hasDeepLink.test.ts`

- [ ] Add/adjust tests: `#focus=cluster-virgo-m87 is a deep link`; `#poi=... is NOT a deep link` (documents the intentional break); `#focus=m31` regression still true.
- [ ] Run → the `#poi=` test FAILs (still treated as deep link).
- [ ] Remove the `#poi=` branch (`hasDeepLink.ts:48`); update the docblock (drop the `#poi=` bullet).
- [ ] Run → PASS.
- [ ] Commit.

### Task B3: Route structures through the single focus codec in `useUrlSync`

**Files:**

- Modify: `src/hooks/useUrlSync.ts` (imports, `InitialPending`, `computeDesiredHash`, `initialPendingFromHash`, hook body slot rename)
- Test: `tests/hooks/useUrlSync.test.ts`

**Contract:**

```ts
export type InitialPending =
  | { kind: 'galaxy'; target: FocusTarget }
  | { kind: 'structure'; id: string } // was { kind: 'poi'; poiId }
  | { kind: null };
```

- Remove the `parsePoiHash` import + call. `initialPendingFromHash` parses one `#focus=` hash; a `kind:'structure'` `FocusTarget` → `{ kind:'structure', id }`, everything else → `{ kind:'galaxy', target }`.
- `computeDesiredHash`: a structure focus writes `focus=<id>` (not `poi=<id>`). A galaxy writes `focus=<id>` as today.
- Rename state slot `pendingPoiId` → `pendingStructureId` (and its setter); update the popstate handler + effect 4 (the structure drain) + the `UrlSyncReturn` shape (`@types/engine/UrlSyncReturn.d.ts`).
- Keep BOTH pending slots and both drains — the resolution sources differ (async catalogs vs synchronous structure table); do not merge them.

- [ ] Update tests: `initialPendingFromHash routes #focus=cluster-... to kind structure`; `computeDesiredHash writes focus=<id> for a structure target`; `galaxy hashes unchanged`; rename existing `poi`-named cases.
- [ ] Run: `npm test -- useUrlSync` → FAIL.
- [ ] Apply the changes (the `camera.focusOn` drain already accepts structures — no logic change there, just the slot/parse rename).
- [ ] Run → PASS + `npm run typecheck`.
- [ ] Commit.

### Task B4: Delete the `poiUrl` codec

**Files:**

- Delete: `src/services/url/poiUrl.ts`, `tests/services/url/poiUrl.test.ts`

- [ ] Confirm `rg 'poiUrl|parsePoiHash|poiIdToHash' src tests` shows only the files to delete (B1/B3 removed all consumers).
- [ ] Delete both files.
- [ ] Run `npm run typecheck` + `npm test -- url` → PASS.
- [ ] Commit (`git rm` the two paths).

---

## Phase C — Mechanical `poi → structure` renames

> For each task: enumerate sites with `rg`, rename via edits + `git mv` for files, update the mirrored test, keep typecheck green. These are pure renames — no behaviour change.

### Task C1: `isPoi` → `isStructure`

**Files:** `git mv src/services/engine/isPoi.ts src/services/engine/isStructure.ts`; `git mv tests/services/engine/isPoi.test.ts tests/services/engine/isStructure.test.ts`; consumers via `rg -l '\bisPoi\b' src tests` (expect `pickToSelection`/`useUrlSync`/`commitFocus`/`engine.ts` + several `@types` JSDoc refs).

**Contract:** `export function isStructure(target: FocusableTarget): target is StructureRecord`

- [ ] `git mv` both files; rename the function + all call sites + the test `describe`/imports.
- [ ] Run `npm test -- isStructure` + `npm run typecheck` → PASS. `rg '\bisPoi\b' src tests` empty.
- [ ] Commit.

### Task C2: `resolvePoiFromPick` → `resolveStructureFromPick`

**Files:** `git mv src/services/engine/helpers/resolvePoiFromPick.ts → resolveStructureFromPick.ts`; `git mv` its test; modify `src/services/engine/helpers/pickToSelection.ts` (consumer).

**Contract:**

```ts
export type PickStructureInput = {
  readonly category: StructureCategory;
  readonly structureIndex: number;
};
export function resolveStructureFromPick(
  structures: PickStructureStore,
  input: PickStructureInput,
): StructureRecord | null;
```

Note: the input `category` can narrow to `StructureCategory` now (the `famousGalaxy` early-return guard at `resolvePoiFromPick.ts:60` becomes unnecessary once the caller passes a `StructureCategory` — verify the caller's type; keep a defensive guard only if the caller still supplies a wider type).

- [ ] Rename file + fn + type + the `poiIndex` field → `structureIndex`; update `pickToSelection.ts` + the test.
- [ ] Run the test + `npm run typecheck` → PASS.
- [ ] Commit.

### Task C3: `structurePoiStyles` → `structureMarkerStyles`

**Files:** `git mv src/services/engine/presentation/structurePoiStyles.ts → structureMarkerStyles.ts`; `git mv tests/data/poiCategories.test.ts → tests/data/structureMarkerStyles.test.ts`; consumers via `rg -l 'STRUCTURE_POI_STYLES|structurePoiStyles' src tests` (expect `produceStructureMarkers`/`produceStructureLabels`).

**Contract:** export `STRUCTURE_MARKER_STYLES` (type `StructureMarkerStyle` keeps its name); `SIG_MIN_ALPHA` unchanged.

- [ ] `git mv` both; rename the export + consumers; in the test, drop the `PoiCategory` import (use `StructureCategory`) and rename the `describe`.
- [ ] Run `npm test -- structureMarkerStyles` + `npm run typecheck` → PASS. `rg 'STRUCTURE_POI_STYLES|structurePoiStyles' src tests` empty.
- [ ] Commit.

### Task C4: `poiIndex` → `structureIndex` in the marker/pick path

**Files (sites not covered by C2):** `src/services/gpu/renderers/structureMarkerRenderer.ts`, `src/@types/rendering/StructureMarkerRenderer.d.ts`, `src/services/engine/presentation/produceStructureMarkers.ts`, `src/@types/engine/CreateClickResolverInput.d.ts`; mirrored tests (`structureMarkerRenderer.*.test.ts`, `ringPick.test.ts`).

- [ ] `rg -n '\bpoiIndex\b' src tests` → rename every remaining occurrence to `structureIndex` (field names, locals, comments).
- [ ] Run the affected renderer tests + `npm run typecheck` → PASS. `rg '\bpoiIndex\b' src tests` empty.
- [ ] Commit.

### Task C5: `FocusState.poiId` → `structureId`; widen `category`

**Files:** `src/@types/engine/state/FocusState.d.ts`; consumers via `rg -l 'poiId' src` (expect `structureFocusSubsystem`, `commitStructureFocus`, `structureMembership`, the membership-cache key); mirrored tests.

**Contract:**

```ts
readonly structureId: string;          // was poiId
readonly category: StructureCategory;  // was 'cluster' | 'supercluster' | 'void'  (now includes group)
```

- [ ] Update tests asserting `FocusState` shape / the membership cache key first.
- [ ] Rename `poiId` → `structureId` everywhere; widen `category` to `StructureCategory`; check the membership-cache key string (`structureMembership.ts:12`) and any focus-framing switch handles `group` (it should, since group is already a focusable structure).
- [ ] Run the focus/membership tests + `npm run typecheck` → PASS.
- [ ] Commit.

### Task C6: `selectedPoi` → `selectedStructure`

**Files:** `rg -ln 'selectedPoi' src` → `src/services/engine/frame/passes/selectionRingPass.ts`, `src/@types/engine/handles/EngineSubsystemHandles.d.ts`, `src/services/engine/engine.ts` (mostly param names + comments).

- [ ] Rename the param/comment occurrences to `selectedStructure`.
- [ ] Run `npm run typecheck` + `npm test -- selectionRingPass` → PASS.
- [ ] Commit.

### Task C7: Doc-comment + remaining-token sweep

**Files:** every `poi`/`POI` left in comments. Enumerate: `rg -n 'poi|POI' src tests -g '*.ts' -g '*.tsx' -g '*.wesl' | rg -iv 'point|poisson|poison'`.

- [ ] For each remaining hit (docblocks in `commitGalaxyFocus`, `commitStructureFocus`, `clearAll`, `selectionSubsystem`, `buildStaticAnchorStructures`, `assetWiring`, `useUrlSync`, `useSplash`, `App.tsx`, etc.) reword "POI"/"poi" to "structure" (or "deep link" where it described the URL generically). Follow `feedback_comment_style` — timeless + terse, no history notes.
- [ ] `rg 'poi|POI' src tests -g '*.ts' -g '*.tsx' -g '*.wesl' | rg -iv 'point|poisson|poison'` → empty.
- [ ] Run `npm run typecheck` → PASS.
- [ ] Commit.

### Task C8: Rename the remaining `*.poi.test.ts` files + final verification

**Files:** `git mv tests/services/engine/phases/wireInput.poi.test.ts → wireInput.structure.test.ts`; `git mv tests/services/gpu/renderers/pickRenderer.poi.test.ts → pickRenderer.structure.test.ts`; `git mv tests/@types/engine/EngineCameraHandle.poi.test.ts → EngineCameraHandle.structure.test.ts`. Update each `describe`/imports if they reference renamed symbols.

- [ ] `git mv` the three files; fix any internal `poi` references.
- [ ] **Entanglement-radar verification:** run the `entanglement-radar` lens over `git diff main...HEAD` — confirm the spec's un-braided choices survived: `PoiCategory` gone (not re-spelled), marker record narrowed (no phantom `famousGalaxy`), the two URL resolution paths NOT merged, the famousGalaxy `if`-branches dissolved into `labelLayer` data. Note any regressions and fix before finishing.
- [ ] **Full sweep:** `find src tests -iname '*poi*'` empty; `rg 'poi|POI' src tests -g '*.ts' -g '*.tsx' -g '*.wesl' | rg -iv 'point|poisson|poison'` empty.
- [ ] Run full `npm test` + `npm run typecheck` + `npm run build` → all green.
- [ ] Prettier all touched files; commit.

---

## Self-review notes

**Spec coverage:** A1–A5 cover spec Part A (capability flags A1, display fold A2/A3, derived types A2, record retype A4, setter de-special-case A5). B1–B4 cover Part B (codec variant B1, hasDeepLink B2, useUrlSync B3, delete B4). C1–C8 cover Part C (every rename row in the spec's Part C table + the test renames + the final entanglement-radar gate).

**Judgement calls (flag for review):**

1. **`famousGalaxy` display copy:** the old table had `shortLabel: 'Galaxy'` but the registry `label` is `'Famous'`. A3 maps `shortLabel ← row.label`, so the famous chip short form would read `'Famous'`, not `'Galaxy'`. If the UI must keep `'Galaxy'`, set the famousGalaxy row's `label` to `'Galaxy'` in A1 (and check no other consumer of that row's `label` regresses) — confirm during A1.
2. **`tests/data/poiCategories.test.ts` fate:** the spec suggested re-scoping it to the derived sets, but it currently tests the _style table_. This plan instead renames it to `structureMarkerStyles.test.ts` (C3, style assertions) and creates a fresh `labelCategories.test.ts` (A2, derived sets). Two clear tests beats one re-scoped one.
3. **`resolveStructureFromPick` defensive guard:** the `famousGalaxy` early-return may become dead once the caller passes `StructureCategory` (C2). Drop it only if the caller's type genuinely narrows; otherwise keep it.
