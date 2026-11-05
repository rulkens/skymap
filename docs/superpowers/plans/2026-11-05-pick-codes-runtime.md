# Pick codes are runtime-only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Skymap runs it under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`.

**Goal:** Every pick word's 6-bit code comes from a boot-time allocator the root owns, never from the `Source`
table, so pick codes become a runtime detail nothing persists.

**Architecture:** `createLayers` binds one `pickCode(id)` per Layer onto `LayerCoreDeps`; every stamp site,
`pickSources` list and `encodePick` reads its code from it. Tasks 1–7 keep every code equal to today's
`Source` value (a seed map), so nothing changes visibly; Task 8 drops the seed and numbers densely.

**Tech Stack:** TypeScript, WebGPU/WESL, Redux-Saga, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-selection-kind-facts-design.md` §3.4 (prep 1 and 2), §3.5.
This plan is the **prep PR**; `2026-11-05-selection-kind-facts.md` is the feature PR that follows it.

## Global Constraints

- `LayerCoreDeps` gains exactly one member, `pickCode` (owner's yes, ask T6Jp). No other Layer-contract,
  `ReconcileEffects` or `SagaContext` growth.
- The pick word layout does not change: 6-bit code, 26-bit index, sentinel 63, `PICK_SENTINEL_OFFSET`.
- A **pick code** lives only in the pick word, GPU per-draw uniforms and `pickSources`. A **catalog `Source`
  value** lives in refs (`ref.source`), loaders, `galaxyType` and the source registry. After Task 8 they are
  different numbers; no code may use one as the other.
- No pick code in the URL, saved state, a `.bin`, or a test fixture as a literal.
- Moves via `npm run move-files -- <from> <to>`; symbol renames via `npm run refactor -- rename …`. No ad-hoc
  ts-morph scripts.

## Review Focus

1. **The selected-galaxy highlight** (`galaxyPointSpritesPass.ts:36`) packs the ref's catalog `source`; after
   Task 8 a selected galaxy must still highlight. Pinned by Task 3's round-trip test.
2. **Caption picks** (body, star, black-hole, famous-galaxy captions) build pick ids outside any pass; a
   click on a caption must still select its subject. Pinned by each Layer task's round-trip test.
3. **Two Layers asking the same local id** (`'points'`) must get different codes. Pinned in Task 1.
4. **Gaia survey star picks**, whose code moves from a WESL constant to a uniform (Task 4): hover and click
   a Gaia star must still resolve. Smoke check (GPU path, no unit seam).
5. **Tests that pack `Source.X` literally** into fake pick words break silently under dense codes (they
   still pass if both sides use the literal). Task 8 sweeps them onto the allocator.

---

### Task 1: The allocator and `LayerCoreDeps.pickCode`

**Files:**
- Create: `src/services/engine/selection/createPickCodeAllocator.ts`,
  `src/@types/engine/selection/PickCodeAllocator.d.ts`, `src/compositions/legacyPickCodes.ts`
- Modify: `src/@types/engine/layer/LayerCoreDeps.d.ts:29`, `src/services/engine/phases/createLayers.ts:84-98`
  (+ the engine state field that keeps the allocator)
- Test: `tests/services/engine/selection/createPickCodeAllocator.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // LayerCoreDeps, after requestRender:
  /** This app's pick code for one of the Layer's pick sources; stable for the session, never persisted. */
  readonly pickCode: (pickSourceId: string) => number;

  export type PickCodeAllocator = {
    /** Same (layer, id) → same code. Throws past 62 codes. */
    codeOf(layer: string, pickSourceId: string): number;
    /** The (layer, id) that owns `code`, or null; for the debug overlay and assertions. */
    ownerOf(code: number): { readonly layer: string; readonly pickSourceId: string } | null;
  };
  export function createPickCodeAllocator(
    seed?: Readonly<Record<string, Readonly<Record<string, number>>>>,  // layer → id → code
  ): PickCodeAllocator;
  ```
- `legacyPickCodes.ts` exports `LEGACY_PICK_CODES`: layer name → pick-source id → today's `Source` value, one
  entry per id Tasks 3–7 introduce. It exists only until Task 8. Ids are short and Layer-local
  (`'planet'`, `'earth'`, `'sdss'`, `'gaia'`, `'famousGalaxy'`, …); the implementer of each later task adds
  its ids here.
- `createLayers` builds one allocator per engine from `LEGACY_PICK_CODES`, keeps it on engine state, and
  binds `pickCode: (id) => allocator.codeOf(layer.name, id)` into `common`.

- [x] Test `same layer and id return the same code`.
- [x] Test `two layers with the same id get different codes`.
- [x] Test `a seeded id returns its seed value` and `an unseeded id never takes a seeded code`.
- [x] Test `throws when a 63rd code is asked for`; message names the layer and id.
- [x] Test `ownerOf inverts codeOf`.
- [x] Implement; add the member and the binding. No Layer reads it yet.
- [x] `npx vitest run tests/services/engine/selection/createPickCodeAllocator.test.ts` → pass;
      `npm run typecheck:fast` → clean.
- [x] Commit `Pick codes: a per-engine allocator bound onto LayerCoreDeps`.

### Task 2: `resolvePick(pick)` drops the registry entry

**Files:**
- Modify: `src/@types/engine/layer/SelectionKindRow.d.ts:15`, `src/services/engine/selection/composeSelectionRows.ts:36`,
  the ten rows' `resolvePick` (`src/layers/*/…SelectionRow.ts`: blackHoles, galaxyCatalog, missions,
  zoneOfAvoidance, body, earthScenes, milkyWay, satellites, structure, starCatalog), and their tests.

**Interfaces:**
- Produces: `resolvePick(pick: PickResult): Ref | null;`. Each row maps `pick.sourceCode` to its own catalog
  or table with what it already imports (e.g. `starCatalogSelectionRow.ts:67` branches seeded vs survey by
  code). Rows that read `entry.id` (body: `BODY_PICK_ROWS[entry.id]`) look the entry up by code themselves
  until Tasks 3–7 give them their codes.

- [x] Change the signature and the caller; `composeSelectionRows` no longer imports `APP_SOURCE_REGISTRY`.
- [x] No new test: a signature sweep the compiler checks; existing row tests keep passing.
- [x] `npm run typecheck:fast`; `npx vitest run tests/services/engine/selection tests/layers` → pass.
- [x] Commit `resolvePick takes the pick alone; each row knows its own codes`.

### Task 3: galaxyCatalog reads its codes from `pickCode`

**Files:**
- Modify: `src/layers/galaxyCatalog/pointSprites/render/catalogStore.ts:159` (`CODE_OF_ID`),
  `disks/procedural/render/proceduralDiskRenderer.ts:275`, `famousGalaxies/present/produceFamousGalaxyLabels.ts:227`,
  `structureMembership/utils/structureMembership.ts:41`, `pointSprites/passes/galaxyPointSpritesPass.ts:36`,
  `selection/present/galaxyCatalogSelectionRow.ts:38` (`encodePick`, `pickSources`, `resolvePick`), the
  Layer's `create` and runtime type, `src/compositions/legacyPickCodes.ts`
- Test: `tests/layers/galaxyCatalog/selection/present/galaxyCatalogSelectionRow.test.ts` (create)

**Interfaces:**
- Consumes: `deps.pickCode` (Task 1).
- Produces: the galaxyCatalog runtime holds `pickCodeOf(source: GalaxyCatalogSourceType): number` (catalog →
  pick code) and its inverse; every packer above uses it. The highlight word at `galaxyPointSpritesPass.ts:36`
  is the row's `encodePick(ref)`, not a hand-packed `ref.source`.

- [x] Test `encodePick then resolvePick round-trips under non-Source codes`: build the row with a fake
      `pickCode` returning codes from 40 up; for an SDSS ref and a famous-galaxy ref,
      `resolvePick(unpack(encodePick(ref)))` deep-equals `ref`, and `ref.source` is still the catalog value.
- [x] Test `pickSources are exactly the codes the stamps use` (same fake).
- [x] Implement; add the Layer's ids to `LEGACY_PICK_CODES`.
- [x] Targeted tests and `typecheck:fast` → pass.
- [x] Commit `galaxyCatalog stamps the allocator's codes`.

### Task 4: starCatalog reads its codes from `pickCode`; the Gaia code becomes a uniform

**review: yes** (WESL ↔ TS contract)

**Files:**
- Modify: `src/layers/starCatalog/seededStars/passes/starPointsPass.ts:242`,
  `resolvedStars/passes/starSpheresPass.ts:130`, `resolvedStars/passes/fieldStarSpherePass.ts:178`,
  `captions/present/produceStarCaptions.ts:52`, `survey/render/starCatalogPickRenderer.ts`,
  `selection/present/starCatalogSelectionRow.ts:67,76`, the Layer's `create` and runtime type,
  `src/services/gpu/shaders/starCatalog/pickFragment.wesl:44-57`,
  `src/services/gpu/shaders/lib/selectionEncoding.wesl:42-46` (the constant goes),
  `src/compositions/legacyPickCodes.ts`
- Test: `tests/layers/starCatalog/selection/present/starCatalogSelectionRow.test.ts`

**Interfaces:**
- Produces: the star pick fragment reads its code from a `u32` in the survey pick renderer's existing
  uniform block (pick the block it already binds; add the field at the end, keep 16-byte alignment, and
  update the TS writer in the same commit). `SOURCE_GAIA_STARS` no longer exists in WESL or TS.
- The pick debug overlay also imports `SOURCE_GAIA_STARS` (`pickDebugOverlay/fragment.wesl:18,79`); Task 7
  replaces it. Until then, keep the overlay compiling by moving the constant into the overlay shader
  locally with a `// Task 7` note — not into the lib.

- [ ] Test `seeded and survey refs round-trip under non-Source codes` (fake `pickCode`, codes ≥ 40).
- [ ] Implement; read the `wesl-shaders` skill first.
- [ ] `typecheck:fast`, targeted tests → pass; dev server: hover a Gaia star and a named star, both resolve.
- [ ] Commit `starCatalog stamps the allocator's codes; Gaia's code is a uniform`.

### Task 5: body, missions and earthScenes read their codes from `pickCode`

**Files:**
- Modify: `src/layers/body/spheres/passes/planetsPass.ts:105`, `body/earth/passes/earthPass.ts:99`,
  `body/glints/passes/bodyGlintsPass.ts:139,174`, `body/meshes/passes/bodyMeshesPass.ts:10`,
  `missions/craft/passes/missionMeshesPass.ts:10`, `missions/craft/present/craftPickId.ts:14`,
  `earthScenes/scenes/passes/earthSceneMeshesPass.ts:10`, `src/utils/picking/sceneBodyPickId.ts:19`,
  `src/utils/labels/bodyCaption.ts:42`, the three selection rows, the three Layers' `create`/runtime and
  `layer.ts` (`passes`), `src/compositions/legacyPickCodes.ts`
- Test: `tests/layers/body/selection/present/bodySelectionRow.test.ts` (create),
  `tests/layers/missions/craft/present/craftSelectionRow.test.ts`, `tests/utils/picking/sceneBodyPickId.test.ts`

**Interfaces:**
- Produces:
  - The three module-level mesh passes become factories taking the code source, built in `passes(runtime)`:
    `missionMeshesPass(pickIdOf: (id: string) => number | null): ContentPass` (same for
    `bodyMeshesPass`, `earthSceneMeshesPass`). `meshBodiesPassOver` (core) already takes the id function.
  - `sceneBodyPickId(id: string, codeOf: (entry: BodySourceEntry) => number): number | null` — core keeps
    the seed-table walk, the caller supplies the code. `bodyCaption` receives `codeOf` from the body Layer.

- [ ] Test `body, craft and earth-scene refs round-trip under non-Source codes`.
- [ ] Test `a body caption's pick id resolves to the same ref as its sphere's pick`.
- [ ] Implement.
- [ ] Targeted tests, `typecheck:fast` → pass.
- [ ] Commit `Bodies, craft and Earth scenes stamp the allocator's codes`.

### Task 6: structure, milkyWay, blackHoles, satellites and zoneOfAvoidance read their codes from `pickCode`

**Files:**
- Modify: `src/data/structure/structureIds.ts:17-21` (`STRUCTURE_ID_CODES` goes; the Layer's runtime holds
  category → code), `src/layers/structure/picking/utils/structurePickId.ts:13`,
  `structure/markers/render/structureMarkerRenderer.ts:56,395`, `milkyWay/picking/present/milkyWayPickId.ts:5`
  (module constant → runtime value; its three readers), `milkyWay/picking/render/milkyWayPickRenderer.ts:175`,
  `blackHoles/markers/passes/blackHoleMarkerPass.ts:93`,
  `blackHoles/markers/present/produceBlackHoleCaptions.ts:44`,
  `satellites/points/render/satellitePointRenderer.ts:122`,
  `zoneOfAvoidance/shell/render/zoneOfAvoidanceRenderer.ts:128`, the five selection rows and Layers,
  `src/compositions/legacyPickCodes.ts`
- Test: `tests/layers/structure/picking/present/structureSelectionRow.test.ts`,
  `tests/layers/blackHoles/markers/present/blackHoleSelectionRow.test.ts`,
  `tests/layers/satellites/focus/present/satellitesSelectionRow.test.ts`; create the milkyWay
  (`card/present/`) and zoneOfAvoidance (`selection/present/`) row tests beside their sources' mirrors

- [ ] Test, per row: `refs round-trip under non-Source codes` (structure: one ref per category).
- [ ] Implement. `structureIds.ts` keeps `STRUCTURE_IDS`; only the code map leaves `src/data/`.
- [ ] Targeted tests, `typecheck:fast` → pass.
- [ ] Commit `Structures, Milky Way, black holes, satellites and the zone of avoidance stamp the allocator's codes`.

### Task 7: The pick debug overlay reads Gaia's code from the allocator

**review: yes** (WESL ↔ TS contract)

**Files:**
- Modify: `src/services/gpu/passes/pickDebugOverlay.ts`, `src/services/gpu/shaders/pickDebugOverlay/fragment.wesl:18,69-79`,
  the place that creates the overlay (it reads the engine's allocator from Task 1)
- Test: none (debug view; the smoke check covers it)

**Interfaces:**
- Consumes: `PickCodeAllocator.codeOf('starCatalog', 'gaia')` (Task 1, Task 4's id).
- Produces: the overlay's uniform block gains `dimCode: u32`; the shader compares against it. The Task 4
  local constant goes.

- [ ] Implement; read the `wesl-shaders` skill first.
- [ ] Dev server with the pick debug overlay on: Gaia stars still dim; other sources keep distinct colours.
- [ ] Commit `Pick debug overlay dims Gaia by the allocator's code`.

### Task 8: Dense codes; no code is ever persisted

**Files:**
- Delete: `src/compositions/legacyPickCodes.ts`
- Modify: `src/services/engine/phases/createLayers.ts` (no seed), tests that pack `Source.X` into fake pick
  words (find them: `grep -rn "packSelection(Source\." tests`, and `sourceCode: Source\.` in fixtures)
- Test: `tests/services/engine/selection/pickCodesNeverPersisted.test.ts` (create)

- [ ] Test `the URL hash of a focused ref of every kind holds no pick code`: for one ref per kind, build its
      focus id (the row's `focusId.encode`) and hash (`src/services/url/writeHashBody.ts`) with a dense
      allocator and with a seeded one; the strings are equal.
- [ ] Test `the selection slice and saved settings hold no pick code`: same two allocators, the serialised
      `selection` and `settings` state are equal after selecting and hovering one ref per kind.
- [ ] Delete the seed; the allocator numbers from 1 in first-ask order.
- [ ] Sweep the tests from the grep onto a test allocator; none keeps a `Source` literal as a pick code.
- [ ] `npx vitest run tests/services/engine tests/layers tests/state` → pass; `typecheck:fast` → clean.
- [ ] Dev server smoke (the DoD list below).
- [ ] Commit `Pick codes are dense and runtime-only`.

## Definition of Done

**Deliverables**
- `createPickCodeAllocator` and `PickCodeAllocator`; `LayerCoreDeps.pickCode`.
- `resolvePick(pick)` on every row.
- No `Source.<X>` or `STRUCTURE_ID_CODES` read at any stamp site; `SOURCE_GAIA_STARS` gone from WESL and TS;
  `legacyPickCodes.ts` gone.

**Smoke (dev server, default FOV)** — each: hover shows the right InfoCard, click selects it with its ring:
- a survey galaxy, a famous galaxy and its label, the selected-galaxy highlight;
- a Gaia star, a named star and its caption;
- Earth, a planet, a moon and a planet caption; a craft (Voyager exhibit); Søndermarken;
- a structure ring of each category; the Milky Way; Sgr A\* and its caption; a satellite; the zone of
  avoidance shell;
- the pick debug overlay: Gaia dimmed, colours distinct.

**Deferred:** everything in `2026-11-05-selection-kind-facts.md`; deleting `Source` (its own stream); the
64-bit pick target (backlog).
