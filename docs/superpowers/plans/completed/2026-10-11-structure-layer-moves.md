# Structure Layer — PR 1: file moves and README rulings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every file only the structure categories read moves under `src/layers/structure/` (or, for the member count, under `src/layers/galaxyCatalog/`), the eight registry rows become the Layer's `STRUCTURE_SOURCE_ROWS`, the README's two unsettled placements are ruled, and the Layer dependency DAG is backlogged. Nothing changes behaviour: the files still run from the same core call sites.

**Architecture:**

- One `move-files` manifest moves 39 source files and drags their test mirrors (Task 1). The two component tests that do not sit at their mirror path are listed in the manifest by hand.
- `structureCatalogFormat.ts` and `nebulaKindLabels.ts` stay in core: a `tools/` file imports each, and a tool never imports from `src/layers/` (the precedent in `docs/superpowers/plans/completed/2026-09-25-milky-way-layer.md:55`).
- The two types whose readers all move go into the Layer's `@types/` now; the five types core still reads move in PR 2, once core stops reading them.
- `data/sources.ts` folds `STRUCTURE_SOURCE_ROWS` the way it folds every formed Layer's rows (Task 2).
- README rulings and the backlog item are docs only (Tasks 3, 4).

**Tech stack:** TS, Vitest, ts-morph (`npm run move-files`).

**Spec:** [`docs/superpowers/specs/2026-10-11-structure-layer-design.md`](../specs/2026-10-11-structure-layer-design.md), §4, §5, §8 and R10, R12, R13.

## Global constraints

- Behaviour-neutral. No test changes an expected value; tests change only import paths and `vi.mock` path strings.
- No new tests: every task is a move, a type fold or a doc edit, which the compiler and the moved suites cover (`docs/superpowers/conventions/testing.md`).
- File moves use `npm run move-files -- --manifest <file> --dry`, then the same without `--dry`. Never `git mv` plus hand-edited imports. The one exception is the two `.module.css` files in Task 1, which `move-files` cannot move because it moves only `.ts`/`.tsx`.
- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`, filename = symbol. No barrels, no `index.ts`.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. Rewrite a comment a task makes untrue; never narrate the move.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage files by path, never `git add -A`.
- No `Co-Authored-By` lines in commits.
- Read `docs/RENDERER.md` before Task 1 (the `?static` shader specifiers).

## Review focus

Five failure modes the compiler does not catch, each with the check that pins it:

1. **A `?static` shader specifier left pointing at the old folder (Task 1).** `tsc` cannot see it; only `npm run build` fails. Pinned by the `npm run build` step in Task 1.
2. **A `vi.mock` path string left at the old path (Task 1).** The mock silently stops applying and the test runs against the real module, or passes for the wrong reason. Pinned by the post-move search in Task 1 and by running every test file that holds one of those strings.
3. **A CSS-module specifier or `composes: … from` path not rewritten (Task 1).** Vitest's CSS handling may not fail on a missing module. Pinned by `npm run build` and the two card tests.
4. **A `tools/` file importing from `src/layers/` (Task 1).** Pinned by the post-move search in Task 1 (no `tools/` file imports `src/layers/structure/`) and by the tools typecheck.
5. **The registry fold changing a code→entry pair (Task 2).** Source codes are append-only and the R2 binaries decode by them. Pinned by the existing `tests/data/sources.test.ts`, `tests/data/sources/` and `tests/data/selectionEncoding.test.ts` suites, which must pass unchanged.

---

### Task 1: One manifest moves the structure files

**Files:** every `from`/`to` path in the manifest below, plus their test mirrors (dragged by the tool), plus:

- `src/layers/structure/ui/StructureDetailCard/StructureDetailCard.module.css`, `src/layers/structure/ui/CompactStructureCard/CompactStructureCard.module.css` (moved with `git mv`)
- `src/layers/structure/render/structureMarkerRenderer.ts` (the six `?static` lines, `:60-65` before the move)
- `src/layers/structure/state/slices.ts` (header)
- `tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts:167`, `tests/services/engine/phases/wireSlots.test.ts:71`, `tests/components/SettingsPanel/SettingsPanel.test.tsx:34`, `tests/components/containers/StructureDetailCardContainer.test.tsx:28` (moves), `tests/services/engine/wiring/wireStructureProjection.test.ts:43` (moves), `tests/services/engine/wiring/engineSliceDispatches.test.ts:36,58` (`vi.mock` strings)

**Folder pick for spec §5.2:** `layers/galaxyCatalog/present/`. Its only reader, `src/layers/galaxyCatalog/frame.ts:25`, publishes the result as the `structureMemberCount` fact the InfoCard reads, which is presentation. No Layer has a `utils/` folder, and adding one would open a README category for two files. The two types only these files read (`StructureMembershipResult`, `CatalogWithSource`) go to `layers/galaxyCatalog/@types/` with them.

**Held back, deliberately:** `src/data/structure/structureCatalogFormat.ts` (read by `tools/structures/buildStructures.ts:46`) and `src/data/structure/nebulaKindLabels.ts` (read by `tools/parsers/parseStructureSeed.ts:24`) stay in core (spec §5.1): a tool never imports from `src/layers/`. `StructureStore`, `StructureGroupId`, `StructureMarkerRenderer`, `StructureMarkerDescriptor` and `StructureCatalogReq` stay in `src/@types/` until PR 2, because core types still read them (`EngineData.d.ts:1`, `ResolveDeps.d.ts:1`, `EngineGpuHandles.d.ts:21`, `MarkerProducer.d.ts:3`, `EngineAssetSlots.d.ts:14`). Spec §5.1 names three of them for PR 2; `StructureGroupId` and `StructureCatalogReq` follow by the same rule, since only `StructureStore` and the structure slot read them.

**Manifest.** Save it outside the repo (for example `$TMPDIR/structure-moves.json`); it is not committed.

```json
[
  { "from": "src/data/sources/galaxyCluster.ts", "to": "src/layers/structure/sources/galaxyCluster.ts" },
  { "from": "src/data/sources/galaxyGroup.ts", "to": "src/layers/structure/sources/galaxyGroup.ts" },
  { "from": "src/data/sources/gcCluster.ts", "to": "src/layers/structure/sources/gcCluster.ts" },
  { "from": "src/data/sources/globularCluster.ts", "to": "src/layers/structure/sources/globularCluster.ts" },
  { "from": "src/data/sources/nebula.ts", "to": "src/layers/structure/sources/nebula.ts" },
  { "from": "src/data/sources/openCluster.ts", "to": "src/layers/structure/sources/openCluster.ts" },
  { "from": "src/data/sources/supercluster.ts", "to": "src/layers/structure/sources/supercluster.ts" },
  { "from": "src/data/sources/void.ts", "to": "src/layers/structure/sources/void.ts" },

  { "from": "src/services/engine/data/createStructureStore.ts", "to": "src/layers/structure/load/createStructureStore.ts" },
  { "from": "src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts", "to": "src/layers/structure/render/structureMarkerRenderer.ts" },
  { "from": "src/services/engine/frame/passes/createStructureMarkersPass.ts", "to": "src/layers/structure/render/createStructureMarkersPass.ts" },

  { "from": "src/services/loading/fetchers/structureCatalogFetcher.ts", "to": "src/layers/structure/load/structureCatalogFetcher.ts" },
  { "from": "src/services/loading/slots/structureCatalogSlot.ts", "to": "src/layers/structure/load/structureCatalogSlot.ts" },
  { "from": "src/services/engine/wiring/structureCatalogToStructures.ts", "to": "src/layers/structure/load/structureCatalogToStructures.ts" },
  { "from": "src/services/engine/wiring/wireStructureProjection.ts", "to": "src/layers/structure/load/wireStructureProjection.ts" },
  { "from": "src/data/structure/buildStaticAnchorStructures.ts", "to": "src/layers/structure/load/buildStaticAnchorStructures.ts" },
  { "from": "src/utils/structure/toStructureSearchEntry.ts", "to": "src/layers/structure/load/toStructureSearchEntry.ts" },

  { "from": "src/services/engine/frame/passes/structureMarkersCosmoPass.ts", "to": "src/layers/structure/passes/structureMarkersCosmoPass.ts" },
  { "from": "src/services/engine/frame/passes/structureMarkersNearPass.ts", "to": "src/layers/structure/passes/structureMarkersNearPass.ts" },

  { "from": "src/services/engine/frame/planners/structureMarkersPlanner.ts", "to": "src/layers/structure/frame.ts" },

  { "from": "src/services/engine/presentation/produceStructureLabels.ts", "to": "src/layers/structure/present/produceStructureLabels.ts" },
  { "from": "src/services/engine/presentation/produceStructureMarkers.ts", "to": "src/layers/structure/present/produceStructureMarkers.ts" },
  { "from": "src/services/engine/presentation/structureMarkerStyles.ts", "to": "src/layers/structure/present/structureMarkerStyles.ts" },
  { "from": "src/services/engine/presentation/structureVisibleBands.ts", "to": "src/layers/structure/present/structureVisibleBands.ts" },
  { "from": "src/services/engine/selection/structureSelectionRow.ts", "to": "src/layers/structure/present/structureSelectionRow.ts" },
  { "from": "src/services/engine/helpers/resolveStructureFromPick.ts", "to": "src/layers/structure/present/resolveStructureFromPick.ts" },

  { "from": "src/data/structure/structureScaleTitles.ts", "to": "src/layers/structure/data/structureScaleTitles.ts" },
  { "from": "src/data/structureLabelAboveGapPx.ts", "to": "src/layers/structure/data/structureLabelAboveGapPx.ts" },

  { "from": "src/components/SettingsPanel/StructuresSection.tsx", "to": "src/layers/structure/ui/StructuresSection/StructuresSection.tsx" },
  { "from": "src/components/containers/StructuresSectionContainer.tsx", "to": "src/layers/structure/ui/StructuresSectionContainer.tsx" },
  { "from": "src/components/InfoCard/StructureDetailCard/StructureDetailCard.tsx", "to": "src/layers/structure/ui/StructureDetailCard/StructureDetailCard.tsx" },
  { "from": "src/components/InfoCard/CompactStructureCard/CompactStructureCard.tsx", "to": "src/layers/structure/ui/CompactStructureCard/CompactStructureCard.tsx" },
  { "from": "src/components/containers/StructureDetailCardContainer.tsx", "to": "src/layers/structure/ui/StructureDetailCardContainer.tsx" },
  { "from": "tests/components/InfoCard/StructureDetailCard.test.ts", "to": "tests/layers/structure/ui/StructureDetailCard/StructureDetailCard.test.ts" },
  { "from": "tests/components/InfoCard/CompactStructureCard.test.ts", "to": "tests/layers/structure/ui/CompactStructureCard/CompactStructureCard.test.ts" },

  { "from": "src/@types/engine/data/PickStructureStore.d.ts", "to": "src/layers/structure/@types/PickStructureStore.d.ts" },
  { "from": "src/@types/engine/frame/StructureMarkersPassSpec.d.ts", "to": "src/layers/structure/@types/StructureMarkersPassSpec.d.ts" },

  { "from": "src/utils/structure/structureMemberCount.ts", "to": "src/layers/galaxyCatalog/present/structureMemberCount.ts" },
  { "from": "src/utils/structure/structureMembership.ts", "to": "src/layers/galaxyCatalog/present/structureMembership.ts" },
  { "from": "src/@types/data/structure/StructureMembershipResult.d.ts", "to": "src/layers/galaxyCatalog/@types/StructureMembershipResult.d.ts" },
  { "from": "src/@types/data/structure/CatalogWithSource.d.ts", "to": "src/layers/galaxyCatalog/@types/CatalogWithSource.d.ts" }
]
```

`src/layers/structure/frame.ts` keeps exporting `structureMarkersPlanner` (a const until PR 2); the README's rule is that `frame.ts` holds the Layer's planners. `createStructureMarkersPass` goes to `render/`, not `passes/`: it is a factory helper, and `passes/` files are swept by the one-export ratchet (`tests/services/engine/frame/frameFilePurity.test.ts:31`).

- [x] Read `.claude/skills/refactor/SKILL.md`. Run `npm run move-files -- --manifest $TMPDIR/structure-moves.json --dry` and read the expanded move list: each source with a test at its mirror path must show a dragged `tests/` move (for example `tests/services/engine/wiring/wireStructureProjection.test.ts` → `tests/layers/structure/load/wireStructureProjection.test.ts`). If a source file has no `tests/` twin, that is fine.
- [x] Run the manifest without `--dry`.
- [x] Move the two sibling stylesheets with `git mv` (non-TS, so the tool skips them): `src/components/InfoCard/StructureDetailCard/StructureDetailCard.module.css` → `src/layers/structure/ui/StructureDetailCard/`, `src/components/InfoCard/CompactStructureCard/CompactStructureCard.module.css` → `src/layers/structure/ui/CompactStructureCard/`. Remove the emptied `src/components/InfoCard/StructureDetailCard/`, `src/components/InfoCard/CompactStructureCard/` and `src/services/gpu/renderers/structureMarker/` directories.
- [x] Fix the specifiers the tool cannot see. Each one points from the new location to an unmoved file, so the result has the shape `src/layers/milkyWay/ui/MilkyWayDetailCard/MilkyWayDetailCard.tsx:30` already uses:
  - the six `?static` imports in `render/structureMarkerRenderer.ts` → `'../../../services/gpu/shaders/structureMarker/<file>.wesl?static'` (shape of `src/layers/milkyWay/render/milkyWayCloudRenderer.ts:27`);
  - CSS-module imports in `StructureDetailCard.tsx` (`cardChrome.module.css`), `CompactStructureCard.tsx` (`compactChrome.module.css`) and `StructuresSection.tsx` (`SettingsPanel.module.css`), if the tool left them relative to the old folder;
  - the `composes: … from '../cardChrome.module.css'` / `'../compactChrome.module.css'` lines in the two moved stylesheets.
- [x] Fix every `vi.mock` path string listed under **Files** to the new module path, relative to the test file's own (possibly new) location. Leave `wireStructureProjection.test.ts`'s second mock (`:82` before the move) alone: it already names a path that never existed (`src/services/engine/phases/structureCatalogToStructures`), so there is nothing to re-point; PR 2 rewrites that test.
- [x] Search (Grep tool, not shell `grep`) `src/`, `tests/`, `tools/` and `.claude/skills/` for every old path in the manifest, by the path fragment (`services/gpu/renderers/structureMarker`, `engine/presentation/produceStructure`, `engine/presentation/structureMarkerStyles`, `engine/presentation/structureVisibleBands`, `selection/structureSelectionRow`, `helpers/resolveStructureFromPick`, `frame/passes/structureMarkers`, `frame/passes/createStructureMarkersPass`, `frame/planners/structureMarkersPlanner`, `wiring/wireStructureProjection`, `wiring/structureCatalogToStructures`, `loading/fetchers/structureCatalogFetcher`, `loading/slots/structureCatalogSlot`, `structure/buildStaticAnchorStructures`, `structure/toStructureSearchEntry`, `structure/structureScaleTitles`, `data/structureLabelAboveGapPx`, `data/sources/<each of the eight>`, `SettingsPanel/StructuresSection`, `containers/StructuresSectionContainer`, `containers/StructureDetailCardContainer`, `InfoCard/StructureDetailCard`, `InfoCard/CompactStructureCard`, `engine/data/PickStructureStore`, `engine/frame/StructureMarkersPassSpec`, `utils/structure/structureMember`, `structure/StructureMembershipResult`, `structure/CatalogWithSource`). Every hit outside a TS import is a string literal: fix it. Hits in `docs/` are Task 3's.
- [x] Confirm no `tools/` file imports from `src/layers/structure/` (search `tools/` for `layers/structure`).
- [x] `src/layers/structure/state/slices.ts:1-4`: the header's "its render and load code still lives in core" is now false. Rewrite it to say what the tuple is and where it is folded, nothing more.
- [x] Do not edit any moved file's body or header beyond the specifier fixes above. Headers that still call a row "core" stay true until PR 2 registers the Layer.
- [x] Verify: `npm run typecheck:fast`, then `npm run build` (the `?static` and CSS specifiers are invisible to `tsc`), then the targeted tests: everything under `tests/layers/structure/` and `tests/layers/galaxyCatalog/present/`, plus `tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts`, `tests/services/engine/phases/wireSlots.test.ts`, `tests/components/SettingsPanel/SettingsPanel.test.tsx`, `tests/services/engine/wiring/engineSliceDispatches.test.ts`, `tests/services/engine/frame/passes/passes.test.ts`, `tests/services/engine/frame/frameFilePurity.test.ts`, `tests/components/InfoCard/`.
- [x] Commit: the pure move, specifier fixes and the one header line only.

### Task 2: `STRUCTURE_SOURCE_ROWS` replaces eight hand-held registry entries

**Files:** `src/layers/structure/sources/structureSourceRows.ts` (create), `src/data/sources.ts` (modify)

**Contract:** the shape of `src/layers/blackHoles/sources/blackHoleSourceRows.ts`, in today's code order.

```ts
// src/layers/structure/sources/structureSourceRows.ts
export const STRUCTURE_SOURCE_ROWS = [
  [Source.GalaxyCluster, GALAXY_CLUSTER_ENTRY],
  [Source.Supercluster, SUPERCLUSTER_ENTRY],
  [Source.Void, VOID_ENTRY],
  [Source.GalaxyGroup, GALAXY_GROUP_ENTRY],
  [Source.OpenCluster, OPEN_CLUSTER_ENTRY],
  [Source.GlobularCluster, GLOBULAR_CLUSTER_ENTRY],
  [Source.Nebula, NEBULA_ENTRY],
  [Source.GcCluster, GC_CLUSTER_ENTRY],
] as const satisfies readonly (readonly [SourceType, SourceEntry])[];
```

`Layer.sources` is typing only (`src/@types/engine/layer/Layer.d.ts:56`); the registry is what folds the rows, by import. The Layer's `sources:` field itself is set in PR 2, when `layer.ts` exists.

- [x] Create the rows file. Its header says what the array is (the Layer's `sources` rows, folded into `SOURCE_REGISTRY` by `data/sources.ts`); import `Source` from `src/data/source`, never from `src/data/sources` (that would be a cycle).
- [x] `src/data/sources.ts`: delete the eight entry imports (`:17-24`) and the eight `UNFORMED_SOURCE_REGISTRY` lines (`:72-79`); add `...sourceRecordOf(STRUCTURE_SOURCE_ROWS)` to `SOURCE_REGISTRY` beside the other Layers' folds (`:85-96`). `UNFORMED_SOURCE_REGISTRY` keeps the three body rows.
- [x] No new test: the `satisfies` clause and `SOURCE_REGISTRY`'s `satisfies Readonly<Record<SourceType, SourceEntry>>` (`sources.ts:96`) make a missing or mistyped row a compile error. Key order is cosmetic: integer keys iterate in numeric order (`sources.ts:62-70`).
- [x] Verify: `npm run typecheck:fast`, `npm test -- tests/data/` (sources, selection encoding, structure anchors).
- [x] Commit.

### Task 3: README rulings and living-doc paths

**Files:** `src/layers/README.md` (modify), `.claude/skills/add-data-source/SKILL.md` (modify), and every living doc the Task 1 search hit: `docs/backlog/2026-06-29-supercluster-shape-focus.md:12`, `docs/backlog/2026-07-07-emphasize-clip-cue.md:99`, plus any other hit under `docs/` that is not a historical record

- [x] `src/layers/README.md`: delete the `## Unsettled` section (the heading and its two numbered items). Under `## Where things go`, after the three-folder list, add these two paragraphs (spec §4):

  > **`subsystems/` vs `render/`.** Both stay. `render/` holds GPU pipeline objects and what feeds them directly: renderers, pick renderers, stores that own GPU buffers, vertex layouts, uniform packers. `subsystems/` holds stateful per-frame machinery that decides _what_ to draw before any pipeline runs: LOD planners, sticky maps, bake state machines, their workers. A pair that spans the two keeps one name (`proceduralDiskSubsystem` / `proceduralDiskRenderer`). A Layer with no per-frame decision state has no `subsystems/` folder.
  >
  > **Where declaration rows live.** A row's folder names the concern it describes, not the fact that it is a row. `load/` holds `assets` and `sourceCounts`; `present/` holds `fades`, `guides`, `selection`, `search`, `slabs`; `passes/` and `computes/` already work this way. Every formed Layer follows both rules.

  Two wording changes from the spec text, both for timelessness: "structure has none" is dropped (the README describes the rule, not one Layer), and "All eleven formed Layers match today; no file moves" becomes "Every formed Layer follows both rules".
- [x] Leave the `## Status` line alone. It changes in PR 2, when `structure` is actually formed; a README that calls it formed before `layer.ts` exists would be false for as long as PR 2 is open.
- [x] Rewrite every moved path in `.claude/skills/add-data-source/SKILL.md` (`:176`, `:179`, `:181`, `:183` today) and in the living `docs/` hits. Leave historical records alone: `docs/superpowers/plans/completed/`, `docs/superpowers/specs/completed/`, `docs/superpowers/plans/archive/`, `docs/research/`, `docs/audits/`, `docs/grill-sessions/`, and the spec of this feature.
- [x] Commit.

### Task 4: Backlog the Layer dependency DAG

**Files:** `docs/BACKLOG.md` (modify), `docs/backlog/2026-10-11-layer-dependency-dag.md` (create)

- [x] Add this index line to `docs/BACKLOG.md` under `## Engine & State`, directly after the **Derive `SettingsSnapshot` from the Layer registry** line (the other Layer-contract item):

  ```markdown
  - [ ] **Layer dependency DAG** `needs-design` — an explicit `Layer.dependsOn` with typed access to another Layer's facts; trigger = the second cross-Layer read. → [details](backlog/2026-10-11-layer-dependency-dag.md)
  ```

- [x] Create the detail file with this content:

  ```markdown
  # Layer dependency DAG

  `needs-design` — do not start before the trigger below fires. Written
  2026-10-11, out of the structure Layer spec (R13). Start with
  `/wt layer dependency dag`; the body of this file is the brief.

  ## The problem

  A Layer may never import another Layer (`src/layers/README.md`). When one
  Layer needs a fact another Layer owns, the read has to go through core
  state and core types instead. That works while there is one such read. It
  does not say which Layer depends on which, it gives the reader no type for
  the other Layer's facts, and composition order is the only thing that
  orders their `create` calls.

  ## Current state

  One cross-Layer read exists. `galaxyCatalogPlanner`
  (`src/layers/galaxyCatalog/frame.ts:57-79`) publishes
  `structureMemberCount` for the selected structure. It learns which
  structure is selected from the core selection row
  (`state.selectionRows.select`, narrowed on its `structure` arm), not from
  the structure Layer: the structure record's centre and radius ride in on
  the core `SelectionRow` union. Nothing declares that galaxyCatalog depends
  on structure, and nothing would fail if structure stopped publishing that
  arm.

  ## Trigger

  The second cross-Layer read. One read is cheaper through core than a DAG;
  two are where an undeclared dependency starts to cost a debugging session.

  ## Options

  1. **`Layer.dependsOn: readonly LayerName[]`, typed facts access.**
     `createLayers` topologically sorts the composition by it (a cycle throws
     at boot), and a Layer's `create` receives a typed, read-only view of
     each dependency's facts (`FactsOf<Dep>`). Explicit and checkable; adds
     a contract member and a sort.
  2. **Keep routing through core, but name it.** A core-owned selector per
     cross-Layer fact, listed in one file, so the dependency is at least
     greppable. No new contract member; the dependency stays undeclared at
     the Layer.
  3. **Do nothing until a third read.** Defensible if the second read is
     also selection-shaped and core already carries it.

  Open question for the design: whether `dependsOn` also orders `destroy`
  (reverse topological), or core keeps destroying in composition order.
  ```

- [x] Commit.

## Dispatch grouping

One dispatch for Tasks 1–2 (the move and the fold read the same files), the controller inline for Tasks 3–4 (docs, under ~50 lines each).

## Definition of Done

**Deliverables**

- `src/layers/structure/` holds `sources/` (eight rows + `structureSourceRows.ts`), `render/` (`structureMarkerRenderer`, `createStructureMarkersPass`), `load/` (fetcher, `createStructureStore`, slot, `structureCatalogToStructures`, `wireStructureProjection`, `buildStaticAnchorStructures`, `toStructureSearchEntry`), `passes/` (cosmo and near), `frame.ts`, `present/` (both producers, styles, visible bands, selection row, pick resolver), `data/` (scale titles, label gap), `ui/` (section, its container, both cards, the card container), `@types/` (`PickStructureStore`, `StructureMarkersPassSpec`), and its existing `state/`.
- `src/layers/galaxyCatalog/present/structureMemberCount.ts`, `structureMembership.ts` and their two types under `src/layers/galaxyCatalog/@types/`.
- `src/data/sources.ts` folds `STRUCTURE_SOURCE_ROWS`; `UNFORMED_SOURCE_REGISTRY` holds only the three body rows.
- `src/layers/README.md` has no "Unsettled" section and carries the two ruling paragraphs.
- `docs/BACKLOG.md` lists **Layer dependency DAG**; its detail file exists.
- No `tools/` file imports a file this PR moved (`tools/utils/capture/*DeclutterActions.ts` already read `layers/structure/state` before this PR).

**Observable behaviours for the smoke pass (all unchanged from main)**

Shoot each with `npm run shot -- '<link>' --url <this worktree's dev server>`:

- `#focus=galaxy-cluster-virgo-m87` (cosmo slab): the ring and label draw, the camera frames Virgo, the InfoCard shows the cluster with its galaxy count, and the Settings panel's Structures section shows a count per category.
- `#focus=open-cluster-pleiades` (near slab): the ring and label draw inside the Milky Way and the InfoCard shows the Pleiades.

**Out of scope**

- Registering the Layer, the four prep commits, the fade-curve fold and the deletions in core (PR 2).
- Moving `StructureStore`, `StructureGroupId`, `StructureMarkerRenderer`, `StructureMarkerDescriptor`, `StructureCatalogReq` (PR 2).
- The README `## Status` line (PR 2).
- A deletion audit (once, at PR 2's `/feature-done`).
