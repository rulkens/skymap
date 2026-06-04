# Nearby Galaxy Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth featured structure category, `group`, seeded with 16 verified Local Volume galaxy groups (Local Group, M81, Cen A, …), rendered as labelled halo+ring markers like clusters/superclusters/voids.

**Architecture:** Purely additive over the post-#253/#254 POI seam. `group` is a new `'poi'`-type `Source` code + a new `StructureCategory` arm; it rides the existing `StructureStore` → `produceStructureMarkers`/`produceStructureLabels` → `clusterMarkerRenderer` path. No new binary format, no bulk catalog, no async load — groups are seed-only, exactly like voids.

**Tech Stack:** TypeScript, Vitest, the existing `clusterMarkerRenderer` (WebGPU) and `data/cluster_anchors.seed.json` curated seed.

**Spec:** `docs/superpowers/specs/2026-06-04-nearby-galaxy-groups-design.md` — read it first. Decisions are resolved (§10): tint `#8FBF8F`, `Source.Group = 15`, uniform weight, 16 groups, Maffei kept as the 16th estimated entry.

**Mirror `void` everywhere.** Voids are the closest precedent (seed-only, featured, marker-bearing). For nearly every edit the rule is "find where `'void'` / `Source.Void` appears and add the `'group'` / `Source.Group` sibling." Read the current code at each cited line before editing — do not trust pasted snippets.

**Ordering:** types → source code → pick decode → seed parse → style → POI builder → renderer → focus/UI/wiring → seed data → visual verify. Each task is green before the next. Run `npm test` (single run) + `npm run typecheck` from this worktree; subagents implement but the main thread runs the commands + commits.

---

### Task 1: Add `group` to the structure-category type + record union

**Files:**
- Modify: `src/@types/engine/data/StructureCategory.d.ts`
- Modify: `src/@types/engine/data/StructureRecord.d.ts`
- Test: `tests/@types/engine/data/structureRecord.types.test.ts`

**Contract.** After this task:
```ts
// StructureCategory.d.ts
export type StructureCategory = 'cluster' | 'supercluster' | 'void' | 'group';
```
```ts
// StructureRecord.d.ts — new arm, mirrors VoidRecord (no extra fields)
type GroupRecord = StructureBase & { readonly category: 'group' };
export type StructureRecord = ClusterRecord | SuperclusterRecord | VoidRecord | GroupRecord;
```
`PoiCategory` (`= StructureCategory | 'famousGalaxy'`) widens automatically; no edit there.

- [ ] **Step 1: Extend the type test.** In `tests/@types/engine/data/structureRecord.types.test.ts`, add a `group` case mirroring the existing `void` assertion (a `GroupRecord`-shaped literal is assignable to `StructureRecord`; `category: 'group'` narrows to the group arm). Match the file's existing `expectTypeOf`/`satisfies` idiom.
- [ ] **Step 2: Run it, expect FAIL.** Run: `npm run typecheck` — expect a type error that `'group'` is not assignable to `StructureCategory`.
- [ ] **Step 3: Add `'group'`** to the `StructureCategory` union and the `GroupRecord` arm + union member per the contract above.
- [ ] **Step 4: Run, expect PASS.** Run: `npm run typecheck` — clean.
- [ ] **Step 5: Commit.** `git add` the three files; message `feat(groups): add 'group' to StructureCategory + StructureRecord`.

---

### Task 2: Allocate `Source.Group = 15` + registry row + galaxyType guard

**Files:**
- Modify: `src/data/sources.ts` (enum block ~line 110–115; POI registry rows ~267–281)
- Modify: `src/utils/math/galaxyType.ts:69-71` (non-survey `throw` switch)
- Test: existing `tests/.../sources*.test.ts` if present, else rely on typecheck

**Contract.** Append (NEVER renumber — see the enum docstring `sources.ts:36-42`):
```ts
// in the Source const, after DebugSpherical: 14
Group: 15,
```
```ts
// SOURCE_REGISTRY — mirror the Source.Void PoiEntry row exactly:
[Source.Group]: { type: 'poi', code: Source.Group, label: 'Group', allSky: true, visible: true },
```
`Source.Group` is pick-safe (5-bit code, < 31 sentinel) and NOT persisted to `.bin` (only survey codes 0–8 are) — so no data rebuild, non-breaking.

- [ ] **Step 1:** Add `Group: 15` to the `Source` const and the `SOURCE_REGISTRY[Source.Group]` row per the contract. The registry `satisfies Readonly<Record<SourceType, SourceEntry>>` totality will force the row to exist.
- [ ] **Step 2:** In `galaxyType.ts:69-71`, add `case Source.Group:` to the existing non-survey `case Source.Cluster: case Source.Supercluster: case Source.Void: …` fallthrough that `throw`s — groups have no photometry. (Place it adjacent to the other POI cases.)
- [ ] **Step 3: Run, expect PASS.** Run: `npm run typecheck && npm test` — clean (totality satisfied; the `galaxyType` switch is now exhaustive over `Source`).
- [ ] **Step 4: Commit.** `feat(groups): allocate Source.Group=15 + registry row`.

---

### Task 3: Decode `Source.Group` picks → `kind: 'group'`

**Files:**
- Modify: `src/data/selectionEncoding.ts` (`DecodedPick` union ~90-93; decode fn ~125-134)
- Modify: `src/services/engine/interaction/clickHandler.ts:106` (POI guard)
- Test: `tests/data/selectionEncoding.test.ts` (or the file that tests `unpackPick`/the decode fn)

**Contract.** Extend the discriminated union + decode:
```ts
// DecodedPick — add the arm
| { readonly kind: 'group'; readonly poiIndex: number };
// decode fn — add after the void branch (selectionEncoding.ts:134)
if (sourceCode === Source.Group) return { kind: 'group', poiIndex: localIdx };
```
`runFrame.ts:456` passes `category: pick.kind` generically and `resolvePoiFromPick` dispatches on `byCategory(category)` — both work unchanged once `'group'` is a valid `kind`/`PoiCategory`. Only `clickHandler.ts:106`'s explicit `result.kind === 'cluster' || … || 'void'` guard needs `|| result.kind === 'group'`.

- [ ] **Step 1: Write the failing test.** In the selection-encoding decode test, assert that a pick word built from `sourceCode = Source.Group (15)` and a `localIdx` decodes to `{ kind: 'group', poiIndex: localIdx }`. Mirror the existing `'void'` decode assertion in that file (use the same pack helper the void case uses).
- [ ] **Step 2: Run, expect FAIL.** Run: `npm test -- selectionEncoding` — the group decode returns the fallthrough/sentinel, not `kind: 'group'`.
- [ ] **Step 3: Implement** the `DecodedPick` arm + decode branch + the `clickHandler.ts:106` guard per the contract.
- [ ] **Step 4: Run, expect PASS.** Run: `npm test -- selectionEncoding && npm run typecheck`.
- [ ] **Step 5: Commit.** `feat(groups): decode Source.Group picks to kind 'group'`.

---

### Task 4: Accept `'group'` in the seed parser

**Files:**
- Modify: `tools/parsers/parseClusterSeed.ts:21` (`VALID_CATEGORIES`)
- Test: `tests/tools/parsers/parseClusterSeed.test.ts`

**Contract:** `const VALID_CATEGORIES = ['cluster', 'supercluster', 'void', 'group'] as const;` — `ClusterSeedEntry['category']` widens from this const automatically, so no other change in the parser.

- [ ] **Step 1: Write the failing test.** Add a case asserting `parseClusterSeed` accepts a minimal valid entry with `category: 'group'` and round-trips it (mirror the existing `'void'`-accepts test); keep the existing "rejects unknown category" test green by using a still-invalid string like `'blob'`.
- [ ] **Step 2: Run, expect FAIL.** Run: `npm test -- parseClusterSeed` — the group entry is rejected as an unknown category.
- [ ] **Step 3: Add `'group'`** to `VALID_CATEGORIES`.
- [ ] **Step 4: Run, expect PASS.** Run: `npm test -- parseClusterSeed`.
- [ ] **Step 5: Commit.** `feat(groups): accept 'group' category in parseClusterSeed`.

---

### Task 5: Add the `group` marker style row

**Files:**
- Modify: `src/services/engine/presentation/structurePoiStyles.ts` (`STRUCTURE_POI_STYLES`)
- Test: none new — totality on `Record<StructureCategory, StructureMarkerStyle>` is the gate (typecheck)

**Contract.** Add a `group` row. Start from the `void` row (closest analog) but: tint `#8FBF8F` (soft green) for `labelColor`/`haloColor`/`ringColor`; `worldEmMpc ≈ 0.3` (group labels are physically tiny); `markerMinApparentRadiusPx ≈ 5` + `markerMinApparentFadeBandPx ≈ 4` (like `cluster`, so a small *near* ring stays visible rather than tripping the void/SC floor of 28). `haloColor` is a plain `Vec4` now — groups get a normal halo (no skip). Keep `markerMax*`, `outline*`, `minPixelSize`/`maxPixelSize` matching the `cluster` row.

- [ ] **Step 1: Run typecheck, expect FAIL.** Run: `npm run typecheck` — `STRUCTURE_POI_STYLES` is missing the `group` key required by `Record<StructureCategory, StructureMarkerStyle>` (since Task 1 added `'group'`).
- [ ] **Step 2: Add the `group` row** per the contract.
- [ ] **Step 3: Run, expect PASS.** Run: `npm run typecheck`.
- [ ] **Step 4: Commit.** `feat(groups): add group marker style (soft-green ring/halo)`.

---

### Task 6: Build `group` records from the seed

**Files:**
- Modify: `src/data/buildStaticAnchorPois.ts` (local `SeedEntry.category`; `buildAnchorPoi` switch)
- Test: `tests/data/buildStaticAnchorPois.test.ts`

**Contract.** Widen the local `SeedEntry.category` to include `'group'` and add the switch case:
```ts
case 'group':
  return { ...common, category: 'group' };
```
(`common` already carries `id`, `name`, `worldPos`, `featured: true`, `significance`, radii — same as the `void` branch.) Resulting id is `group-<seed.id>`.

- [ ] **Step 1: Write the failing test.** Add a case feeding a `group` seed entry (build it inline, mirroring the existing `void` test fixture) and asserting the returned record has `id === 'group-<id>'`, `category === 'group'`, `featured === true`, and a `worldPos` equal to `raDecDistToEqCart(entry)`.
- [ ] **Step 2: Run, expect FAIL.** Run: `npm test -- buildStaticAnchorPois` — the switch has no `'group'` arm (non-exhaustive / wrong category).
- [ ] **Step 3: Implement** the `SeedEntry` widening + switch case.
- [ ] **Step 4: Run, expect PASS.** Run: `npm test -- buildStaticAnchorPois && npm run typecheck`.
- [ ] **Step 5: Commit.** `feat(groups): build group StructureRecords from the seed`.

---

### Task 7: Render `group` markers (halo + ring + pick) in clusterMarkerRenderer

**Files:**
- Modify: `src/services/gpu/renderers/clusterMarkerRenderer.ts`
- Test: `tests/services/gpu/renderers/clusterMarkerRenderer.test.ts`, `tests/services/gpu/renderers/clusterMarkerRenderer.pick.test.ts`

**Contract — the marker-bearing category set gains `group`.** Edit every site that hardcodes the `'cluster' | 'supercluster' | 'void'` triple (CPU-mode logic; the GPU pipelines are category-agnostic):
- `SOURCE_CODE_BY_CATEGORY` (~104): add `group: Source.Group`.
- `POI_CATEGORIES_WITH_MARKERS` (~110): add `'group'`.
- `bucketOffsets` / `bucketCounts` initializers (~169, ~174) and the `writeCursor` record in `setMarkers` (~483): add `group: 0`.
- `setMarkers` count + pack guards (~473-475, ~490): add the `group` branch.
- The per-category source uniform construction loop already iterates `POI_CATEGORIES_WITH_MARKERS`, so it picks up `group` for free.

**Group renders a normal halo** — do NOT add a `cat === 'group'` skip in the halo draw (~568); that skip is void-only.

- [ ] **Step 1: Write the failing test.** In `clusterMarkerRenderer.test.ts`, mirror the existing void bucket test: feed descriptors of mixed categories incl. one `category: 'group'`, assert the `group` bucket count/offset is correct and `markerCount()` includes it. In `clusterMarkerRenderer.pick.test.ts`, mirror the void pick case: assert a `group` descriptor draws under the `Source.Group` source-uniform bucket (per-category `instance_index` 0-based).
- [ ] **Step 2: Run, expect FAIL.** Run: `npm test -- clusterMarkerRenderer` — group descriptors are dropped (no bucket) and/or a type error on the records missing `group`.
- [ ] **Step 3: Implement** the additions at every cited site.
- [ ] **Step 4: Run, expect PASS.** Run: `npm test -- clusterMarkerRenderer && npm run typecheck`.
- [ ] **Step 5: Commit.** `feat(groups): render + pick group markers in clusterMarkerRenderer`.

---

### Task 8: Wire `group` into focus + UI toggles; rename the fetch-gate list

**Files:**
- Modify: `src/services/engine/subsystems/clusterFocusSubsystem.ts:71`
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx` (~131 list; ~146; ~789, ~832 labels)
- Modify: `src/components/DebugPanel/LabelEffectsSection.tsx:25`
- Modify: `src/services/engine/wiring/assetWiring.ts:74` (rename only — see contract)
- Test: existing component/subsystem tests if they enumerate categories; otherwise typecheck

**Contract — group is in the UI + focus sets, NOT the fetch-gate set:**
- `clusterFocusSubsystem.ts:71`: add `|| poi.category === 'group'` to the focus-eligible predicate (groups are clickable/focusable like clusters).
- `SettingsPanel.tsx`: add `'group'` to the UI `STRUCTURE_CATEGORIES` list (~131) and any sibling list (~146); add the `'Groups'` display label to the ternaries at ~789 and ~832 (currently `cat === 'void' ? 'Voids' : 'Clusters'` style — extend to handle `'group' → 'Groups'`).
- `DebugPanel/LabelEffectsSection.tsx:25`: add `'group'` to its category list (verify it's a structure-category list before editing).
- `assetWiring.ts:74`: **rename** `STRUCTURE_CATEGORIES` → `BULK_CATALOG_CATEGORIES` and leave its membership as `['cluster', 'supercluster', 'void']` (do **NOT** add `'group'`). Update its docstring to say "categories backed by the bulk `.ccat`; groups are seed-only and excluded." This prevents a future reader from merging it with the UI list and wrongly gating the fetch on group visibility (spec §3).

- [ ] **Step 1:** Make the four edits per the contract. If `SettingsPanel`/`LabelEffectsSection` have snapshot or enumeration tests, update expected category counts to include `group` first (so the test drives the change).
- [ ] **Step 2: Run, expect PASS.** Run: `npm run typecheck && npm test` — green (the `assetWiring` rename has no behaviour change; UI lists now include group).
- [ ] **Step 3: Commit.** `feat(groups): wire group into focus + settings UI; rename bulk-catalog category list`.

---

### Task 9: Seed the 16 verified groups

**Files:**
- Modify: `data/cluster_anchors.seed.json`

**Contract.** Append 16 `"category": "group"` entries. Use the values from spec §6 (RA hours, Dec deg, distMpc, `physicalRadiusMpc = Rh`, `apparentRadiusMpc = R0`). Each entry mirrors the void-entry JSON shape (`id`, `names`, optional `commonName`, `category`, `raHours`, `decDeg`, `distMpc`, `physicalRadiusMpc`, `apparentRadiusMpc`, `description`). Put member count + any `[est]`/contested caveat in the `description` prose (uniform `significance` — no weight field). Ids are lower-kebab, e.g. `local-group`, `m81-group`, `cen-a-group`.

Local Group: `raHours: 0.71`, `decDeg: 41.3`, `distMpc: 0.43`, `physicalRadiusMpc: 0.16`, `apparentRadiusMpc: 0.94` (barycentre along the M31 sightline — note this in the description). Maffei keeps its `[est]` radii; its description states the distance is contested (3.4–6.7 Mpc).

- [ ] **Step 1:** Add the 16 entries to the JSON array, one per spec §6 table row, with curated 1–2 sentence descriptions (member count + caveats inline). Honest wording for Sculptor/CVn I (clouds/filaments) and Maffei (contested distance).
- [ ] **Step 2: Validate.** Run: `npm test -- parseClusterSeed` and confirm `buildStaticAnchorPois` tests still pass — the parser validates every new entry's ranges (raHours [0,24), decDeg [-90,90], positive distances/radii) and rejects duplicates loudly. Fix any flagged entry.
- [ ] **Step 3: Commit.** `feat(groups): seed 16 Local Volume galaxy groups`.

---

### Task 10: Full suite + visual verification

**Files:** none (verification only)

- [ ] **Step 1: Green suite.** Run: `npm test` and `npm run typecheck` — both clean. Fix any regression.
- [ ] **Step 2: Format touched files.** Run prettier on only the files this plan changed (not repo-wide). 
- [ ] **Step 3: Visual check (dev server).** With `npm run dev` running + real data linked (`/link-data`), verify: group rings render in soft green near the Local Volume; the **Local Group ring sits around the start camera position** and fades sanely via the existing near/far fade (it's the only marker at the origin — confirm no z-fighting / full-screen wash); group labels show on the featured groups; the Settings panel "Groups" toggle hides/shows group markers + labels independently; clicking a group ring focuses it and opens its InfoCard with the description text. Ask the user to confirm the look (per the project's "ask the user to verify UI" convention).
- [ ] **Step 4: Update memory** `project_nearby_galaxy_groups` to "implemented" once the user signs off on the visual check.

---

## Notes for the implementer

- **Deploy:** none needed for code — the seed JSON is bundled into the shell at build time. No `.ccat`, no R2 sync, no `_headers` change (groups add no new fetched artefact).
- **Do not touch** `clusterCatalogFormat.ts`, `clusterCatalogToStructures.ts`, or the `.ccat` path — groups are seed-only; those handle the bulk MCXC/MSCC catalog (cluster/supercluster only).
- **Append-only Source codes:** if you find yourself wanting to renumber `Milliquas`, stop — `Source.Group = 15` is correct (spec §3).
