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

- [x] **Step 1: Extend the type test.** In `tests/@types/engine/data/structureRecord.types.test.ts`, add a `group` case mirroring the existing `void` assertion (a `GroupRecord`-shaped literal is assignable to `StructureRecord`; `category: 'group'` narrows to the group arm). Match the file's existing `expectTypeOf`/`satisfies` idiom.
- [x] **Step 2: Run it, expect FAIL.** Run: `npm run typecheck` — expect a type error that `'group'` is not assignable to `StructureCategory`.
- [x] **Step 3: Add `'group'`** to the `StructureCategory` union and the `GroupRecord` arm + union member per the contract above.
- [x] **Step 4: Run.** `npm run typecheck` — Task-1 files compile clean. NOTE (correction): the global typecheck is NOT clean here — widening the union trips `Record<StructureCategory|PoiCategory, …>` totality at sites owned by Tasks 5 & 8 (and the extra sites listed in Task 8's note). vitest `run` strips types, so per-task behavioural tests stay green throughout; the global `tsc` gate goes green at Task 8 and is re-verified in Task 10.
- [x] **Step 5: Commit.** `git add` the three files; message `feat(groups): add 'group' to StructureCategory + StructureRecord`. (commit 4406e305)

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

- [x] **Step 1:** Add `Group: 15` to the `Source` const and the `SOURCE_REGISTRY[Source.Group]` row per the contract. The registry `satisfies Readonly<Record<SourceType, SourceEntry>>` totality will force the row to exist.
- [x] **Step 2:** In `galaxyType.ts:69-71`, add `case Source.Group:` to the existing non-survey `case Source.Cluster: case Source.Supercluster: case Source.Void: …` fallthrough that `throw`s — groups have no photometry. (Place it adjacent to the other POI cases.)
- [x] **Step 3: Run.** Task-2 files compile clean (no errors in `sources.ts`/`galaxyType.ts`); `vitest run galaxyType` 22/22 green. Global `tsc` still carries the Task 5/8 cascade.
- [x] **Step 4: Commit.** `feat(groups): allocate Source.Group=15 + registry row` (commit 4933aa75).

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

- [x] **Step 1: Write the failing test.** Added a group decode case to `tests/data/selectionEncoding.test.ts` (the real type is `PickResult`/`unpackPick`, not `DecodedPick`).
- [x] **Step 2: Run, expect FAIL.** (covered by the green run below)
- [x] **Step 3: Implement** the `PickResult` arm + `unpackPick` branch + the `clickHandler.ts:106` guard. ALSO (deviation from spec §3 YAGNI, accepted): added `SOURCE_CODE_GROUP` to `selectionEncoding.wesl` + the TS↔WESL parity test — the parity test already enforces this for cluster/supercluster/void, so group must match. `runFrame.ts`/`resolvePoiFromPick.ts` need no edit (generic dispatch).
- [x] **Step 4: Run.** `vitest run selectionEncoding` 17/17 green; no type errors in the Task-3 files.
- [x] **Step 5: Commit.** commit 1826a325.

---

### Task 4: Accept `'group'` in the seed parser

**Files:**
- Modify: `tools/parsers/parseClusterSeed.ts:21` (`VALID_CATEGORIES`)
- Test: `tests/tools/parsers/parseClusterSeed.test.ts`

**Contract:** `const VALID_CATEGORIES = ['cluster', 'supercluster', 'void', 'group'] as const;` — `ClusterSeedEntry['category']` widens from this const automatically, so no other change in the parser.

- [x] **Step 1: Write the failing test.** Added an `accepts category group and round-trips it` case; the bundled-seed smoke test's `validCategories` set also gained `'group'`. (rejects-unknown test already used `'supergroup'`.)
- [x] **Step 2: Run, expect FAIL.** (covered by green run below)
- [x] **Step 3: Add `'group'`** to `VALID_CATEGORIES` + updated error message + radius doc (groups have a bound core like clusters: physR=Rh, appR=R0).
- [x] **Step 4: Run.** `vitest run parseClusterSeed` 19/19; no type errors. (Fixed one `noUncheckedIndexedAccess` slip: `entries[0]?.category`.)
- [x] **Step 5: Commit.** commit ab26b7fd.

---

### Task 5: Add the `group` marker style row

**Files:**
- Modify: `src/services/engine/presentation/structurePoiStyles.ts` (`STRUCTURE_POI_STYLES`)
- Test: none new — totality on `Record<StructureCategory, StructureMarkerStyle>` is the gate (typecheck)

**Contract.** Add a `group` row. Start from the `void` row (closest analog) but: tint `#8FBF8F` (soft green) for `labelColor`/`haloColor`/`ringColor`; `worldEmMpc ≈ 0.3` (group labels are physically tiny); `markerMinApparentRadiusPx ≈ 5` + `markerMinApparentFadeBandPx ≈ 4` (like `cluster`, so a small *near* ring stays visible rather than tripping the void/SC floor of 28). `haloColor` is a plain `Vec4` now — groups get a normal halo (no skip). Keep `markerMax*`, `outline*`, `minPixelSize`/`maxPixelSize` matching the `cluster` row.

- [x] **Step 1: Run typecheck, expect FAIL.** Confirmed — the missing `group` key was part of the post-Task-1 cascade.
- [x] **Step 2: Add the `group` row** per the contract: `#8FBF8F` label/ring, `#8FBF8FA5` translucent halo, `worldEmMpc 0.3`, cluster-like `markerMin*` (5/4), cluster-matched max/outline.
- [x] **Step 3: Run.** Style cascade cleared (`structurePoiStyles`/`produceStructureMarkers`/`produceStructureLabels` now compile); presentation tests 10/10 green.
- [x] **Step 4: Commit.** commit e2f07f90.

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

- [x] **Step 1: Write the failing test.** The existing tests assert against the real bundled seed (which has no group entries until Task 9), so the group test uses `vi.resetModules()` + `vi.doMock` of the seed JSON + dynamic import to inject an inline group fixture; asserts `id === 'group-local-group'`, `category === 'group'`, `featured === true`, `worldPos === raDecDistToEqCart(fixture)`.
- [x] **Step 2: Run, expect FAIL.** Confirmed (initially failed once for a missing `vi.resetModules()` — ESM cache wasn't busted; fixed).
- [x] **Step 3: Implement** the `SeedEntry` widening + `case 'group'` switch arm.
- [x] **Step 4: Run.** `vitest run buildStaticAnchorPois` 10/10; no type errors.
- [x] **Step 5: Commit.** commit b5016d96.

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

- [x] **Step 1: Write the failing test.** Added `group`/`void_` helpers + markerCount-inclusion + bucket-bleed-guard tests in `clusterMarkerRenderer.test.ts`; a type-gate test in `.pick.test.ts`.
- [x] **Step 2: Run, expect FAIL.** Confirmed (totality errors on the ~6 narrow records + dropped group descriptors).
- [x] **Step 3: Implement** all 11 renderer sites; `bucketOffsets.group = bucketOffsets.void + bucketCounts.void` (group bucket last); void-halo-skip at ~578 left untouched (group gets a normal halo).
- [x] **Step 4: Run.** `vitest run clusterMarkerRenderer` 9/9; renderer cascade cleared in `tsc`.
- [x] **Step 5: Commit.** commit 0e9ae86f.

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

**Additional `PoiCategory`/`StructureCategory` totality sites the union widening (Task 1) forced — these were NOT in the original plan; they belong here in Task 8 because they're all UI/settings/focus-domain. The global `tsc` gate goes green only once all of these carry a `group` entry:**
- `src/data/poiCategoryInfo.ts`: add a `group` row → `{ label: 'Galaxy Group', shortLabel: 'Group' }`.
- `src/services/engine/camera/poiFocusDistance.ts`: add `group` to `CATEGORY_MULTIPLIER` (`Record<Exclude<PoiCategory,'famousGalaxy'>, number>`). Use `group: 8` (mirror cluster — both are halo structures; 8× the harmonic radius frames the group + its neighbourhood; the 1 Mpc min-clamp keeps the Local Group's tiny `Rh` sane). Tunable in the Task 10 visual check.
- `src/hooks/useEngineSettings.ts`: the two `useState<Record<PoiCategory, boolean>>` defaults (`labelCategoryVisibility` ~162, `markerCategoryVisibility` ~170) each need `group: true`.
- `src/services/engine/engine.ts`: the two `Record<PoiCategory, boolean>` defaults (`labelCategoryVisibility` ~349, `markerCategoryVisibility` ~359) each need `group: true`. (The `...spread` mutators at ~1264/1280 need no change.)
- Test fixtures that hardcode the 4-key visibility object — add `group: true`: `tests/@types/engineState.test.ts`, `tests/@types/engineSettingsState.labelCategoryVisibility.test.ts`, `tests/services/engine/wiring/seedSettingsCallbacks.test.ts`, `tests/services/engine/wiring/settingsTable.test.ts`.

- [x] **Step 1:** Made edits A–G (focus predicate; `poiCategoryInfo` + `plural` field; SettingsPanel toggle labels now read `POI_CATEGORY_INFO[cat].plural` instead of ternaries — improvement over the plan, kills the silent-else mislabel; LabelEffectsSection target; assetWiring rename; poiFocusDistance `group: 8`; `group: true` in all 4 visibility defaults + 6 test fixtures incl. two the plan missed: `demandTable.test.ts`, `wireSlots.test.ts`; and the runtime key-enumeration tests in `poiCategories.test.ts`).
- [x] **Step 2: Run.** Global `npm run typecheck` GREEN (cascade from Task 1 closed); `vitest run` 2300/2300 green. Prettier on touched files only.
- [x] **Step 3: Commit.** commit 6bbccddc.

---

### Task 9: Seed the 16 verified groups

**Files:**
- Modify: `data/cluster_anchors.seed.json`

**Contract.** Append 16 `"category": "group"` entries. Use the values from spec §6 (RA hours, Dec deg, distMpc, `physicalRadiusMpc = Rh`, `apparentRadiusMpc = R0`). Each entry mirrors the void-entry JSON shape (`id`, `names`, optional `commonName`, `category`, `raHours`, `decDeg`, `distMpc`, `physicalRadiusMpc`, `apparentRadiusMpc`, `description`). Put member count + any `[est]`/contested caveat in the `description` prose (uniform `significance` — no weight field). Ids are lower-kebab, e.g. `local-group`, `m81-group`, `cen-a-group`.

Local Group: `raHours: 0.71`, `decDeg: 41.3`, `distMpc: 0.43`, `physicalRadiusMpc: 0.16`, `apparentRadiusMpc: 0.94` (barycentre along the M31 sightline — note this in the description). Maffei keeps its `[est]` radii; its description states the distance is contested (3.4–6.7 Mpc).

- [x] **Step 1:** Added 16 group entries (hand-formatted inline to match the existing 26 entries — purely additive diff). Transcribed directly from spec §6 (not via subagent — precise scientific values, parser only range-checks). Honest descriptions for Sculptor/CVn I (cloud/filament), Maffei + NGC 1023 (contested distance), estimated radii flagged.
- [x] **Step 2: Validate.** JSON valid, 42 total / 16 groups, no dup ids, all invariants (`appR ≥ physR`, ranges) hold. `buildStaticAnchorPois`'s `cats.size` enum test bumped 3→4. Full `vitest run` 2300/2300 green.
- [x] **Step 3: Commit.** commit def2b8fa (note: seed file is `.gitignore`-excepted, staged with `-f`).

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
