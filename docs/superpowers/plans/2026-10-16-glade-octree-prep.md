# GLADE on the chunked octree, ground preparation: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the seven behaviour-neutral prep commits of the spec's §9, landing as one PR before the feature PR. They
create the joints the GLADE octree grows into; none changes a file format or needs a re-bake.

**Architecture:** the record-blind star octree code (types, chunk stream, pool installer, residency, GPU cut, planner)
becomes family-neutral `Octree<C>` code in a neutral home (Task 1); a family table owns prefix, render schema, count stat
and grid unit (Task 2); the stream and pool take their path builder and decoder from the caller, and the pool's
ordinal maps become pure helpers (Task 3); deploy reads one octree-catalog list (Task 4); the bake's blob aggregates
become a rule table (Task 5); the galaxy point vertex stage and its per-galaxy derivations become one shader function
and one TypeScript function (Task 7); galaxy consumers read rows through a `GalaxyRecordSource`, implemented over
today's flat catalogs (Task 6, last).

**Tech stack:** TypeScript, WebGPU + WESL, Vitest, ts-morph refactor CLI, tsx tools.

**Spec:** `docs/superpowers/specs/2026-10-16-glade-galaxy-octree-design.md`. **Ground preparation:** §9 of that spec is
this plan's whole scope (signed off 2026-10-16); the feature gets its own plan after this PR merges.

## Global constraints

- **Behaviour-neutral, every task.** Nothing a person sees or operates changes, and no baked byte changes. If a task
  cannot be done without a visible change, STOP and report it; never take it silently. Each task names its gate.
- No file format change, no re-bake, no new `.bin`. `COLUMN_IDS` and `STAT_IDS` are append-only and this PR appends
  nothing to either.
- Move or rename TS files and symbols only with the refactor CLI (`.claude/skills/refactor/SKILL.md`):
  `npm run refactor -- rename <file>#<symbol> <newName>` (renames the file and its `tests/` mirror too) and
  `npm run move-files -- <from> <to>` (or `-- --manifest <moves.json>`), each with `--dry` first. Never `git mv` plus
  hand-edited imports. The CLI does not rewrite `.wesl` `package::` imports, `?static` specifiers, `vi.mock` paths or
  string literals: grep `src tests tools packages docs` for every old name and old path afterwards.
- One symbol per file in `utils/` and `@types/`, filename = symbol, deep relative imports, no barrels, `type` never
  `interface`, types never inline in implementation files. Frame and pass files export only their one symbol.
- Comments explain why, never what; module header ≤ 10 lines, comment lines ≤ half the code lines. Rewrite every
  comment that names a moved or renamed symbol.
- Verify with `npm run typecheck:fast` and the targeted tests; Tasks 1 and 7 also run `npm run build` (a dangling
  `?static` or `package::` import is invisible to `tsc`). CI is the gate.
- Never add an attribution trailer to a commit. Stage by path. `npx prettier --write` the touched files.
- **Rebase point.** Open PR #912 (layer-declared visibility) edits files this plan touches:
  `galaxyCatalog/frame.ts`, `wireGalaxyCatalogSourceSlot.ts`, `galaxyPointSpritesPass.ts`, `catalogStore.ts`,
  `galaxyPointRenderer.ts` (Task 6), and in the star layer `starCatalogSlot.ts`, `starCutInputs.ts`,
  `starSourcesInBand.ts`, `starCatalogVisible.ts`, `starCatalog/frame.ts`, `shaders/starCatalog/vertex.wesl` (import
  lines only, Tasks 1–3). If #912 has merged when this plan starts, merge main into the branch first. Task 6 starts
  only after #912 has merged (merge main in first); if a Task 1–3 conflict is import-only, re-run that task's rename or
  move manifest on the merged tree rather than hand-merging.

## Rulings for Task 6 (2026-10-18)

The spec's record contract did not fit the code in four places; the user ruled each:

- **R1. Lookups return `T | Promise<T>`.** A settled promise cannot be read synchronously, so "already settled" would
  defer every flat selection by one pulse (each pulse bumps `contentVersion`, `createLayers.ts:68-76`, and breaks
  `composeSelectionRows.test.ts:195,343`). The flat source returns plain values; the bridge memoises only real promises.
- **R2. `pos@` ids carry the distance.** New ids are `pos@<ra>,<dec>,<dMpc>` (RA/Dec to 4 decimals as today, distance to
  2 decimals). `resolvePosition(raDeg, decDeg, distMpc)` takes `distMpc: number | null`; a legacy two-part id decodes
  with `null` and is answered by direction (nearest record within 30″, today's search) by sources that can, so old links
  keep resolving. This is the one visible change in the prep PR: a galaxy without a catalog id gets a longer URL.
- **R3. The contract yields resident column blocks.** The disk walk reads nine per-row fields on a rotating 1/8 stride
  window (`proceduralDiskSubsystem.ts:107-132`, `texturedDiskSubsystem.ts:159-162`, `diskPlannerWalk.ts:94-99`), which
  a per-row callback cannot serve. `forEachResidentBlock(visit(block, ordinalBase))` hands column blocks instead; the flat
  source yields its catalog as one block, the octree will yield one per resident chunk. The walk, its visitors (sticky
  maps keyed by `ordinalBase + i`) and structure membership all move onto it, so all 12 consumers move.
- **R4. The palette join is kept through `hasDurableId(id)`.** Dropping the join would list names no loaded tier holds.
  The alias index keeps one entry per (source, pgc) that the source's `hasDurableId('pgc-<n>')` confirms, rebuilt when
  the aliases land or a catalog commits, exactly as today; the hardcoded `[Glade, TwoMRS]` list becomes "every source
  with a `pgc` claim".

## Review focus

The five conditions most likely to bite that no task's tests already exercise; each line's test lives in the owning
task.

1. A WESL import left on `package::starCatalog::cutIo`: only `npm run build` sees it (Task 1 runs it).
2. A degenerate star bake (a `--limit` dev run: zero index records, zero chunks) through the generic decoder and pool:
   still draws nothing, throws nothing (Task 3, `installOctreePool` test).
3. `pgc-3` with the famous catalog loaded: its synthetic `objIDs` (0..N-1) must never answer (Task 6).
4. A tier swap while a `loadRow` promise is pending: the settled row of the released source must not be served (Task 6).
5. A NaN magnitude or NaN axis ratio through the extracted derivation: same slot values as today (Task 7, moved cases).

## Grouping and models

| Dispatch | Tasks       | Model  | Why together                                                     |
| -------- | ----------- | ------ | ---------------------------------------------------------------- |
| A        | 1, 2, 3     | Sonnet | One mental model: the shared octree runtime and its family table |
| B        | 4, 5        | Sonnet | Both tools-side; Task 4 reads Task 2's family table               |
| C        | 7           | Opus   | Shader + TS↔WGSL contract (`review: yes`)                        |
| D        | 6           | Opus   | Selection bridge, sagas' pulse, 11 consumers (`review: yes`)      |

Serial in one worktree by default. File-disjoint, so parallelisable if the controller runs isolation worktrees: Task 7
with dispatch A or B, and Task 5 with dispatch A once Task 2 has landed (Task 5 reuses Task 2's golden test). Task 6 is
last and alone. Mid-branch reviews: Tasks 6 and 7. One whole-branch review at the end. Perf gate (ask at plan start):
recommended for Task 7 only, `npm run perf` before and after at `full-survey` and `local-group`.

---

### Task 1: `Octree<C>` and the family-neutral home (prep 1)

**Files:** every file in the move table below plus their `tests/` mirrors (dragged by the CLI); importers rewritten by
the CLI; by hand: `src/services/gpu/shaders/octree/cut.wesl`, `src/services/gpu/shaders/starCatalog/vertex.wesl:85-93`,
`docs/RENDERER.md:39,42,71,72`.

**Homes** (both already exist except `services/octree/` and `services/gpu/octree/`):

- types → `src/@types/octree/` (beside `OctreeGrid`, `OctreeChunkRef`);
- pure helpers → `src/utils/octree/` (beside `lowerBoundNodeRow`);
- stateful CPU runtime → `src/services/octree/` (new);
- GPU cut and its TS↔WGSL layout → `src/services/gpu/octree/` (new), shaders → `src/services/gpu/shaders/octree/`.

None of these may import from `src/layers/`: a Layer composes the shared code, never the reverse.

**Renames, then moves** (rename first so the file follows the symbol, then one `move` manifest):

| Old (symbol @ path)                                                     | New (symbol @ path)                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| `StarOctree` @ `src/@types/data/starCatalog/`                           | `Octree` @ `src/@types/octree/`                              |
| `StarChunk` @ same                                                      | `OctreeChunk` @ `src/@types/octree/`                         |
| `StarResidency` @ same                                                  | `OctreeResidency` @ `src/@types/octree/`                     |
| `StarSourceBudgets` @ same                                              | `OctreeBudgets` @ `src/@types/octree/`                       |
| `StarChunkHost`, `StarChunkPlan`, `StarChunkRequest`, `StarChunkRoot`, `StarChunkStream`, `StarChunkStreamDeps`, `StarCutDraw`, `StarCutGpu`, `StarCutSource`, `StarCutSourceInput`, `StarCutSpec`, `StarCutState`, `StarDrawStream`, `StarOctreeIndex`, `StarPoolHost` @ `src/layers/starCatalog/@types/` | `Octree…` / `OctreeCut…` / `OctreeDrawStream` / `OctreeIndex` / `OctreePoolHost` @ `src/@types/octree/` (drop `Star`, keep the rest of the name) |
| `createStarChunkStream` @ `src/layers/starCatalog/load/starChunkStream.ts` | `createOctreeChunkStream` @ `src/services/octree/octreeChunkStream.ts` |
| `installStarPool` @ `src/layers/starCatalog/load/installStarPool.ts`    | `installOctreePool` @ `src/services/octree/installOctreePool.ts` |
| `starResidency` @ `src/layers/starCatalog/load/starResidency.ts`        | `octreeResidency` @ `src/services/octree/octreeResidency.ts` |
| `createStarCutGpu` @ `src/layers/starCatalog/render/starCutGpu.ts`      | `createOctreeCutGpu` @ `src/services/gpu/octree/octreeCutGpu.ts` |
| `src/layers/starCatalog/render/starCutLayout.ts` (`packStarCutNodes`, `STAR_FOLD_RECORDS`) | `src/services/gpu/octree/octreeCutLayout.ts` (`packOctreeCutNodes`, `CUT_FOLD_RECORDS`) |
| `sameStarCut` @ `src/layers/starCatalog/render/cut/sameStarCut.ts`      | `sameOctreeCut` @ `src/utils/octree/sameOctreeCut.ts`        |
| `planStarChunks` @ `src/utils/star/`                                    | `planOctreeChunks` @ `src/utils/octree/`                     |
| `starOctreeIndex` @ `src/utils/star/`                                   | `octreeIndex` @ `src/utils/octree/`                          |
| `starNodeOriginRelCamMpc` @ `src/utils/star/`                           | `octreeNodeOriginRelCamMpc` @ `src/utils/octree/`            |
| `STAR_CHUNK_CONCURRENCY` @ `src/data/starChunkConcurrency.ts`           | `OCTREE_CHUNK_CONCURRENCY` @ `src/data/octree/octreeChunkConcurrency.ts` |
| `src/data/starNodeFade.ts`                                              | `src/data/octree/octreeNodeFade.ts`                          |
| `shaders/starCatalog/cut.wesl`, `cutIo.wesl`                            | `shaders/octree/cut.wesl`, `cutIo.wesl`                      |

Stays in the star layer (star-specific): `StarColumns`, `starColumnsOf`, `starOctreeFromSkst`, `starOctreeFromIndex`
(made generic in Task 3), `packStarGpuRecords`, `resizeStarPools`, `starCutInputs`, `starSourcesInBand`,
`starCatalogVisible`, `drawStarCut`, `drawStarPick`, `starFocusRelCam`, `starCutCompute`, every `StarCatalog*` type,
`StarCutInputs`, `StarFocusSphere`.

**Contract after the content commit:**

```ts
// src/@types/octree/Octree.d.ts — `starCount` is renamed: a family-neutral type counts records
export type Octree<C extends { readonly count: number }> = {
  readonly grid: OctreeGrid;
  readonly recordCount: number;
  readonly columns: readonly ColumnSchema[];
  readonly nodes: OctreeNodeTable;
  readonly records: C;
  readonly chunks: readonly OctreeChunkRef[];
  readonly chunkCount: number;
  readonly chunkCapacity: number;
  readonly chunkNodeCap: number;
};
// OctreeChunk<C>, OctreeResidency<C>, OctreeChunkStream<C>, OctreeChunkStreamDeps<C>, OctreePoolHost<C>: same
// members as today, `StarColumns` replaced by `C`; star call sites write `Octree<StarColumns>`.

// src/@types/octree/OctreeCutInputs.d.ts — the cut GPU reads only these two (octreeCutGpu.ts:331-398)
export type OctreeCutInputs = { readonly cut: OctreeCutSpec; readonly nowMs: number };
// StarCutInputs becomes `OctreeCutInputs & { sizePx; brightness; glowOverlap; aggregateIntensityCap }`.

// octreeResidency takes the map, not the star runtime:
octreeResidency<C>(chunkStreams: ReadonlyMap<SourceType, OctreeChunkStream<C>>, source: SourceType): OctreeResidency<C>
```

- [x] Write the rename manifest (one entry per row above, `["<file>#<Symbol>", "<NewName>"]`) and run
      `npm run refactor -- rename --manifest <renames.json> --dry`; read the blast radius, then run it.
- [x] Write the move manifest (`[{ "from": …, "to": … }]`) and run `npm run move-files -- --manifest <moves.json> --dry`,
      then for real. Commit (mechanical only: "rename the star octree runtime to Octree and move it to a neutral home").
- [x] Fix by hand: the `package::starCatalog::cutIo` imports in `shaders/octree/cut.wesl` and
      `shaders/starCatalog/vertex.wesl:85-93` become `package::octree::cutIo`; the `cut.wesl?static` specifier in
      `octreeCutGpu.ts`. Grep `src tests tools docs` for every old symbol, basename and `starCatalog/cut`.
- [x] Content commit: the generic parameter `<C>` on the five types, `starCount` → `recordCount`, `OctreeCutInputs`,
      `octreeResidency`'s narrowed parameter, and the record-blind modules' remaining `star`-named locals and comments
      (the `Pc` names wait for Task 2). `grep -rn "layers/" src/services/octree src/services/gpu/octree src/utils/octree`
      prints nothing.
- [x] `docs/RENDERER.md:39,42,71,72`: the new paths and names.
- [x] Gate: `npm run typecheck:fast`, `npm test -- octree star`, `npm run build`. No new test (a rename).

### Task 2: the octree family table (prep 2)

**Files:** create `src/@types/octree/OctreeFamilyRow.d.ts`, `src/data/octree/octreeFamilies.ts`,
`src/data/octree/starOctreeFamily.ts`, `src/utils/octree/octreeIndexPath.ts`, `src/utils/octree/octreeChunkPath.ts`;
modify `src/data/octree/octreeFormat.ts:9-17,69-103` (star constants and the two star path functions leave),
`src/@types/octree/Octree.d.ts` (gains `family`), `src/utils/star/starOctreeFromIndex.ts`,
`src/utils/star/starOctreeFromSkst.ts`, `src/utils/octree/planOctreeChunks.ts:66-68,74-75`,
`src/utils/octree/octreeNodeOriginRelCamMpc.ts:20-32`, `src/utils/octree/octreeIndex.ts`,
`src/@types/octree/OctreeIndex.d.ts`, `src/services/gpu/octree/octreeCutLayout.ts:353,358`,
`src/layers/starCatalog/load/starCatalogFetcher.ts`, `src/services/octree/octreeChunkStream.ts`, `tools/stars/buildStars.ts:50,555`,
`tools/deploy/syncR2.ts:31-37`, `tools/deploy/r2/collectStarChunks.ts:13-18`, `tools/fetch/fetchPrebuiltData.ts:34-41`,
every importer of `STAR_COLUMN_SCHEMA` (16 files, fixtures included); test `tests/tools/octree/buildOctreeCatalog.test.ts`;
`docs/DATA.md:29`.

**Contract:**

```ts
// src/@types/octree/OctreeFamilyRow.d.ts
export type OctreeFamilyRow = {
  /** Data-root folder of the family's indexes; a catalog's chunks sit in `<dataPrefix>/<name>/`. */
  readonly dataPrefix: string;
  /** Render columns in wire order: what an index header's `columns` must equal. */
  readonly schema: readonly ColumnSchema[];
  /** The header stat that totals real records (`Octree.recordCount`). */
  readonly countStat: StatId;
  /** Mpc per grid unit. */
  readonly unitMpc: number;
};
// src/data/octree/octreeFamilies.ts
export const OCTREE_FAMILIES: Readonly<Record<OctreeFamily, OctreeFamilyRow>>; // { star: STAR_OCTREE_FAMILY }
// src/data/octree/starOctreeFamily.ts — today's values, moved verbatim
export const STAR_OCTREE_FAMILY: OctreeFamilyRow; // 'star-catalog/v2', STAR_COLUMN_SCHEMA, 'starCount', PC_TO_MPC
// Octree<C> gains `readonly family: OctreeFamily` (the index header's; 'star' for SKST).
octreeIndexPath(family: OctreeFamily, name: string): string; // `${dataPrefix}/${name}.bin`
octreeChunkPath(family: OctreeFamily, name: string, ref: Pick<OctreeChunkRef, 'level' | 'morton' | 'hash'>): string;
```

`countStat` is pulled forward from spec §3.1: Task 3's generic index decoder would otherwise read `starCount` by name
(`starOctreeFromIndex.ts:9`). `FAMILY_REQUIRED_COLUMNS` (`columnIds.ts`) stays where it is. The eight grid-unit sites
read `OCTREE_FAMILIES[octree.family].unitMpc` instead of `SCALE_UNITS.PC_TO_MPC`/`MPC_TO_PC`:
`planOctreeChunks.ts:66,67,68,74,75`, `octreeNodeOriginRelCamMpc.ts:25`, `octreeCutLayout.ts:353,358`; the `Pc`-suffixed
names on that path (`boxOriginPc`, `boxEdgePc`, `edgePc`, `minDistSqPc`) become grid-unit names. The two pc conversions
in `starCutInputs.ts:35` and `starCatalogVisible.ts:19` compare against the star row's `crossfadePc` band, not the grid,
and stay.

- [x] Golden test first, on the unchanged code: add
      `it('a seeded star bake keeps its pinned index digest')` to `buildOctreeCatalog.test.ts`, writing
      `nestedObjects(<seed>)` through `writeOctreeCatalog` and asserting `contentHash8` of the index file's bytes
      equals a literal captured from this run. The index header names every chunk's content hash, so this one digest
      pins every object's bytes. Its comment names what it guards (Tasks 2 and 5 must not move a baked byte). Commit it
      alone.
- [x] Add the row type, the star family file, the table and the two path helpers; move `STAR_COLUMN_SCHEMA` into
      `starOctreeFamily.ts` with `npm run refactor -- extract src/data/octree/octreeFormat.ts#STAR_COLUMN_SCHEMA src/data/octree/starOctreeFamily.ts`;
      delete `STAR_OCTREE_DATA_PREFIX`, `starChunkPath`, `starIndexPath` once every caller reads the table or helpers.
- [x] `Octree.family`, the eight unit sites and the renames. `octreeFormat.ts` no longer imports `starCatalogFormat`.
- [x] `docs/DATA.md:29`: one sentence, a family is a row of prefix, render schema, count stat and grid unit.
- [x] Gate: the golden digest unchanged; `npm test -- octree star deploy fetch`; typecheck. No other new test (constant
      plumbing; the existing planner, cut-layout and node-origin tests pin the unit maths).

### Task 3: injected stream and pool, extracted ordinal maps (prep 3)

**Files:** modify `src/services/octree/octreeChunkStream.ts:20-23,35,82,90`, `src/@types/octree/OctreeChunkStreamDeps.d.ts`,
`src/services/octree/installOctreePool.ts`, `src/@types/octree/OctreePoolHost.d.ts`,
`src/layers/starCatalog/load/resizeStarPools.ts`, `src/layers/starCatalog/load/starCatalogSlot.ts`,
`src/layers/starCatalog/load/starCatalogFetcher.ts`, `src/layers/starCatalog/render/starCatalogRenderer.ts:205-230`;
rename `src/utils/star/starOctreeFromIndex.ts` → `src/utils/octree/octreeFromIndex.ts`; create
`src/@types/octree/OctreeStreamFormat.d.ts`, `src/@types/octree/OctreePoolLayout.d.ts`,
`src/utils/octree/recordOrdinal.ts`, `src/utils/octree/poolRecordIndex.ts`; tests
`tests/utils/octree/recordOrdinal.test.ts` (new), `tests/services/octree/installOctreePool.test.ts` (new),
`tests/layers/starCatalog/render/starCatalogRenderer.pool.test.ts:306-323,384-…` (cases move); `docs/RENDERER.md:73`.

**Contract:**

```ts
// src/@types/octree/OctreeStreamFormat.d.ts — what a family hands the shared stream
export type OctreeStreamFormat<C> = {
  chunkPath(ref: Pick<OctreeChunkRef, 'level' | 'morton' | 'hash'>): string;
  decodeRecords(columns: ReadonlyMap<ColumnId, OctreeColumn>, count: number): C;
};
// OctreeChunkStreamDeps<C>: `binBaseName` is replaced by `format: OctreeStreamFormat<C>`; the rest unchanged.
installOctreePool<C>(host: OctreePoolHost<C>, source: SourceType, octree: Octree<C>, slots: number, format: OctreeStreamFormat<C>): void;
// OctreePoolHost<C>.renderer narrows to what the pool calls: upload / uploadChunk / evictChunk.
octreeFromIndex<C>(obj: DecodedOctreeObject<OctreeIndexHeader>, decodeRecords: OctreeStreamFormat<C>['decodeRecords']): Octree<C>;
// count from header.stats[OCTREE_FAMILIES[header.family].countStat]

// src/@types/octree/OctreePoolLayout.d.ts — the record pool: index records, then `slots` × `chunkCapacity`
export type OctreePoolLayout = { readonly indexRecords: number; readonly chunkCapacity: number; readonly slots: number };
recordOrdinal(layout: OctreePoolLayout, slotRefs: readonly (OctreeChunkRef | null)[], poolIndex: number): number | null;
poolRecordIndex(layout: OctreePoolLayout, slotRefs: readonly (OctreeChunkRef | null)[], ordinal: number): number | null;
```

The `type === 'starCatalog'` guard at `installStarPool.ts:23` (now `installOctreePool.ts`) moves to the star callers,
which resolve the registry row once and pass `slots` (`entry.budgets[tier].slots` or the override) and the star format
(`chunkPath: ref => octreeChunkPath('star', entry.binBaseName, ref)`, `decodeRecords: starColumnsOf`). The renderer
keeps its byte stride (`GPU_RECORD_BYTES`) and calls the two helpers with its own slot tables: `recordOrdinal` with
`pickSlotChunks` (the pick snapshot), `poolRecordIndex` with `slotChunks`, as today.

- [ ] Add `recordOrdinal.test.ts`: `maps an index record to itself and a resident chunk record to its record base + local`,
      `returns null past a chunk's own record count and for an empty slot`, and
      `poolRecordIndex inverts recordOrdinal for every resident record` (a property over a two-slot layout with hand
      record bases). Move the renderer cases at `starCatalogRenderer.pool.test.ts:306-323` and the record-base half of
      `:384` here; keep `:325` (the pick-snapshot race) in the renderer test.
- [ ] Add `installOctreePool.test.ts`: `a zero-chunk index installs no stream and replaces the previous one`
      (Review focus 2) and `a renderer that throws leaves the previous stream installed` (the comment at
      `installStarPool.ts:5-6` is the only statement of this today).
- [ ] Implement; the stream reads `format`, never `starChunkPath`, `starColumnsOf` or the registry.
- [ ] `docs/RENDERER.md:73`: the helpers' new home.
- [ ] Gate: the existing stream, pool and fetcher tests pass with only their construction changed;
      `grep -rn "starCatalog\|Star" src/services/octree src/utils/octree src/services/gpu/octree` prints nothing but
      comments that name the star layer as an example.

### Task 4: one list of octree catalogs for deploy (prep 4)

**Files:** create `tools/deploy/@types/OctreeCatalog.d.ts`, `tools/deploy/r2/octreeCatalogs.ts`,
`tools/deploy/r2/octreeDataFamilies.ts`; rename `tools/deploy/r2/collectStarChunks.ts` → `collectOctreeChunks.ts`
(`npm run refactor -- rename tools/deploy/r2/collectStarChunks.ts#collectStarChunks collectOctreeChunks`); modify
`tools/deploy/syncR2.ts:31-37,121-133`, `tools/deploy/r2/dataFamilies.ts:32-47`, `tools/fetch/fetchPrebuiltData.ts:100-150`
(`starChunkPaths` → `octreeChunkPaths`), `tools/stars/buildStars.ts:555-556`; tests
`tests/tools/deploy/r2/collectStarChunks.test.ts` (dragged), `tests/tools/fetch/fetchPrebuiltData.test.ts`,
`tests/tools/deploy/r2/dataFamilyOf.test.ts`; `docs/DEPLOY.md:47`.

**Contract:**

```ts
// tools/deploy/@types/OctreeCatalog.d.ts
export type OctreeCatalog = { readonly family: OctreeFamily; readonly name: string }; // name = index basename
// tools/deploy/r2/octreeCatalogs.ts
export const OCTREE_CATALOGS: readonly OctreeCatalog[]; // [{ family: 'star', name: 'stars' }]
// tools/deploy/r2/octreeDataFamilies.ts — the index row and the chunk row for one catalog
octreeDataFamilies(catalog: OctreeCatalog): readonly DataFamily[];
collectOctreeChunks(dataDir: string, catalog: OctreeCatalog): R2Upload[];
```

The generated rows equal today's: labels `star-catalog-v2-index` / `star-catalog-v2-chunks` (the prefix with `/` → `-`),
`dir` `star-catalog/v2` / `star-catalog/v2/stars`, file names `^stars\.bin$` / `^\d+-\d+\.bin$`, transports, gzip.
`syncR2` builds one bulk chunk group per catalog (its label may change); `fetchPrebuiltData` walks the chunks of every
manifest entry that names an `OCTREE_CATALOGS` index; `buildStars` writes under the star family's prefix with the star
catalog's name.

- [ ] Add `it('dataFamilyOf claims every OCTREE_CATALOGS index and its chunks')` to `dataFamilyOf.test.ts` (a structural
      invariant over the generated rows: fails if a row is mis-formed, never on a new catalog).
- [ ] Implement; delete the two hand rows at `dataFamilies.ts:32-47`.
- [ ] `docs/DEPLOY.md:47`: the chunk group and collector are per octree catalog.
- [ ] Gate: `npx tsx tools/deploy/syncR2.ts --dry-run` lists the same files with the same transport, cache-control and
      gzip before and after (needs a baked or linked `public/data`; `/link-data` does it), and `npm test -- deploy fetch`.

### Task 5: the aggregate rule table (prep 5)

**Files:** create `tools/@types/octree/ColumnAggregateRule.d.ts`, `tools/@types/octree/AggregateRecord.d.ts`,
`tools/@types/octree/AggregateBlob.d.ts`, `tools/octree/aggregateRules.ts`; modify `tools/octree/stratifyOctree.ts:110-180`,
`tools/octree/columnAggregate.ts` (unchanged values); test `tests/tools/octree/stratifyOctree.test.ts`.

**Contract:**

```ts
// tools/@types/octree/ColumnAggregateRule.d.ts — how one kind forms a blob from the records it stands for
export type ColumnAggregateRule = {
  /** Output values per record: 3 for a centroid, else 1. */
  readonly width: number;
  /** f64 sums kept per row: 3 for a centroid, 1 for the flux means (room for an axial mean's 2, `none`'s 0). */
  readonly sums: number;
  /** A centroid reads the record positions; every other kind its own input column. */
  readonly input: 'positions' | 'column';
  /** An own record: writes its `width` values at `out[width·rec + a]` and adds its weight into `sums[s][row]`. */
  own(r: AggregateRecord, out: Float32Array, rec: number, sums: readonly Float64Array[], row: number): void;
  /** A node with children: writes the blob's values at `out[width·at + a]` from the row's subtree sums. */
  blob(b: AggregateBlob, out: Float32Array, at: number, sums: readonly Float64Array[], row: number): void;
};
// AggregateRecord: { value(a): number; flux: number; boxMin: readonly number[]; edge: number }
// AggregateBlob:   { subFlux: number; subCount: number; boxMin: readonly number[]; edge: number }
// One scratch object of each, reused per row: no per-record allocation (the Gaia bake runs ~17 M records).
// tools/octree/aggregateRules.ts
export const AGGREGATE_RULES: Readonly<Record<ColumnAggregate, ColumnAggregateRule>>;
```

`stratifyOctree` keeps its loop and subtree sums but has no branch on the kind: the three `if`/`else` chains at
`stratifyOctree.ts:110-119,146-156,163-175` become `AGGREGATE_RULES[COLUMN_AGGREGATE[c.id]]` calls. Each rule keeps
today's arithmetic in today's order (`fluxCentroid`: `(sum/subFlux − box)/edge`; `fluxMeanMagnitude`:
`aggregateMeanAbsMag` over `fluxFromAbsMag` sums; `fluxWeightedMean`: `sum/subFlux`), since an f64 reordering moves
quantised bytes.

- [ ] Implement against Task 2's golden test.
- [ ] Gate: `a seeded star bake keeps its pinned index digest` unchanged, and the three `stratifyOctree` tests
      (flux conservation among them) pass unchanged. No new test: the golden digest pins the output. Optional, if raw
      Gaia is present: `npm run build-stars -- --out-dir <scratch>/after` against a before run, `cmp` the two
      `stars.bin`.

### Task 7: the galaxy point vertex body and one derivation function (prep 7) — `review: yes`

**Files:** create `src/services/gpu/shaders/galaxyCatalog/points/vertexBody.wesl`, `src/utils/galaxy/derivePointRecord.ts`,
`src/@types/engine/GalaxyPointFields.d.ts`, `src/@types/engine/GalaxyPointDerived.d.ts`,
`src/@types/engine/GalaxyPointStats.d.ts`, `src/data/galaxyCatalog/sdssTargetMeanMag.ts`; modify
`src/services/gpu/shaders/galaxyCatalog/points/vertex.wesl:80-352`, `src/services/engine/bake/buildPointInterleavedBuffer.ts:26-106`;
tests `tests/utils/galaxy/derivePointRecord.test.ts` (new, cases moved), `tests/services/engine/bake/buildPointInterleavedBuffer.test.ts`;
`docs/RENDERER.md:20`.

Invoke the `wesl-shaders` skill and read `docs/RENDERER.md` before touching a `.wesl` file; no backticks in WESL comments.

**Contract:**

```wgsl
// points/vertexBody.wesl — the whole of today's `vs` body; vertex.wesl keeps the bindings and becomes
//   @vertex fn vs(vi, ii, p) -> VSOut { return galaxyPointVertex(vi, ii, p, u, source, focus); }
fn galaxyPointVertex(vi: u32, pickIndex: u32, p: PerVertex, u: Uniforms, source: SourceUniforms,
                     focus: FocusUniforms) -> VSOut
```

Uniform structs pass by value (precedent: `focusAlphaMultiplier(worldPos, focus: FocusUniforms)` in
`lib/focusUniforms.wesl:65`). `PerVertex` stays a vertex-attribute value here; the feature's pooled prologue builds it
field by field from storage, never by passing a storage struct by value (the Adreno landmine). `pickIndex` replaces
`ii` in `packSelection` (`vertex.wesl` "myPacked"), so the pooled prologue can pass the pool-absolute record.

```ts
// src/@types/engine/GalaxyPointFields.d.ts — one galaxy as the interleave reads it
export type GalaxyPointFields = {
  x: number; y: number; z: number;             // Mpc
  magnitude: number;                            // apparent, the band `magG` holds; NaN allowed
  axisRatio: number; positionAngleDeg: number; diameterKpc: number;
  orientationIsFallback: boolean; diameterIsFallback: boolean;
};
// src/@types/engine/GalaxyPointStats.d.ts — per catalog (per tier file today)
export type GalaxyPointStats = { readonly magOffset: number; readonly medianAbsMag: number };
// src/@types/engine/GalaxyPointDerived.d.ts — slots 3, 5, 6-7, 8, 10, 11 of the interleave
export type GalaxyPointDerived = {
  magnitude: number; axisRatio: number; paCos: number; paSin: number; radiusMpc: number; absMag: number; sbAmp: number;
};
derivePointRecord(f: GalaxyPointFields, stats: GalaxyPointStats, out: GalaxyPointDerived): void;
```

The function holds today's arithmetic from `buildPointInterleavedBuffer.ts:63-105` in today's order (NaN magnitude snaps
to `SDSS_TARGET_MEAN_MAG`, the PA sign flip, the two sign-bit flags, `paddedRadiusMpc`, slot 10 from the offset slot 3,
`galaxySbAmp` from the raw apparent magnitude). Colour index and angular weight stay at the call site: the octree bakes
its colour index and decodes its own weight. `out` is reused per row: no allocation per galaxy (~3.5 M rows). The
interleave still computes `magOffset` itself in this task (Task 6 moves it to the record source).

- [ ] Move the derivation cases of `buildPointInterleavedBuffer.test.ts` (`:53,70,86,114,128`, the slot 5/6-7/8/10
      cases) into `derivePointRecord.test.ts` retargeted at the function with the same hand values, and add
      `a NaN magnitude snaps to the SDSS target mean and still derives a finite absMag offset` (Review focus 5). The
      interleave test keeps layout, positions, angular weight, mean shift and colour fallback.
- [ ] Extract `derivePointRecord`; the interleave loop calls it once per row.
- [ ] Extract `galaxyPointVertex` into `vertexBody.wesl`; the pick renderer compiles the same `vertex.wesl`, so both
      pipelines take it.
- [ ] `docs/RENDERER.md:20`: the derivation and the vertex body each have one home.
- [ ] Gate: `npm run build`; pixel-identical before/after with `npm run shot -- '<link>' --url <wt server> --png --hide-ui --out data/shots/prep7-<pose>-<before|after>.png`
      at `#pose=a,0,0,0,5.8964,0.0552,12372.364,0` (perf `full-survey`), `#pose=a,0,0,0,5.8964,0.0552,3500,0`
      (3.5 Gpc), `#pose=a,0,0,0,8.2811,0.5612,21.268361,0` (perf `local-group`) and `#focus=m81` (inside the Local
      Volume). Shoot one pose twice on the same commit first; compare decoded pixels (`sharp(file).raw().toBuffer()`
      byte equality). If the double shot differs, the gate is "differs no more than the double shot". The bias mode is
      not in the URL, so these cover the default mode; the body moves verbatim, so the other modes ride the same code.
      Perf before/after if the controller took the perf gate.

### Task 6: `GalaxyRecordSource` over the flat catalogs (prep 6) — `review: yes`, LAST

Start after PR #912 has merged: merge main into the branch first. The task follows the R1–R4 rulings above.

**Files:** create `src/layers/galaxyCatalog/@types/GalaxyRecordSource.d.ts`,
`src/@types/data/galaxyCatalog/GalaxyDurableIdClaim.d.ts`, `src/layers/galaxyCatalog/load/flatGalaxyRecordSource.ts`,
`src/layers/galaxyCatalog/present/galaxyRecordBridge.ts`, `src/layers/galaxyCatalog/@types/GalaxyRecordBridge.d.ts`,
`src/utils/galaxy/galaxyMagOffset.ts`; modify `src/layers/galaxyCatalog/@types/GalaxyCatalogRuntime.d.ts:27-52`,
`src/layers/galaxyCatalog/create.ts`, `destroy.ts`, `src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot.ts:40-85`,
`src/layers/galaxyCatalog/load/galaxyCatalogSourceCounts.ts`, `src/layers/galaxyCatalog/load/buildAliasIndex.ts`,
`src/@types/engine/BuildAliasIndexInput.d.ts`, `src/@types/engine/AliasIndexEntry.d.ts`,
`src/layers/galaxyCatalog/present/galaxyCatalogSelectionRow.ts` (whole file), `src/layers/galaxyCatalog/frame.ts:46-84`,
`src/layers/galaxyCatalog/present/structureMembership.ts`, `structureMemberCount.ts`,
`src/layers/galaxyCatalog/@types/CatalogWithSource.d.ts` (deleted if unused),
`src/services/engine/bake/buildPointInterleavedBuffer.ts:36-52`, `src/@types/engine/BuildPointInterleavedBufferInput.d.ts`,
`src/layers/galaxyCatalog/render/catalogStore.ts`, `src/layers/galaxyCatalog/@types/CatalogStore.d.ts:8`,
`src/@types/rendering/GalaxyPointRenderer.d.ts:31`, `src/layers/galaxyCatalog/render/galaxyPointRenderer.ts`,
`src/@types/data/galaxyCatalog/GalaxyCatalogSourceEntry.d.ts`, `src/layers/galaxyCatalog/sources/glade.ts`, `twomrs.ts`,
`sdss.ts`, `src/components/CommandPalette/paletteRows.tsx:171-172`, `src/utils/palette/actionForRow.ts:62-75`,
`src/layers/galaxyCatalog/subsystems/diskPlannerWalk.ts`, `proceduralDiskSubsystem.ts`, `texturedDiskSubsystem.ts`,
`src/@types/engine/subsystems/DiskRowVisitor.d.ts`, `DiskWalkInput.d.ts`, `src/services/url/encodeGalaxyId.ts` and the
`pos@` decoder (R2); tests
`tests/support/selectionResolverOver.ts`, `tests/layers/galaxyCatalog/load/flatGalaxyRecordSource.test.ts` (new),
`tests/layers/galaxyCatalog/present/galaxyRecordBridge.test.ts` (new), and the fixture lines (only) of the galaxy tests
that build `catalogs`.

**Contract (spec §5.1 with the R1–R4 rulings applied):**

```ts
// src/layers/galaxyCatalog/@types/GalaxyRecordSource.d.ts
export type GalaxyRecordSource = {
  readonly source: GalaxyCatalogSourceType;
  /** Real records the source holds in total (UI count); resident or not. */
  readonly recordCount: number;
  readonly stats: { readonly medianAbsMag: number; readonly magOffset: number; readonly provenance: ProvenanceCounts };
  /** Pick instance → ordinal and back; null when the record's object is not resident. */
  ordinalOfPick(pickIndex: number): number | null;
  pickOfOrdinal(ordinal: number): number | null;
  /** Resident records as column blocks (R3): the flat source yields its catalog once; record ordinal = ordinalBase + i. */
  forEachResidentBlock(visit: (block: GalaxyColumnBlock, ordinalBase: number) => void): void;
  /** Synchronous membership for the palette join (R4): does this source hold `pgc-…` / `sdss-…`? */
  hasDurableId(id: string): boolean;
  /** The three lookups that may need data first (R1): a plain value when it is at hand, a promise when it is not. */
  loadRow(ordinal: number): GalaxyRow | null | Promise<GalaxyRow | null>;
  resolveDurableId(id: string): number | null | Promise<number | null>; // `pgc-…`, `sdss-…` → ordinal
  /** R2: `distMpc` null for a legacy two-part `pos@` id, answered by direction within 30″. */
  resolvePosition(raDeg: number, decDeg: number, distMpc: number | null): number | null | Promise<number | null>;
};

// src/@types/data/galaxyCatalog/GalaxyColumnBlock.d.ts — what the disk walk, its visitors and structure membership read
// (proceduralDiskSubsystem.ts:107-132, texturedDiskSubsystem.ts:159-162, diskPlannerWalk.ts); medianAbsMag comes
// from the source's `stats`, not the block
export type GalaxyColumnBlock = Pick<
  GalaxyCatalog,
  'count' | 'positions' | 'diameterKpc' | 'axisRatio' | 'positionAngleDeg' | 'magU' | 'magG' | 'magR' | 'magI' | 'magZ'
>;

// src/@types/data/galaxyCatalog/GalaxyDurableIdClaim.d.ts — which id kind a row's objIDs carry, and who answers first
export type GalaxyDurableIdClaim = { readonly prefix: 'pgc' | 'sdss'; readonly rank: number };
// GalaxyCatalogSourceEntry gains `readonly durableId?: GalaxyDurableIdClaim`:
// GLADE { 'pgc', 0 }, 2MRS { 'pgc', 1 }, SDSS { 'sdss', 0 }; every other row (famous, Milliquas, DESI) has none.

flatGalaxyRecordSource(entry: GalaxyCatalogRegistryEntry, catalog: GalaxyCatalog,
                       famousMeta: () => readonly FamousGalaxyMetaEntry[]): GalaxyRecordSource;
galaxyMagOffset(catalog: Pick<GalaxyCatalog, 'count' | 'magG'>): number; // buildPointInterleavedBuffer.ts:36-48, moved
// GalaxyCatalogRuntime gains `readonly records: ReadonlyMap<GalaxyCatalogSourceType, GalaxyRecordSource>`;
// `catalogs` stays for the flat-only readers (point upload, hi-res famous, famous labels).
// BuildPointInterleavedBufferInput and GalaxyPointRenderer.upload gain `stats: GalaxyPointStats` (Task 7's type).
```

**The flat implementation:** ordinal = row index; `ordinalOfPick`/`pickOfOrdinal` are the identity on `[0, count)`,
null outside; `forEachResidentBlock` yields the catalog once with `ordinalBase` 0; `loadRow` is
`extractGalaxyRow(catalog, o, source, famousMeta())`; `resolveDurableId` and `hasDurableId` answer only their row's
`durableId.prefix` (null/false for any other prefix, and for every id on a row without a claim, so the famous
catalog's synthetic `objIDs` never answer); `resolvePosition` with a distance returns the nearest record within 30″
and 0.05 Mpc, without one the nearest within 30″ (today's search). `stats`:
`magOffset = galaxyMagOffset(catalog)`, `medianAbsMag = catalog.medianAbsMag ?? galaxyMedianAbsMag(catalog)`,
`provenance = countEstimatedProvenance(catalog)` (from `wireGalaxyCatalogSourceSlot.ts:76`). The flat source is built at
commit, before `pointRenderer.upload(id, cloud, source.stats)`, and removed with the catalog on release.

**The bridge** (`galaxyRecordBridge`, inside the galaxy Layer) serves the synchronous `SelectionKindRow`: `extractRow`,
`focusId.decode` and `focusId.encode` call it. A plain value returns at once. A promise is memoised per key
(`<source>:<ordinal>` for rows, the id for decodes), the call returns null while it is pending, and on settle the
bridge notifies a runtime listener that `galaxyCatalogSourceCounts` answers by re-emitting that source's current
`recordCount`: the pulse `resolveFocusRefDeferringSaga.ts:16-21` already retries on. The saga does not change. A
source's release drops its memo entries. `pgc-`/`sdss-` decode asks every loaded source's `resolveDurableId`, sources
ordered by their claim's `rank`, first non-null winning; famous ids still resolve through `famousMeta`.

**The consumers** (all 12 of the checkpoint):

| Consumer                    | Today                                              | After                                              |
| --------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| pick                        | `resolvePick` index = `pick.localIdx` (`:31-35`)   | `ordinalOfPick`                                    |
| highlight                   | `encodePick` packs `ref.index` (`:36`)             | packs `pickOfOrdinal(ref.index)`, null when null   |
| InfoCard row                | `extractGalaxyRow(catalogs.get…)` (`:37-45`)       | bridge → `loadRow`                                 |
| focus-id encode             | `encodeGalaxy` (`:146-162`)                        | bridge → `loadRow`, then `encodeGalaxyId` unchanged |
| `pgc-` decode               | `resolvePgc`, `[Glade, TwoMRS]` scan (`:87-95`)    | bridge → every source's `resolveDurableId`         |
| `sdss-` decode              | `resolveSdss` (`:97-102`)                          | same                                               |
| `pos@` encode and decode    | `pos@<ra>,<dec>`; `resolvePos` brute force (`:108-137`) | `pos@<ra>,<dec>,<dMpc>`; bridge → every source's `resolvePosition`, legacy ids with `null` distance (R2) |
| palette names               | `buildAliasIndex` objIDs join, `[Glade, TwoMRS]` (`frame.ts:50-54`) | the same join through `hasDurableId`, over every source with a `pgc` claim (R4) |
| disk walk and visitors      | stride cursor over `catalogs.entries()`, sticky maps by row index | `forEachResidentBlock`, the stride window per block, sticky maps by ordinal (R3) |
| structure membership        | `positions` loop, packs `(source, i)`              | `forEachResidentBlock`, packs `pickOfOrdinal(ordinalBase + i)` |
| structure member count      | `getCloud` per source                              | `records.get(source)`                              |
| `magOffset`, `medianAbsMag` | recomputed per upload in the interleave            | `stats`, passed to the interleave                  |
| provenance counts           | `countEstimatedProvenance` at slot subscribe       | `stats.provenance`                                 |
| source counts               | `state.value.count` (`galaxyCatalogSourceCounts.ts:20`) | `recordCount`                                 |

Under R4 the alias index keeps its shape and its rebuild key (`frame.ts:47-48`); `AliasIndexEntry.localIdx` becomes
the record ordinal, which equals the row index for every flat source.

- [ ] `flatGalaxyRecordSource.test.ts`, hand-computed values:
      `stats equal the per-tier values` (fixture `magG` [16, 17, NaN] → `magOffset` 1.5; `medianAbsMag` passes the
      catalog's −21 through; provenance counts one estimated orientation and two estimated diameters of three rows),
      `ordinalOfPick and pickOfOrdinal are the identity on [0, count) and null outside`,
      `resolveDurableId answers only its row's claim` (`pgc-<n>` on a GLADE fixture → its row; `sdss-<n>` → null;
      the famous fixture with `objIDs` [0, 1, 2, 3] answers `pgc-3` with null: Review focus 3),
      `hasDurableId agrees with resolveDurableId`,
      `resolvePosition with a distance finds the record and without one keeps today's 30 arcsec search`,
      `forEachResidentBlock yields the catalog once at ordinal base 0`.
- [ ] `encodeGalaxyId`/decode round-trip parity test extended: a galaxy without a catalog id encodes
      `pos@<ra>,<dec>,<dMpc>` and decodes back to itself; a legacy `pos@<ra>,<dec>` still decodes to the same galaxy.
- [ ] `galaxyRecordBridge.test.ts` over a fake source whose lookups return deferred promises:
      `returns null while a lookup is pending, then the settled value after one pulse`,
      `a released source's settled row is never served` (Review focus 4),
      `pgc decode prefers the lower rank when two sources hold the id`.
- [ ] Implement: types and claim rows, `galaxyMagOffset`, the flat source, runtime `records`, the bridge, then each
      consumer in the table's order.
- [ ] Rewrite `tests/support/selectionResolverOver.ts` to build `records` from the fixtures' catalogs; every galaxy
      test's assertions stay as they are (only fixture construction changes), except the `pos@` encode expectations,
      which gain the distance (R2); name each changed assertion in the reply.
- [ ] Gate: the stats test above; `npm test -- galaxyCatalog selection palette focusUrl tier arrival`; the existing
      `pgc-<objId> → GLADE first, then 2MRS` case (`composeSelectionRows.test.ts:343`) passes unchanged; Task 7's four
      shots unchanged (the interleave now reads `stats`).

---

## Definition of Done

**Deliverables**

- `Octree<C>`, `OctreeChunk<C>`, `OctreeResidency<C>`, `OctreeBudgets` and the companion `Octree…` types in
  `src/@types/octree/`; no `StarOctree`, `StarChunk`, `StarResidency` or `StarSourceBudgets` symbol left.
- `src/services/octree/` (`octreeChunkStream`, `installOctreePool`, `octreeResidency`), `src/services/gpu/octree/`
  (`octreeCutGpu`, `octreeCutLayout`), `src/utils/octree/` (`planOctreeChunks`, `octreeIndex`,
  `octreeNodeOriginRelCamMpc`, `octreeFromIndex`, `sameOctreeCut`, `recordOrdinal`, `poolRecordIndex`,
  `octreeIndexPath`, `octreeChunkPath`), `shaders/octree/cut.wesl` + `cutIo.wesl`; none imports from `src/layers/`.
- `OCTREE_FAMILIES` with the star row in its own file; the eight grid-unit sites read `unitMpc`.
- `OCTREE_CATALOGS` driving the sync chunk group, `collectOctreeChunks`, the generated `DATA_FAMILIES` rows and
  `fetchPrebuiltData`.
- `AGGREGATE_RULES`; `stratifyOctree` has no branch on the aggregate kind.
- `galaxyPointVertex` in `points/vertexBody.wesl`, called by `vs`; `derivePointRecord`, called by the interleave.
- `GalaxyRecordSource` with `flatGalaxyRecordSource`; the bridge; 11 consumers on it; `durableId` claims on the GLADE,
  2MRS and SDSS rows; no `[Glade, TwoMRS]` list left in `src/`.
- `a seeded star bake keeps its pinned index digest` in the suite.

**Smoke (on the branch's dev server, against a linked `public/data`)**

- Stars: the Earth pose streams chunks (debug panel chunk count rises), a tier switch resizes the pool with no index
  refetch, a star pick fills its InfoCard.
- Galaxies: a GLADE pick fills the InfoCard and highlights; `#focus=pgc-2789` lands on the same galaxy as on main;
  `#focus=sdss-<objId>` and a `pos@` link resolve; palette search `NGC 4565` focuses it; a tier switch keeps the
  selection; a selected cluster shows the same member count as on main.
- Task 7's four shots pixel-identical to main; `syncR2 --dry-run` lists the same files as on main.

**Out of scope (the feature PR)**

The galaxy family row, `COLUMN_IDS`/`STAT_IDS` growth, `SKOF` info objects, the `u64` store, the GLADE emitter call, the
galaxy stratify setting, the octree record source, `galaxyPooledPointRenderer`, pgc shards, the `octree` member on
GLADE's row, `GalaxyCatalogFormat` and the per-source `formats` setting, any `storage` member on the record source, the
Cloudflare cache rule, catalog-wide stats for the flat sources, and (under R3) disks for GLADE's resident chunks.
