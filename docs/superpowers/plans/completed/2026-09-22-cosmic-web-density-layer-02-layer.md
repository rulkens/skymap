# cosmicWebDensity Layer 02 — the Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form `src/layers/cosmicWebDensity/` from its settings-only stub so it owns the three Physarum density cubes (MCPM, Polyphorm 2MRS, the MCPM workbench export): sources, slots, one fetcher, the ingest, fade rows, one renderer instance, its own target + upsample, both passes and two UI sections. The scalar-volume renderer, a new pass factory and a pure liveness core stay generic core mechanism. `cosmicWebFilaments` gains its own settings section. The PR opens by moving boot `visible` / `intensity` out of the source registry into Layer `initialState` literals for every Layer.

**Branching:** PR 2 branches from `main` after #810 (PR 1) merges. <!-- Or stacks on `worktree-volume-layer` if the user rules so: ______ -->

**Architecture:** Six tasks, four dispatches. Task 1 is the registry `visible`/`intensity` backlog item, alone. Task 2 makes the renderer generic and adds the pass factory and the pure liveness core while core still owns the instance. Task 3 moves the sources, defaults and Layer-only types behaviour-neutrally. Task 4 forms the Layer (runtime, load, target, passes, fades) and deletes the core rows. Task 5 splits the UI. Task 6 is docs. ZoA (`src/layers/zoneOfAvoidance/`) is the template for target + upsample + liveness; `cosmicWebFilaments` is the template for slot + asset row + fade row; `galaxyCatalog`'s `galaxyCatalogAssetRows.ts` is the template for per-row asset rows keyed by `Source` code.

**Tech Stack:** TS, RTK slices, React (SettingsPanel, DebugPanel), Vitest, WebGPU pass files. No shader changes.

**Spec:** `docs/superpowers/specs/completed/2026-09-22-cosmic-web-density-layer-design.md`: §2 (ground prep, commit order), §3 (Layer folder), §4 (core mechanism), §5 (boot state leaves the registry), §6 (load + arrival invariant), §7 (UI), §8 (deletions), §9 (types), §10 (testing), §11 (docs), §12 (DoD), §13 (rulings 1–7). Decisions ledger: `docs/grill-sessions/cosmic-web-density-layer-2026-09-22.md` (Q1–Q15; "Inventory facts" at the end).

## Global Constraints

- Everything not listed in spec §1 is pixel-identical. Behaviour changes, all in Tasks 4–5: the Style picker is gone; the Cosmic web section splits in two; the per-cube sliders move to the DebugPanel; `cosmic-web-density` is toggleable in the DebugPanel pass list. Plus Task 1's `fetch-data` now downloads every manifest file.
- One task = one commit, in the order below. Task 1 is first and alone. Adjacent findings go to the final report, never into a task.
- **Arrival-ordering invariant (the landmine of this PR).** `installFadeOnArrival` snapshots every fade row's guard, then on any slot's `ready` re-runs them and opens a fade on each false→true edge. The field row's guard is `runtime.renderer.listIds().includes(id)`, its intent is `settings.cosmicWebDensity.items[id]?.enabled`. So `commit` must call `renderer.upload(entry.id, cube, entry)` **synchronously, before the slot reports `ready`**. Nothing in the ingest writes settings: the intent is already true because `items` is complete in `initialState`. The fade that arrival opens is what wakes the render. The Layer's slots join `allSlots` through `createLayers` before `wireSlots` calls `installFadeOnArrival`, which is unchanged from flow. If the upload lands after `ready`, the edge is missed until some other slot loads, and MCPM does not appear at boot.
- Moves use `npm run move-files -- <from> <to>` (or `-- --manifest <moves.json>`, manifest written to the scratchpad; `--dry` first), never `git mv` plus hand-edited imports. Renames use `npm run refactor -- rename`. **The tool's blind spots, which you grep for after every move:** `?static` / `?worker` import specifiers, `.mts` files, `vi.mock('<path>')` string literals in tests, `.wesl` `package::` imports, and any other string-literal path.
- Pass files (`src/layers/*/passes/*`, `src/services/engine/frame/**`) export only the one symbol they are named for (`tests/services/engine/frame/frameFilePurity.test.ts`). One symbol per file in `utils/` and `@types/`, filename = symbol. `type` aliases, never `interface`. Deep relative imports, no barrels. The Layer's own types go in `src/layers/cosmicWebDensity/@types/*.d.ts`; types core names stay in `src/@types/` (spec §9).
- Cast-built test fixtures (`as unknown as EngineState`, `as unknown as PassState`, `as unknown as SourceEntry`) hide renamed or deleted fields from tsc. After any field removal, grep the tests for the old field name, and don't rely on `typecheck:fast` alone.
- Dead imports aren't flagged by tsc here. After deleting a symbol, grep its name across `src/`, `tools/` and `tests/` and remove each leftover import.
- Layer boundary ratchets stay green with no new allow-list rows: `tests/conventions/layerImportBoundary.test.ts`, `layerStateShape.test.ts`, `oneSymbolPerFile.test.ts`, `frameFilePurity.test.ts`. `src/services/engine/**` and `src/state/**` may not import from `src/layers/`. Core UI in `src/components/` may.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines. Every header a task falsifies is rewritten in that task (named per task), never left stale.
- Format with `npx prettier --write <touched files>`, never `npm run format`. Stage by path, never `git add -A`. Commit messages carry **no `Co-Authored-By` trailer** and no `--author`. `npm run dev` stays running.
- Perf gate: none (ruled, grill Q15: same renderer, shader, passes and target scale). Deletion audit: once, at `/feature-done`.

## Dispatch grouping

| Dispatch | Tasks | Model | Why together |
|---|---|---|---|
| A | 1 | Sonnet | Registry, every Layer's `initialState`, the fetch tool: its own diff with its own gate |
| B | 2, 3 | Sonnet | Core volume mechanism, then the behaviour-neutral moves of what the renderer no longer reads |
| C | 4 | Opus (`review: yes`) | One mental model: the Layer's runtime, load and render forming together while the core rows leave |
| D | 5, 6 | Sonnet | UI split, then the docs that describe it |

Only Task 4 is `review: yes`. Its mid-branch review gets the Task 4 diff, this task's contract, and spec §6 + §8.

---

### Task 1: Boot visibility and intensity leave the source registry

**review: no.** The `INITIAL_SETTINGS` dump diff below is the check a reviewer would make, and it is stricter.

Spec §5, ruling 6, ruling 7. A source row describes an asset, not what the app does with it at boot. `SourceEntryBase.visible` leaves every row. `intensity` leaves `ConstellationsSourceEntry`, `CosmicWebFilamentsSourceEntry` and `VolumeFieldDefaults`. Each value becomes a literal in the owning Layer's `initialState`, following the flow convention (`src/layers/flow/state/defaults.ts`). No special casing per Layer.

**Files:**

- Modify (types): `src/@types/data/SourceEntryBase.d.ts:20-27` (field + comment go), `src/@types/data/constellations/ConstellationsSourceEntry.d.ts:13-25`, `src/@types/data/filament/CosmicWebFilamentsSourceEntry.d.ts:9-23` (rewrite the header, which says the visibility default and intensity come from the row), `src/@types/data/volume/VolumeFieldDefaults.d.ts:110-120`, `src/@types/data/volume/CosmicWebDensitySourceEntry.d.ts` (header's "visibility default"), `src/@types/settings/VolumeFieldSettings.d.ts:22` (the "seeded from `DEFAULT_VOLUME_FIELD_INTENSITY`" comment)
- Modify (rows; drop `visible`, and `intensity` where listed, plus every comment that explains either): `src/layers/galaxyCatalog/sources/{sdss,twomrs,glade,famous-galaxy,milliquas,desiDeep,desiWedge,desiSgw}.ts`, `src/layers/starCatalog/sources/{gaia-stars,famous-star,sun,s-star}.ts`, `src/layers/constellations/sources/constellations.ts` (+ `intensity`), `src/layers/cosmicWebFilaments/sources/filaments.ts` (+ `intensity`), `src/layers/zoneOfAvoidance/sources/zone-of-avoidance.ts`, `src/layers/flow/sources/flow.ts`, `src/data/sources/{milky-way,supercluster,cluster,void,group,planet,earth,sgr-a-star,mesh-body}.ts`, `src/data/sources/{mcpm,polyphorm-2mrs,mcpm-workbench}.ts` (+ `intensity`)
- Modify (readers): `src/layers/constellations/state/constellations/initialState.ts:11`, `src/layers/cosmicWebFilaments/state/cosmicWebFilaments/initialState.ts:7`, `src/layers/milkyWay/state/milkyWay/initialState.ts:14`, `src/layers/galaxyCatalog/state/galaxyCatalogs/initialState.ts:32`, `src/layers/starCatalog/state/starCatalogs/initialState.ts:36`, `src/layers/body/state/bodies/initialState.ts:18`, `src/data/volume/volumeFieldDefaults.ts` (`buildVolumeFieldSettings` narrows, `seedVolumeFields` deleted, header's "three exports" list rewritten), `src/layers/cosmicWebDensity/state/cosmicWebDensity/initialState.ts` (header rewritten, since it claims no fields exist at startup), `src/layers/cosmicWebDensity/state/cosmicWebDensity/slice.ts` (see below), `src/data/exhibits/cosmicWeb.ts:13-25`, `src/utils/allVisibleMask.ts` (header rewritten), `src/layers/flow/state/defaults.ts:17` (comment names `FLOW_ENTRY.visible`)
- Modify (tool + doc): `tools/fetch/fetchPrebuiltData.ts`, `docs/DATA.md:61`
- Delete: `tests/tools/fetch/fetchPrebuiltData.test.ts` (it tests only the two deleted functions), `docs/backlog/2026-09-21-registry-visible-intensity-to-app-state.md` and its `docs/BACKLOG.md:39` index line
- Test (drop `visible` / re-point off `seedVolumeFields`): `tests/state/settings/makeSettingsFixture.ts:12-32,134`, `tests/services/engine/wiring/demandTable.test.ts:39-52,160-167`, `tests/services/engine/phases/wireSlots.test.ts:26,250,315,334`, `tests/data/sources/sStarSource.test.ts:27`, `tests/layers/galaxyCatalog/state/galaxyCatalogs/slice.test.ts:19`, `tests/layers/starCatalog/state/starCatalogs/slice.test.ts:14`, `tests/state/tour/tour.integration.test.ts:174-181`, `tests/layers/galaxyCatalog/ui/GalaxiesSection.test.ts`, `tests/layers/cosmicWebDensity/state/cosmicWebDensity/slice.test.ts`

**Contract:**

```ts
// Layer initialState literals (values = today's registry values, byte-for-byte)
// constellations:        enabled: false, intensity: 1.0
// cosmicWebFilaments:    enabled: false, intensity: 1.0
// milkyWay:              enabled: true
// starCatalogs / bodies: every item enabled: true (every row is `true` today)
// galaxyCatalogs:        desiDeep / desiWedge / desiSgw enabled: false, every other id true —
//                        a compiler-complete Record<GalaxyCatalogId, boolean> literal, not an
//                        "off" set, so a new catalog is a compile error until its boot state is written.

// src/data/volume/volumeFieldDefaults.ts — returns only the registry-borne look fields
export function buildVolumeFieldSettings(
  id: CosmicWebDensityFieldId,
): Omit<VolumeFieldSettings, 'enabled' | 'intensity'>;

// src/layers/cosmicWebDensity/state/cosmicWebDensity/initialState.ts
// items is a Record literal over buildVolumeFieldSettings, compiler-complete over the ids:
//   mcpm: { ...buildVolumeFieldSettings('mcpm'), enabled: true, intensity: 1.0 },
//   'polyphorm-2mrs': { …, enabled: false, intensity: 1.0 },
//   'mcpm-workbench': { …, enabled: false, intensity: 1.0 },
const items: Record<CosmicWebDensityFieldId, VolumeFieldSettings>;

// src/utils/allVisibleMask.ts — folds boot state, so the startup drawMask/pickMask
// cannot diverge from `galaxyCatalogs.items`
// bit `1 << code` set iff INITIAL_SETTINGS.galaxyCatalogs.items[SOURCE_REGISTRY[code].id].enabled
export const ALL_VISIBLE_MASK: number;

// src/data/exhibits/cosmicWeb.ts
'polyphorm-2mrs': { ...volumesInitialState.items['polyphorm-2mrs'], enabled: true },
```

- **`items` totality (pending Question 1).** For the exhibit spread to type-check, `CosmicWebDensitySettings.items` (`src/@types/settings/CosmicWebDensitySettings.d.ts`) narrows from `Partial<Record<…>>` to `Record<CosmicWebDensityFieldId, VolumeFieldSettings>`. A total record forbids `delete`, so `removeCosmicWebDensityField` and its slice test are deleted here (grill Q13 ruled them dead; spec §8 lists the deletion). `addCosmicWebDensityField` stays until Task 4, with its body re-seeding from `initialState.items[id]` in place of `buildVolumeFieldSettings(id)`. That code is unreachable, because every id is present, and it goes in Task 4. Don't add a non-null assertion or a second literal in its place.
- `fetchPrebuiltData.ts`: `volumeVisibilityByFileName` and `selectManifestFiles` are deleted, along with the `--volumes` argument, the `excluded` count and its stderr line. `main` downloads `Object.keys(manifest).sort()`. The header gains one clause saying every manifest file is fetched. The `SOURCE_ENTRIES` and `TIER_LADDER` imports go if they are left unused. `docs/DATA.md:61`: drop the "by default skipping… `--volumes all`" parenthetical, keeping `--dry-run`.
- No new test: every change is a literal relocation or a deletion, and the dump gate below proves the values. Spec §10 lists an `allVisibleMask` test. Once the mask is a fold over `INITIAL_SETTINGS.galaxyCatalogs.items`, a test comparing the two is a mirror (testing.md), so it is **not written** (Question 2). Tests that assert `enabled === entry.visible` are constant restatements now, so delete those assertions; don't rewrite them.

- [x] **Before any edit**, dump `INITIAL_SETTINGS` as sorted-key JSON into the scratchpad (`before.json`). Use a scratchpad `.ts` script run with `npx tsx` that imports `src/state/settings/initialSettings.ts` and prints `JSON.stringify` of a recursive key-sort. If tsx cannot load the graph (Vite-only specifiers), use a throwaway `tests/_dump.test.ts` that writes the file and delete it before committing.
- [x] Types, then rows, then readers. `npm run typecheck:fast` lists every consumer. Grep `\.visible\b` and `visible:` under `src/`, `tools/` and `tests/` for cast-built fixtures and comments that tsc misses. Skip the unrelated UI `visible` fields (`splash.visible`, etc.).
- [x] `fetchPrebuiltData.ts` + `DATA.md:61`. Delete its test file.
- [x] Dump again (`after.json`), then `diff before.json after.json`. It must be **empty**. Any difference means a transcribed value is wrong: fix the literal, never the dump.
- [x] Delete the backlog detail file and the `docs/BACKLOG.md:39` line.
- [x] `npm run typecheck:fast && npx vitest run tests/layers tests/data tests/state tests/services/engine/wiring tests/services/engine/phases tests/utils tests/tools/fetch` → green.
- [x] Commit: `refactor(sources): boot visibility and intensity live in Layer initialState, not the registry`.

---

### Task 2: The renderer goes generic; the pass factory and the pure liveness core

**review: no.** No shader or WGSL-side change. The upload signature is TS-only.

Spec §4.1–§4.3. Core still owns the one instance after this task (`state.gpu.volumeFieldRenderer`). The factory has no caller until Task 4.

**Files:**

- Modify: `src/@types/rendering/VolumeFieldRenderer.d.ts` (generic over `Id`; header rewritten to drop the `state.settings.cosmicWebDensity` sentence), `src/@types/rendering/FieldEntry.d.ts` (`id: string`), `src/services/gpu/renderers/volumeField/volumeFieldRenderer.ts:9,53-56,102,209,265-290` (generic, `upload` reads `statics`, the `data/volume/volumeFieldDefaults` import goes, the header's `upload(id, cube)` line follows)
- Modify: `src/services/engine/volume/uploadVolumeField.ts` (takes the source entry and passes it as `statics`), `src/services/loading/slots/{mcpmSlot,polyphorm2MrsSlot,mcpmWorkbenchSlot}.ts` (pass `SOURCE_REGISTRY[Source.X]`, which they already read), `src/@types/engine/handles/EngineGpuHandles.d.ts:297` (`VolumeFieldRenderer<CosmicWebDensityFieldId> | null`), `src/services/engine/gpuHandles/gpuHandleRegistry.ts:210-214`
- Modify: `src/services/engine/frame/volumeLiveness.ts` (keeps its state reads and delegates the clamp / bands / `hasActiveFields` to the pure core; Task 4 deletes it)
- Create: `src/@types/rendering/VolumeFieldLiveness.d.ts`, `src/@types/engine/frame/ScalarVolumePassRow.d.ts`, `src/services/engine/frame/passes/createScalarVolumePass.ts`, `src/utils/volume/deriveVolumeLiveness.ts`
- Test: `tests/services/gpu/renderers/volumeField/volumeFieldRenderer.test.ts:4,79,160,184` (statics from a literal or `MCPM_ENTRY`, not `getVolumeFieldDefaults`), `tests/services/engine/volume/uploadVolumeField.test.ts` (call shape), `tests/services/engine/frame/volumeLiveness.test.ts` (the pure cases move out, see below), new `tests/utils/volume/deriveVolumeLiveness.test.ts`, new `tests/services/engine/frame/passes/createScalarVolumePass.test.ts`

**Contract:**

```ts
// src/@types/rendering/VolumeFieldRenderer.d.ts
export type VolumeFieldRenderer<Id extends string = string> = {
  readonly label: string;
  /** `statics` are the per-cube, non-tunable presentation facts, read once here. */
  upload(id: Id, cube: ScalarCube,
         statics: Pick<VolumeFieldDefaults, 'paletteId' | 'contrastCenter' | 'envelope'>): void;
  unload(id: Id): void;
  hasActiveFields(settingsOf: (id: Id) => VolumeFieldSettings | undefined,
                  fadeOpacityOf?: (id: Id) => number): boolean;
  listIds(): Id[];
  draw(pass: GPURenderPassEncoder, viewProj: Mat4, viewportPx: Vec2, pxPerRad: number,
       cameraPosWorld: Readonly<Vec3>,
       settingsOf: (id: Id) => VolumeFieldSettings | undefined,
       fadeOpacityOf: (id: Id) => number): void;
  destroy(): void;
};

// volumeFieldRenderer.ts
export function createVolumeFieldRenderer<Id extends string>(
  device: GPUDevice, targetFormat: GPUTextureFormat, fadeBgl: FadeUniformsBgl,
): VolumeFieldRenderer<Id>;

// src/@types/rendering/VolumeFieldLiveness.d.ts
export type VolumeFieldLiveness<Id extends string> = {
  readonly settingsOf: (id: Id) => VolumeFieldSettings | undefined; // clamped
  readonly fadeOpacityOf: (id: Id) => number;                       // × per-field bands
};

// src/utils/volume/deriveVolumeLiveness.ts — no state, settings or fade read inside
export function deriveVolumeLiveness<Id extends string>(
  renderer: VolumeFieldRenderer<Id>,
  fieldSettingsOf: (id: Id) => VolumeFieldSettings | undefined, // raw rows
  fadeOpacityOf: (id: Id) => number,                            // field fade × recessed master
  cameraDistanceMpc: number,
): VolumeFieldLiveness<Id> | null;
// clamps via clampVolumeFieldSettings; multiplies each field's `bands` (default
// [SCALE_FADE_BANDS.surveyDeepZoom]) at cameraDistanceMpc into fadeOpacityOf;
// null unless renderer.hasActiveFields(settingsOf, fadeOpacityOf).

// src/@types/engine/frame/ScalarVolumePassRow.d.ts — twin of UpsamplePassRow
export type ScalarVolumePassRow<Id extends string> = {
  readonly name: string;
  /** `RenderTargetSpec.id` this raymarch draws into; its `sizeOf` is the viewport. */
  readonly targetId: string;
  readonly renderer: VolumeFieldRenderer<Id>;
  /** Shared with the upsample row's `enabled`; `null` = nothing live. */
  liveness(state: PassState, ctx: FrameView): VolumeFieldLiveness<Id> | null;
};

// src/services/engine/frame/passes/createScalarVolumePass.ts
export function createScalarVolumePass<Id extends string>(row: ScalarVolumePassRow<Id>): ContentPass;
```

- `createScalarVolumePass`'s body is today's `scalarVolumePass.ts:37-66`, with `'volume'` → `row.targetId` and `state.gpu.volumeFieldRenderer` → `row.renderer`. The renderer null check goes. Its header keeps the "why the downscaled viewport" paragraph (`scalarVolumePass.ts:15-21`), trimmed to budget. Don't carry over the "why re-derived in draw" section.
- Tests worth writing:
  - `volumeFieldRenderer.test.ts`: `it('uploads a field whose id no registry row names, palette seeded from statics')`. Upload id `'dust'` with `statics.paletteId` set, then assert `listIds()` contains `'dust'` and nothing throws. Today this throws `no registry entry`, which is the generality bug spec §4.1 names.
  - `deriveVolumeLiveness.test.ts`: move from `volumeLiveness.test.ts` the cases at `:101` (no active field → null), `:113` (clamp at the read edge), `:122` (undefined for a missing row), `:136` (deep zoom zeroes every field through the bands), `:157` (custom bands), `:167` (no bands ≡ surveyDeepZoom). Rewrite them against a stub renderer with plain closures and a distance, not a `PassState`. What stays in `volumeLiveness.test.ts` is `:91`, `:95`, `:106`, `:128`, which are the state reads Task 4 moves to the Layer wrapper.
  - `createScalarVolumePass.test.ts`: `it('draws with sizeOf(row.targetId) as the viewport and pxPerRad scaled by the target height')`. Stub `sizeOf('t')` → `{ width: 100, height: 50 }` on a 300×150 canvas with `drawPxPerRad = 600`, and assert `draw` receives `[100, 50]` and `200`, hand-computed. `it('is disabled when liveness returns null')`.

- [x] Types and renderer generic. Then `uploadVolumeField` and the three slots pass the entry. Then the handle type.
- [x] `deriveVolumeLiveness` + `VolumeFieldLiveness`. `volumeLiveness.ts` delegates to it (the same observable result).
- [x] `ScalarVolumePassRow` + `createScalarVolumePass`.
- [x] Tests as listed. `npm run typecheck:fast && npx vitest run tests/services/gpu/renderers/volumeField tests/services/engine/frame tests/services/engine/volume tests/utils/volume tests/services/loading` → green.
- [x] Commit: `refactor(volume): generic renderer, scalar-volume pass factory and pure liveness core`.

---

### Task 3: Density sources, defaults and Layer-only types move into the Layer

**review: no.** Behaviour-neutral moves.

Spec §3 (rows `sources/*`, `state/defaults.ts`, `ui/projectVolumeFieldRows.ts`, `@types/*`) and §9. The source list becomes the one list that slots, asset rows, fade rows and both sections map over (spec §3: no second named list of ids, no presentation field on the row).

**Files:**

- Move (with `npm run move-files`, tests mirror follows):
  - `src/data/sources/mcpm.ts` → `src/layers/cosmicWebDensity/sources/mcpm.ts`
  - `src/data/sources/polyphorm-2mrs.ts` → `src/layers/cosmicWebDensity/sources/polyphorm-2mrs.ts`
  - `src/data/sources/mcpm-workbench.ts` → `src/layers/cosmicWebDensity/sources/mcpm-workbench.ts`
  - `src/data/volume/volumeFieldDefaults.ts` → `src/layers/cosmicWebDensity/state/defaults.ts` (header rewritten: it filters `type: 'cosmicWebDensity'`, so it is the Layer's; no tool imports it)
  - `src/state/settings/projectVolumeFieldRows.ts` → `src/layers/cosmicWebDensity/ui/projectVolumeFieldRows.ts` (header's `debug-*` paragraph is stale since PR 1: delete it)
  - `src/@types/settings/CosmicWebDensitySettings.d.ts` → `src/layers/cosmicWebDensity/@types/CosmicWebDensitySettings.d.ts` (header says "VolumeSettings", rewrite)
  - `src/@types/settings/VolumeFieldRowData.d.ts` → `src/layers/cosmicWebDensity/@types/VolumeFieldRowData.d.ts`
- Create: `src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows.ts`
- Modify: `src/data/sources.ts:69-85` (the three `UNFORMED_` rows leave; `sourceRecordOf(COSMIC_WEB_DENSITY_SOURCE_ROWS)` joins the spread as the formed Layers' do)
- Delete: `src/@types/settings/VolumeSettings.d.ts` (zero importers)
- Stays core (core names them, spec §9): `CosmicWebDensityFieldId`, `CosmicWebDensitySourceEntry`, `ScalarCube`, `ScalarFieldPaletteId`, `VolumeFieldSettings`, `VolumeFieldDefaults`.
- Test mirrors: `tests/data/volume/volumeFieldDefaults.test.ts` → `tests/layers/cosmicWebDensity/state/defaults.test.ts`, `tests/state/settings/projectVolumeFieldRows.test.ts` → `tests/layers/cosmicWebDensity/ui/projectVolumeFieldRows.test.ts` (the tool drags them; check), `tests/data/mcpmAnchors.test.ts` (import path only)

**Contract:**

```ts
// src/layers/cosmicWebDensity/sources/cosmicWebDensitySourceRows.ts — shape of FILAMENTS_SOURCE_ROWS
export const COSMIC_WEB_DENSITY_SOURCE_ROWS = [
  [Source.Mcpm, MCPM_ENTRY],
  [Source.Polyphorm2MRS, POLYPHORM_2MRS_ENTRY],
  [Source.McpmWorkbench, MCPM_WORKBENCH_ENTRY],
] as const satisfies readonly (readonly [SourceType, CosmicWebDensitySourceEntry])[];
```

- `src/data/` must not import the Layer's sources except through `sources.ts`' spread, as for every formed Layer. The exhibit `src/data/exhibits/cosmicWeb.ts` already imports the Layer's `initialState`, so that edge is not new.
- No new test: moves only. Every moved test keeps its assertions, which is the identity check for the move.

- [x] `--dry` then real `move-files` for the seven moves (one manifest). Grep `data/sources/mcpm`, `data/sources/polyphorm`, `volumeFieldDefaults`, `projectVolumeFieldRows`, `settings/CosmicWebDensitySettings`, `settings/VolumeFieldRowData` for stragglers, including `vi.mock` literals and `.mts`.
- [x] Source-rows file and the `sources.ts` swap. Delete `VolumeSettings.d.ts`.
- [x] `npm run typecheck:fast && npx vitest run tests/layers/cosmicWebDensity tests/data tests/conventions tests/components` → green. `layerImportBoundary` must stay green: no `src/state/**` or `src/services/engine/**` file may now import the moved defaults. If one does, stop and report it; don't add an allow row.
- [x] Commit: `refactor(cosmicWebDensity): sources, defaults and Layer-only types move into the Layer`.

---

### Task 4: The Layer forms — runtime, load, target, passes and fades; core rows deleted

**review: yes.** It carries the arrival-ordering invariant (a named landmine), removes a Redux dispatch from the ingest, and rewires the render wake.

Spec §3, §4.4, §6, §8, rulings 1 and 5. After this task the renderer, upsample and slots are the Layer's runtime, and nothing in core names the density family except the six hand-kept fade tables (`FadeId`, `VisibilityLayerKey`, `visibilityLayerRows`, `visibilityActionRow`, …), which stay core (grill inventory). The UI is still the core `CosmicWebSectionContainer` (Task 5 splits it), which works because it reads only the slices.

**Files:**

- Create: `src/layers/cosmicWebDensity/layer.ts`, `create.ts`, `destroy.ts`, `@types/CosmicWebDensityRuntime.d.ts`, `@types/CosmicWebDensityReq.d.ts`, `load/cosmicWebDensityRequest.ts`, `load/cosmicWebDensityFetcher.ts`, `load/createCosmicWebDensitySlot.ts`, `load/cosmicWebDensityAssetRows.ts`, `passes/cosmicWebDensityPass.ts`, `passes/cosmicWebDensityUpsamplePass.ts`, `present/deriveCosmicWebDensityLiveness.ts`, `present/cosmicWebDensityFadeRows.ts`
- Modify: `src/layers/cosmicWebDensity/state/slices.ts` (header: no longer "settings-only"), `src/compositions/app.ts` (`cosmicWebDensityLayer` immediately before `cosmicWebFilamentsLayer`, in both the array and the `satisfies` tuple), `src/layers/cosmicWebDensity/state/cosmicWebDensity/slice.ts` (`addCosmicWebDensityField` + its reducer deleted, plus `removeCosmicWebDensityField` if Task 1 did not delete it; slice header follows)
- Modify (core rows leave):
  - `src/services/engine/gpuHandles/gpuHandleRegistry.ts:20,210-219`
  - `src/@types/engine/handles/EngineGpuHandles.d.ts:288-306` (two members; the "same phase as `volumeUpsample`" comments at `:313,:323` re-point)
  - `src/services/engine/engine.ts:187-188,286-289,516-532` (nulls; `passOverrides.allNames` = compute slots + `FRAME_ORDER_PASS_NAMES`, unfiltered, comment rewritten, grill Q12)
  - `src/@types/engine/state/EngineAssetSlots.d.ts:14-15,26-41`
  - `src/@types/loading/AssetKey.d.ts` (`'mcpm'`, `'polyphorm2Mrs'`, `'mcpmWorkbench'` members and the header's `'mcpm'` clause)
  - `src/services/engine/wiring/assetWiring.ts:16-18,51-53,154-192`
  - `src/services/engine/wiring/fadeLayers.ts:12,21-28,56-62,111-118`
  - `src/services/gpu/renderTargets.ts:27-44` ("why 1/3 scale" prose + the volume-precision sentence) and `:163-170` (the row)
  - `src/services/engine/frame/passes/index.ts:9-10,43-44`
  - `src/data/rendering/frameSections.ts:95-99,120` (names below; comments say `cosmic-web-density`)
- Delete: `src/services/engine/frame/passes/scalarVolumePass.ts`, `src/services/engine/frame/passes/volumeUpsamplePass.ts`, `src/services/engine/frame/volumeLiveness.ts`, `src/services/engine/volume/uploadVolumeField.ts` (and the now-empty `volume/` dir), `src/services/loading/slots/{mcpmSlot,polyphorm2MrsSlot,mcpmWorkbenchSlot}.ts`, `src/services/loading/fetchers/{mcpmFetcher,polyphorm2MrsFetcher,mcpmWorkbenchFetcher}.ts`, `src/@types/loading/{MCPMReq,Polyphorm2MRSReq}.d.ts`
- Ratchet: `tests/conventions/layerImportBoundary.test.ts:88-97` loses the `uploadVolumeField` row and its comment clause. The `watchTierSaga` row stays. `frameFilePurity.test.ts` loses any row naming a deleted file (the allow-list only shrinks).
- Comment re-points (names only): `src/@types/animation/FadeId.d.ts:61`, `src/@types/settings/VolumeFieldSettings.d.ts:11,66`, `src/@types/data/volume/VolumeFieldDefaults.d.ts:128`, `src/utils/clampVolumeFieldSettings.ts:19`, `src/services/engine/frame/passes/structureMarkersPass.ts:5`, `src/services/engine/frame/passes/milkyWayAggregatePass.ts:47`, `src/services/engine/phases/wireSlots.ts:141`, `src/@types/loading/StarCatalogReq.d.ts:6`, `src/@types/engine/frame/RenderTargetSpec.d.ts:15`, `src/@types/engine/frame/ReadyFrameContext.d.ts:89`, `src/services/gpu/renderTargets.ts:507`, `src/layers/cosmicWebFilaments/layer.ts` header (the "moves with `cosmicWebDensity`" clause stays until Task 5)
- Test (string-literal sweeps): `tests/visual/renderFrameSplitBaseline.test.ts`, `tests/services/gpu/timing/decodeTimestampBuffer.test.ts`, `tests/services/engine/frame/{renderFrame,renderFrame.timing,executeFrame}.test.ts`, `tests/services/gpu/renderTargets.test.ts`, `tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts` (stubs), `tests/services/engine/phases/wireSlots.test.ts:52,109,571,612` (the two `vi.mock` fetcher literals → `src/layers/cosmicWebDensity/load/cosmicWebDensityFetcher`), `tests/services/engine/wiring/{demandTable,assetWiring,fadeLayers}.test.ts`, `tests/services/engine/frame/frameOrderBoot.test.ts` (the target now comes from `Layer.targets`), `tests/components/SettingsPanel/SettingsPanel.test.tsx` only if it breaks
- Test (delete): `tests/services/engine/frame/passes/{scalarVolumePass,volumeUpsamplePass}.test.ts`, `tests/services/engine/frame/volumeLiveness.test.ts`, `tests/services/engine/volume/uploadVolumeField.test.ts`, the add/remove cases of `tests/layers/cosmicWebDensity/state/cosmicWebDensity/slice.test.ts`
- Test (move + merge): `tests/services/loading/fetchers/{mcpmFetcher,polyphorm2MrsFetcher}.test.ts` → `tests/layers/cosmicWebDensity/load/cosmicWebDensityFetcher.test.ts`
- Test (new): `tests/layers/cosmicWebDensity/load/cosmicWebDensityRequest.test.ts`, `tests/layers/cosmicWebDensity/load/createCosmicWebDensitySlot.test.ts`, `tests/layers/cosmicWebDensity/present/deriveCosmicWebDensityLiveness.test.ts`, `tests/layers/cosmicWebDensity/present/cosmicWebDensityFadeRows.test.ts`

**Contract:**

```ts
// @types/CosmicWebDensityRuntime.d.ts
export type CosmicWebDensityRuntime = {
  readonly renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>;
  readonly upsample: AdditiveUpsample;
  readonly slots: Readonly<Record<CosmicWebDensityFieldId, AssetSlot<ScalarCube, CosmicWebDensityReq>>>;
};

// @types/CosmicWebDensityReq.d.ts
/** `tier` is absent for an untiered row, so the request and the file it names cannot disagree. */
export type CosmicWebDensityReq = { readonly binBaseName: string; readonly tier?: Tier };

// load/cosmicWebDensityRequest.ts — `entry.tiered` picks the shape
export function cosmicWebDensityRequest(entry: CosmicWebDensitySourceEntry, tier: Tier): CosmicWebDensityReq;

// load/cosmicWebDensityFetcher.ts — `${SCALAR_FIELD_DATA_PREFIX}/${binBaseName}[-${tier}].scfd`
export const cosmicWebDensityFetcher: Fetcher<ScalarCube, CosmicWebDensityReq>;

// load/createCosmicWebDensitySlot.ts — construction-pure, as createFilamentSlot
export function createCosmicWebDensitySlot(
  entry: CosmicWebDensitySourceEntry,   // id + statics
  renderer: VolumeFieldRenderer<CosmicWebDensityFieldId>,
): AssetSlot<ScalarCube, CosmicWebDensityReq>;
// commit: renderer.upload(entry.id, cube, entry) — synchronous, no dispatch, no await before it.
// Keep today's `[engine] <id>: <dims> cube, min=…, max=…` ready log, keyed by entry.id.

// load/cosmicWebDensityAssetRows.ts — one row per source row, keyed by the Source code
export function cosmicWebDensityAssetRows(runtime: CosmicWebDensityRuntime): readonly AssetWiringRow[];
// row: { key: entry.code, factory: () => runtime.slots[entry.id],
//        req: (tier) => cosmicWebDensityRequest(entry, tier),
//        demand: (ctx) => ctx.settings.cosmicWebDensity.items[entry.id]?.enabled === true,
//        priority }  — priorities as today: mcpm 70, polyphorm-2mrs 82, mcpm-workbench 82.
// No `release` (grill Q13). The priority lives in the asset-rows file keyed by id, not on the source row.

// present/deriveCosmicWebDensityLiveness.ts — the state reads of today's volumeLiveness.ts:32-41
export function deriveCosmicWebDensityLiveness(
  runtime: CosmicWebDensityRuntime, state: PassState, ctx: FrameView,
): VolumeFieldLiveness<CosmicWebDensityFieldId> | null;
// master off AND master fade ≤ 0 → null; else deriveVolumeLiveness(runtime.renderer,
//   id => state.settings.cosmicWebDensity.items[id],
//   id => resolveLayerOpacity(state, ctx, { kind: 'cosmicWebDensityField', id }) * recessedMaster,
//   Math.hypot(...ctx.drawCamPos)).

// present/cosmicWebDensityFadeRows.ts — the two rows of fadeLayers.ts:56-62,111-118, re-homed
export function cosmicWebDensityFadeRows(runtime: CosmicWebDensityRuntime): readonly FadeLayer<unknown>[];
// master row verbatim; field row: expand = the source rows' ids,
//   guard: (_state, id) => runtime.renderer.listIds().includes(id)   (no `?.`, no `?? false`)

// passes/cosmicWebDensityPass.ts
export function cosmicWebDensityPass(runtime: CosmicWebDensityRuntime): ContentPass;
// = createScalarVolumePass({ name: 'cosmic-web-density', targetId: 'cosmic-web-density',
//     renderer: runtime.renderer, liveness: (s, c) => deriveCosmicWebDensityLiveness(runtime, s, c) })
// passes/cosmicWebDensityUpsamplePass.ts
export function cosmicWebDensityUpsamplePass(runtime: CosmicWebDensityRuntime): ContentPass;
// = createUpsamplePass({ name: 'cosmic-web-density-upsample', sourceTargetId: 'cosmic-web-density',
//     handleOf: () => runtime.upsample, enabled: (s, c) => deriveCosmicWebDensityLiveness(runtime, s, c) !== null })

// layer.ts
defineLayer({
  name: 'cosmicWebDensity',
  settings: cosmicWebDensityLayerSettings,
  sources: COSMIC_WEB_DENSITY_SOURCE_ROWS,
  targets: [{ id: 'cosmic-web-density', format: HDR_TARGET_FORMAT, depth: null, scale: 3,
              clearValue: { r: 0, g: 0, b: 0, a: 0 } }],  // two-line comment: why 1/3 scale
  create, destroy,
  passes: (runtime) => [cosmicWebDensityPass(runtime), cosmicWebDensityUpsamplePass(runtime)],
  assets: cosmicWebDensityAssetRows,
  fades: cosmicWebDensityFadeRows,
});
// create: renderer = createVolumeFieldRenderer<CosmicWebDensityFieldId>(device, HDR_TARGET_FORMAT, deps.fadeBgl);
//   upsample = createAdditiveUpsample(device, HDR_TARGET_FORMAT);
//   slots = one createCosmicWebDensitySlot(entry, renderer) per source row (a Record over the ids).
// destroy: renderer.destroy(), upsample.destroy().
```

| Thing | Before | After |
|---|---|---|
| raymarch pass | `scalar-volume` | `cosmic-web-density` |
| target | `volume` | `cosmic-web-density` |
| upsample pass | `volume-upsample` | `cosmic-web-density-upsample` |

- `FRAME_ORDER` stays core-authored and takes the new strings. Shaders stay at `src/services/gpu/shaders/scalarVolume/`.
- `uploadVolumeField`'s "wake rides the settings-row dispatch" line is gone with the dispatch. The arrival fade (the field row's false→true guard edge) is the wake now, as for flow and filaments. Nothing new replaces it.
- Tests worth writing (spec §10):
  - `cosmicWebDensityRequest.test.ts`: `it('a tiered row carries the tier, an untiered row carries none')`. `MCPM_ENTRY` at `'medium'` → `{ binBaseName: 'mcpm', tier: 'medium' }`, and `MCPM_WORKBENCH_ENTRY` at `'medium'` → an object with no `tier` key (`not.toHaveProperty('tier')`).
  - `cosmicWebDensityFetcher.test.ts`: keep the moved `it.each` over the three `mcpm-<tier>.scfd` names. Add `it('fetches an untiered request from <binBaseName>.scfd')` → `mcpm-workbench.scfd`. The expected paths are hand-written strings.
  - `createCosmicWebDensitySlot.test.ts`: `it('uploads the cube with the row statics before the slot reports ready')`. Use a stub renderer that records `upload` calls. Subscribe to the slot, and inside the `ready` callback assert `upload` was already called with `(entry.id, cube, entry)`. This is the arrival-ordering landmine, so it must fail if the upload moves after `ready`.
  - `cosmicWebDensityFadeRows.test.ts`: `it('opens the field fade exactly once when its slot commits')`. Wire `installFadeOnArrival` over the Layer's slots and fade rows with the `mcpm` intent on, then load and commit one cube. `fadeTo` fires once for `{ kind: 'cosmicWebDensityField', id: 'mcpm' }` and never for the other two ids. Follow the stub shape of `tests/services/engine/wiring/installFadeOnArrival.test.ts:60-76`. This replaces the volume cases in `wireSlots.test.ts:571` / `demandTable.test.ts` that asserted core rows; those cases re-point to the Layer rows and keep their assertions.
  - `deriveCosmicWebDensityLiveness.test.ts`: `it('is null when the master is off and its fade is out')`, and `it('stays live through a master fade-out tail with the toggle off')`. These are the two state-read cases left in `volumeLiveness.test.ts:95,106` after Task 2, now against a Runtime stub.
  - `createLayers`' duplicate-name and duplicate-target asserts already catch a half-moved pass or target. No test for that.

- [x] Runtime + Req types, `create`/`destroy`, `layer.ts`, composition entry.
- [x] Load: request, fetcher, slot factory, asset rows. Delete the three slots, three fetchers, two Req types and `uploadVolumeField`. Delete `addCosmicWebDensityField` (+ `removeCosmicWebDensityField` if still present).
- [x] Render: the liveness wrapper, both passes, the target row in `layer.ts`. Delete the core passes, `volumeLiveness`, the `volume` target row + prose, the handle rows + members + nulls, and the `passes/index.ts` entries. Update `FRAME_ORDER` strings and `engine.ts` `allNames`.
- [x] Fades: the Layer's rows. Delete the two core rows and `volumeFieldIds()`.
- [x] Ratchet row gone. Comment re-points. String-literal sweep: grep `'scalar-volume'`, `'volume-upsample'`, `'volume'` (targets only), `volumeFieldRenderer`, `volumeUpsample`, `uploadVolumeField`, `MCPMReq`, `Polyphorm2MRSReq`, `mcpmFetcher`, `polyphorm2MrsFetcher`, `mcpmWorkbenchFetcher`, `mcpmSlot`, `polyphorm2MrsSlot`, `mcpmWorkbenchSlot`, `addCosmicWebDensityField`, `polyphorm2Mrs` across `src/`, `tools/` (incl. `.mts`) and `tests/` (incl. `vi.mock` literals). Only `tools/mcpm-workbench/**`'s own `mcpmWorkbench` tool-page keys may survive.
- [x] `npm run typecheck:fast`, then `npx vitest run tests/layers tests/services/engine tests/services/gpu tests/services/loading tests/state tests/components tests/conventions tests/visual` → green. Then `npm run build` (the `?static` shader specifiers the renderer pulls are only checked here).
- [x] Commit: `refactor(cosmicWebDensity): the Layer owns the density cubes — runtime, load, target, passes, fades`.

---

### Task 5: The Cosmic web section splits into two Layer sections and a debug tuning section

**review: no.** UI only. The container tests below cover the one dispatch that matters.

Spec §7, grill Q7/Q8, rulings 3 and 4. The Style picker is deleted.

| Section | Owner | Slot | Contents |
|---|---|---|---|
| Cosmic web density | `cosmicWebDensity` | `main` | header toggle = master; one enable checkbox per source row, the workbench included |
| Cosmic web density (tuning) | `cosmicWebDensity` | `debug` | one identical row per source row: intensity, contrast, trim, density scale, exposure, palette; no enable checkbox |
| Cosmic web filaments | `cosmicWebFilaments` | `main` | header toggle = master; intensity slider while on |

**Files:**

- Create: `src/layers/cosmicWebDensity/ui/CosmicWebDensitySection.tsx`, `ui/CosmicWebDensitySectionContainer.tsx`, `ui/CosmicWebDensityTuningSection.tsx`, `ui/CosmicWebDensityTuningSectionContainer.tsx`, `ui/DensityFieldTuningRow.tsx`, `ui/DensityFieldTuningRow.module.css`; `src/layers/cosmicWebFilaments/ui/CosmicWebFilamentsSection.tsx`, `ui/CosmicWebFilamentsSectionContainer.tsx`
- Modify: `src/layers/cosmicWebDensity/layer.ts` (`ui: [{ slot: 'main', content: CosmicWebDensitySectionContainer }, { slot: 'debug', content: CosmicWebDensityTuningSectionContainer }]`), `src/layers/cosmicWebFilaments/layer.ts` (`ui: [{ slot: 'main', content: CosmicWebFilamentsSectionContainer }]`; the header loses the "UI moves with density" paragraph), `src/layers/cosmicWebDensity/ui/projectVolumeFieldRows.ts` (maps `COSMIC_WEB_DENSITY_SOURCE_ROWS` in row order, `label` from the row), `src/components/SettingsPanel/SettingsPanel.tsx:17,50` (the hard mount goes), `src/components/SettingsPanel/SettingsPanel.module.css:160-190` (the `.stylePicker*` block and its comment)
- Delete: `src/components/SettingsPanel/CosmicWebSection.tsx` (with `deriveCosmicWebStyle`), `src/components/SettingsPanel/VolumeFieldRow.tsx`, `src/components/SettingsPanel/VolumeFieldRow.module.css`, `src/components/containers/CosmicWebSectionContainer.tsx`
- Test: delete `tests/components/SettingsPanel/CosmicWebSection.test.ts`, move `tests/components/containers/CosmicWebSectionContainer.test.ts`'s surviving cases into `tests/layers/cosmicWebDensity/ui/CosmicWebDensitySectionContainer.test.tsx`, `tests/components/SettingsPanel/SettingsPanel.test.tsx:34` (the `vi.mock('…/CosmicWebSectionContainer')` literal goes), `tests/layers/cosmicWebDensity/ui/projectVolumeFieldRows.test.ts` (row order, not key order)

**Contract:**

```ts
// ui/projectVolumeFieldRows.ts — one row per COSMIC_WEB_DENSITY_SOURCE_ROWS entry, in row order
export function projectVolumeFieldRows(
  items: CosmicWebDensitySettings['items'],
): ReadonlyArray<VolumeFieldRowData>;

// ui/DensityFieldTuningRow.tsx — Props
type Props = {
  row: VolumeFieldRowData;
  onChange: (id: CosmicWebDensityFieldId, patch: Partial<VolumeFieldSettings>) => void;
};
```

- Components follow the Layer `ui/` precedent (`src/layers/flow/ui/FlowSection*.tsx`, `FlowTuningSection*.tsx`, `FlowRow.tsx` + `.module.css`). Each has one component per file, `function Name() {}` + `export default Name` (the container `export default memo(Name)`), and a top-level `.root` class. Presentational files import nothing from `store/` or `state/`. Containers dispatch `setCosmicWebDensityEnabled` / `writeCosmicWebDensityField({ id, patch })` / `setCosmicWebFilamentsEnabled` / `setCosmicWebFilamentsIntensity`, as `CosmicWebSectionContainer.tsx` does today (the `ui/` exemption).
- `DensityFieldTuningRow` is the slider half of today's `VolumeFieldRow.tsx`, with its "four controls on one line" layout prose gone (grill Q8). The main section's per-cube control is a checkbox + label and needs no row component.
- Tests worth writing (spec §10):
  - `CosmicWebDensitySectionContainer.test.tsx`: `it('ticking a cube writes items[id].enabled')`. Use a real store, start with `polyphorm-2mrs` off, `fireEvent.click` its checkbox, and assert `items['polyphorm-2mrs'].enabled === true` (testing.md: `click`, never `change`, on a controlled checkbox).
  - `it('lists every source row, the workbench included')`: three checkboxes, labels from the rows.
  - No test for the filaments section or the debug section's sliders. Each is a direct dispatch of an existing action, and a test would restate the markup.

- [x] Density main + debug sections, tuning row + CSS, filaments section. Add the `ui` entries to both `layer.ts` files.
- [x] `projectVolumeFieldRows` maps the source rows.
- [x] Delete the core section, row, container, mount, Style-picker CSS and the two old tests. Grep `CosmicWebSection`, `VolumeFieldRow`, `deriveCosmicWebStyle`, `stylePicker` → empty.
- [x] `npm run typecheck:fast && npx vitest run tests/layers/cosmicWebDensity tests/layers/cosmicWebFilaments tests/components tests/conventions` → green.
- [x] Commit: `feat(cosmicWebDensity): density and filaments sections split; per-cube sliders move to the DebugPanel`.

---

### Task 6: Docs and backlog

Spec §11.

**Files:**

- Modify: `docs/superpowers/specs/2026-08-20-edenhofer-dust-volume.md:47,52,83`. The "third joint" paragraph becomes "two Layers, two instances": the dust Layer mints its own `createVolumeFieldRenderer` (with a blend parameter), target, upsample and `createScalarVolumePass` row, and its own ingest in its `load/`, with no `absorptive` routing flag. Line 52's "(Ground preparation, third joint)" pointer and line 47's `VolumeFieldRow` palette-slot remark re-point at `DensityFieldTuningRow` in the debug section.
- Modify: `src/layers/README.md` status (formed: `cosmicWebDensity`, `cosmicWebFilaments`; stubs: `body`, `milkyWay`, `structure`; the line still says `filaments` / `volume`, a PR 1 leftover)
- Modify: `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §10(e) (`volume` done as `cosmicWebDensity`)
- Modify: `docs/backlog/2026-09-13-volume-field-vram-release.md`: paths → `src/layers/cosmicWebDensity/load/cosmicWebDensityAssetRows.ts`, `ui/CosmicWebDensitySectionContainer.tsx`, `present/cosmicWebDensityFadeRows.ts`; drop the `removeVolumeField` delete note (done)
- Modify: `docs/BACKLOG.md`:
  - `:48` (source-registry factory) → the star-catalog remainder only, since the density family has one fetcher and one per-row slot factory now
  - `:71` (liveness guards) → `src/utils/volume/deriveVolumeLiveness.ts` + the Layer's `present/deriveCosmicWebDensityLiveness.ts`
  - `:183` (viewport formula) → `createScalarVolumePass.ts` in place of `scalarVolumePass.ts`
  - `:185` (producer toggle freeze) gains `cosmic-web-density` as a reproducer
  - Line numbers shift after Task 1's deletion of `:39`, so match by title.
- `docs/RENDERER.md`: grep `scalar-volume`, `'volume'` target, `volumeUpsample`. Edit only on a hit (none at spec time).

- [x] Docs as listed.
- [x] `npx vitest run tests/conventions` → green (the README is a `src/layers/` entry the purity sweep walks).
- [x] Commit: `docs(cosmicWebDensity): Layer formed — Edenhofer joint, README, parent spec, backlog`.

---

## Definition of Done

> Completed 2026-09-23 (#814). Post-plan deletions: `ui/projectVolumeFieldRows.ts` and `@types/VolumeFieldRowData.d.ts` (sections iterate the source rows directly), `load/cosmicWebDensityRequest.ts`, `VolumeFieldDefaults.fadeBands`, and `| undefined` on `settingsOf` (`items` is total). Ledger: `2026-09-22-cosmic-web-density-layer-02-layer.ledger.md`.

**Deliverable inventory**

- `src/layers/cosmicWebDensity/` has `layer.ts`, `create.ts`, `destroy.ts`, `sources/` (three rows + `cosmicWebDensitySourceRows.ts`), `state/` (+ `defaults.ts`), `load/` (request, fetcher, slot factory, asset rows), `passes/` (two), `present/` (liveness wrapper, fade rows), `ui/` (main + debug sections and containers, tuning row, `projectVolumeFieldRows.ts`), and `@types/` (`CosmicWebDensityRuntime`, `CosmicWebDensityReq`, `CosmicWebDensitySettings`, `VolumeFieldRowData`). `cosmicWebFilaments/ui/` has its section + container.
- Core has `createScalarVolumePass`, `ScalarVolumePassRow`, `VolumeFieldLiveness`, `src/utils/volume/deriveVolumeLiveness.ts`, and a `VolumeFieldRenderer<Id>` whose `upload` takes `statics` and imports no registry.
- None of these exist: `scalarVolumePass`, `volumeUpsamplePass`, `volumeLiveness`, `uploadVolumeField`, `state.gpu.volumeFieldRenderer` / `volumeUpsample`, `EngineAssetSlots.mcpm` / `polyphorm2Mrs` / `mcpmWorkbench`, the three string `AssetKey` members, the three slot files, the three fetchers, `MCPMReq`, `Polyphorm2MRSReq`, the `volume` target row, `volumeFieldIds()`, `addCosmicWebDensityField`, `removeCosmicWebDensityField`, `seedVolumeFields`, `VolumeSettings`, `CosmicWebSection`, `VolumeFieldRow`, `CosmicWebSectionContainer`, `deriveCosmicWebStyle`, the `.stylePicker*` CSS, `volumeVisibilityByFileName`, `selectManifestFiles`, the `--volumes` flag.
- Task 1: the `INITIAL_SETTINGS` dump is unchanged; no source row has `visible`; the constellations / filaments entries and `VolumeFieldDefaults` have no `intensity`; the backlog detail file and its index line are gone.
- `layerImportBoundary` is green with the `uploadVolumeField` row gone; `frameFilePurity` is green; `engine.ts` `passOverrides.allNames` has no target filter; `npm run build` passes.
- Docs per Task 6.

**Observable behaviours (smoke, main app; the user's eyes)**

- MCPM visible at boot.
- Polyphorm 2MRS: tick → fades in; untick → fades out.
- SettingsPanel shows "Cosmic web density" (all three cubes listed, the workbench included) and "Cosmic web filaments", adjacent, with no Style picker.
- The per-cube sliders are in the DebugPanel.
- `cosmic-web-density` is toggleable in the DebugPanel pass list (it freezes like ZoA's; backlog "Disabling a producer layer…").
- `npm run fetch-data -- --dry-run` lists every manifest `.scfd` file.

**Deferral boundary**

- VRAM release on untick (`docs/backlog/2026-09-13-volume-field-vram-release.md`, grill Q13): no `release` predicate, no fifth `DemandCtx` surface.
- The dust Layer, a blend parameter on the renderer, and Edenhofer wiring.
- Flow's cube keeps its own ingest path (decision #14).
- The six hand-kept fade tables stay core.
- The producer-toggle freeze is inherited, not fixed (grill Q12).
- No perf gate. No deletion audit until `/feature-done`.

---

## Questions for the user

1. **`CosmicWebDensitySettings.items`: partial or total?** Spec §5 has the exhibit spread `initialState.items['polyphorm-2mrs']`. That only type-checks if `items` is a total `Record<CosmicWebDensityFieldId, VolumeFieldSettings>`, not today's `Partial<…>`. A total record forbids `delete`, which pulls the `removeCosmicWebDensityField` deletion (ruled in grill Q13, placed in the Layer commit by spec §8) forward into Task 1. `addCosmicWebDensityField` would briefly re-seed from `initialState` until Task 4 deletes it. The plan assumes **total, pulled forward**. The alternative is to keep `Partial` through Task 1 and have the exhibit rebuild the item from `buildVolumeFieldSettings` plus literal `enabled` / `intensity`, which is a second copy of the boot literal.
2. **The `allVisibleMask` test in spec §10.** Once the mask is a fold over `INITIAL_SETTINGS.galaxyCatalogs.items`, a test asserting "mask equals the enabled items" can't fail (testing.md: mirror). The plan drops it. Say if you want it kept.
