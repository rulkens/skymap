# Body content out of core, PR C: Layers declare their mesh rows

> **For agentic workers:** execute with `superpowers:subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax.

**Goal:** the four Layers that draw meshes return their own mesh asset rows; core mints none and
no longer lists which bodies have a shape model. No behaviour change in the app.

**Spec:** [`2026-11-24-body-content-out-of-core-design.md`](../specs/2026-11-24-body-content-out-of-core-design.md)
§4.2, §4.3, §5 prep 6. Third of four PRs (§6); A (#1155) and B (#1157) have landed.

**Why it is safe to land alone:** the app composes all four mesh Layers, so the same rows exist
with the same keys, requests and demand; only their author changes.

**Not in this PR:** the fade-edge fallback, the empty-registry import test, the galaxies-only
measurements, the ADR (all PR D). `meshAssets.generated.ts`, `meshFetcher` and `meshBinaryFormat`
do not move: after this PR only Layers import them (spec §3).

## Global constraints

- Never run `npm run build-meshes`, `npm run build-famous-stars` or `npm run build-data-manifest`
  in this worktree (`public/data` is a symlink into the main checkout).
- Never stage `tools/reference-engine/`, `src/compositions/galaxiesOnly.ts` or `.payoff-dist*`.
  Never `git add -A`. Do not run `npm run format` (it touches the untracked kit); run
  `npx prettier --write` on the files you edited.
- One commit per task, no `Co-Authored-By` line. Git as plain single commands.
- Slot keys (`mesh:<id>`), slot names, requests and demand must come out identical to today's.
- A Layer may not import `src/compositions/`. Core may not import a Layer.

## Rulings made at plan time (where the spec and the code differ)

- **`tierCeiling` is a `Tier`, not a number** (`meshAssets.generated.ts:13`, `clampTier.ts:15`).
- **A presentation carries `resolvePx`.** Today's row builder looks it up in `SCENE_BODIES`
  (`meshAssetRows.ts:26`); the fold that builds the presentation already holds the body, so it
  copies the value and the helper keeps the spec's two-argument signature.
- **Mesh rows take rank 11, not 10.** The missions Layer is composed before the body Layer
  (`src/compositions/app.ts:39` and `:51`), so at equal rank craft meshes would now fetch ahead of
  body textures. Rank 11 is unused, keeps today's order, and follows the "ranks are distinct on
  purpose" rule (`AssetWiringRow.d.ts:28-32`). The array-order comment in `createLayers.ts:162-166`
  goes.
- **Shape models are joined onto the body Layer's rows in `bodyBodyRows.ts`**, the way
  corrections are (`bodyBodyRows.ts:88-95`), from a Layer-owned id list. `MESH_ASSETS` stays the
  one statement of the mesh facts.

---

### Task 1: A presentation carries everything its asset row needs

**review: yes** (Layer contract; registry fold)

**Files:** `src/@types/scene/ShapeModel.d.ts` (create), `src/@types/engine/layer/LayerBody.d.ts`,
`src/@types/scene/MeshBody.d.ts`, `src/@types/scene/MeshPresentation.d.ts`,
`src/data/bodies/makers/meshBody.ts`, `src/utils/meshBodies/meshPresentationsOf.ts` (create),
`src/data/bodies/meshPresentations.ts`, `src/layers/body/bodies/shapeModelBodyIds.ts` (create),
`src/layers/body/bodies/bodyBodyRows.ts`, `src/services/engine/wiring/meshAssetRows.ts` (modify);
tests beside each.

**Contract:**

```ts
// src/@types/scene/ShapeModel.d.ts
/** A celestial body drawn from a mission shape model instead of a sphere. */
export type ShapeModel = {
  readonly meshKey: string;
  readonly boundingRadiusM: number;
  readonly tierCeiling?: Tier;
};

// LayerBody gains
readonly shapeModel?: ShapeModel;

// MeshBody gains (joined from MESH_ASSETS by the maker, like boundingRadiusM)
readonly tierCeiling?: Tier;

// MeshPresentation gains
readonly resolvePx: number;
readonly tierCeiling?: Tier;

// src/utils/meshBodies/meshPresentationsOf.ts
/** The rows that draw as a mesh: mesh bodies first, then bodies with a shape model. */
export function meshPresentationsOf(rows: readonly LayerBody[]): readonly MeshPresentation[];
```

- `MESH_PRESENTATIONS` becomes `meshPresentationsOf(APP_BODY_REGISTRY)`. Its `SHAPE_MODEL_BODY_IDS`,
  `shapeModel()` and `MESH_ASSETS` import go.
- `shapeModelBodyIds.ts` holds the five ids (Phobos, Deimos, Vesta, Ceres, Bennu) in the body
  Layer; `bodyBodyRows.ts` joins `shapeModel` from `MESH_ASSETS` for them and throws at load on a
  missing asset entry (today's `meshPresentations.ts:18` throw, moved).
- A `MeshBody` row never sets `shapeModel` (spec §4.2).
- `meshAssetRows.ts` reads `resolvePx` and `tierCeiling` off the presentation; its `SCENE_BODIES`,
  `findByIdOrThrow` and `MESH_ASSETS` imports go. It still exists after this task.
- `MESH_PRESENTATIONS` must hold the same ids in the same order as before. If the order changes,
  stop and report.

- [x] Test `meshPresentationsOf lists mesh bodies, then shape-model bodies, and skips plain rows`.
- [x] Test `every shape-model row's key has a MESH_ASSETS entry` and
      `no mesh-body row sets shapeModel` (over `APP_BODY_REGISTRY`).
- [x] Before implementing, print `MESH_PRESENTATIONS` ids and each row's `req('large')` and demand
      to a scratch file; after, diff. Zero diff.
- [x] Implement. `npm run typecheck:fast`;
      `npm test -- meshPresentations meshAssetRows meshBody bodyBodyRows appBodies` pass.
- [x] Commit.

### Task 2: Core hands Layers the mesh renderer; Layers return their mesh rows

**review: yes** (Layer contract: `LayerCoreDeps` growth, approved by the owner 2026-11-24)

**Files:** `src/@types/engine/layer/LayerCoreDeps.d.ts`,
`src/@types/engine/layer/MeshBodiesSink.d.ts` (create),
`src/services/engine/wiring/meshAssetRow.ts` (create, from `meshAssetRows.ts`, which is deleted),
`src/services/engine/phases/createLayers.ts`, the four Layers' `layer.ts`, `create.ts` and Runtime
type (`body`, `missions`, `earthScenes`, `probeSpheres`), `src/layers/body/@types/BodyAssetKey.d.ts`,
`tests/helpers/engine/bodyLayerWithoutGpu.ts`; tests listed below.

**Contract:**

```ts
// src/@types/engine/layer/MeshBodiesSink.d.ts
/** Core's one mesh renderer, as the two calls an asset slot makes. Safe before the renderer exists. */
export type MeshBodiesSink = {
  readonly setMesh: (id: SceneBodyId, asset: MeshAsset) => void;
  readonly clearMesh: (id: SceneBodyId) => void;
};

// LayerCoreDeps gains
readonly meshBodies: MeshBodiesSink;

// src/services/engine/wiring/meshAssetRow.ts
/** One mesh body's asset row: loads when it is `resolvePx` across, releases below half that. */
export function meshAssetRow(meshBodies: MeshBodiesSink, presentation: MeshPresentation): AssetWiringRow;
```

- `createLayers.ts` builds the sink once in the `common` deps (`:90-107`) as closures over
  `state.gpu.meshBodyRenderer?.`, the style `requestRender` already uses. Its `meshAssetRows`
  import and the line at `:170` go, with the "Layer rows lead" sentence of the comment above it.
- Each mesh Layer keeps `deps.meshBodies` on its Runtime and returns
  `meshPresentationsOf(<its own body rows>).map((p) => meshAssetRow(runtime.meshBodies, p))` from
  `assets`. The body Layer returns its texture rows followed by its mesh rows. `assets` runs once
  per Layer (`instantiateLayer.ts:29`), so minting the slots there is safe.
- Mesh rows carry `priority: 11` (ruling above).
- Stale comments naming "core's `meshAssetRows`" or "core's mesh slots" are corrected in the same
  commit: `AssetWiringRow.d.ts:19`, `EngineState.d.ts:77`, `EngineGpuHandles.d.ts:161`,
  `engine.ts:180`, `body/layer.ts:9`, `missions/layer.ts:5-6`, `missionMeshesPass.ts:3`,
  `earthScenes/layer.ts:3`, `earthSceneMeshesPass.ts:3`, `probeSpheres/create.ts:1`.
- Tests that spread `meshAssetRows(state)` (`demandTable.test.ts:198`, `demandAtPoses.test.ts:100`,
  `wireSlots.test.ts:256`) build the same rows with
  `MESH_PRESENTATIONS.map((p) => meshAssetRow(sink, p))` and a no-op sink.
  `meshAssetRows.test.ts` becomes `meshAssetRow.test.ts` (the ceiling clamp).
- The full set of `state.assetRows` keys must be the same set as before, and the fetch order by
  `(priority, array index)` must keep every body texture row ahead of every mesh row.

- [ ] Before implementing, dump `state.assetRows.map((r) => [r.key, r.priority])` from the
      composition test's harness (or a scratch script over the app composition's Layers) to a
      scratch file; after, compare: same key set, mesh rows at 11, nothing else changed.
- [ ] Extend `createLayers.composition.test.ts:179-195`: compose the missions Layer with the body
      Layer and assert `body textures rank ahead of craft meshes`.
- [ ] Test `a mesh row's commit and release call the sink with its body id` (`meshAssetRow.test.ts`).
- [ ] Test `each mesh Layer returns one mesh row per mesh body it declares` (one test per Layer,
      beside the Layer's existing tests, or one table-driven test over the four).
- [ ] Implement. `npm run typecheck:fast`; `npm test -- wiring phases layers/body layers/missions
      layers/earthScenes layers/probeSpheres conventions` pass.
- [ ] Commit.

### Task 3: Docs and backlog say one asset path

**Files:** `src/layers/README.md` (`:122`, `:126-128`), `docs/RENDERER.md:38`,
`src/compositions/README.md:16`, `.claude/skills/add-mission/SKILL.md` (step 7, `:166-170`, only if
it describes where mesh rows come from), `docs/backlog/2026-10-29-layer-migration-leftovers.md:92`.

- Each place that says core owns the mesh slots or mints mesh rows now says the drawing Layer
  returns them through `assets` and core hands it the renderer as `deps.meshBodies`.
- Grep `meshAssetRows` and "mesh slots" across `src docs tests packages .claude` once more; no hit
  may describe the old path.

- [ ] Edit; commit.

### Task 4: Verify the app is unchanged

**Files:** none

- [ ] Before Task 1 and after Task 3, shoot on this worktree's dev server at
      `t=2026-01-01T12:00:00Z`: `focus=body-phobos`, `body-bennu`, `body-curiosity`,
      `body-voyager1`, `body-soendermarken`, `body-hubble`, and
      `layers=probeSpheres&focus=body-probe-sphere-orbit`. Pairs go to the owner as dash checks.
- [ ] `npm run perf` (`earth-surface`, `solar-system`, `full-survey` as control) and
      `npm run perf:cpu`, before and after, `--url` this worktree's server.
- [ ] Payoff build with an empty body registry (`tools/reference-engine/vite.payoff.config.ts`,
      untracked kit): `attribute.mts` no longer lists `npm:meshoptimizer`. Informative.

---

## Definition of Done

**Deliverables**

- `LayerBody.shapeModel?`, `ShapeModel`, `MeshBodiesSink`, `LayerCoreDeps.meshBodies`.
- `meshAssetRow` and `meshPresentationsOf`; `meshAssetRows.ts` deleted.
- No core file imports `meshAssets.generated`, `meshFetcher` or `meshAssetRow` by value except
  `meshFetcher.ts` itself and the `meshBody` maker (check:
  `grep -rn "meshAssets.generated'\|fetchers/meshFetcher'\|wiring/meshAssetRow'" src --include='*.ts'`
  and read the hits outside `src/layers/`).
- `createLayers.ts` builds asset rows from Layers alone.

**Observable behaviours**

- Phobos and Bennu draw from their shape models; Curiosity, Voyager 1, Hubble and the
  Søndermarken scene draw their meshes; the probe spheres draw when their Layer is on.
- Flying toward a craft loads its mesh at the same distance as before; flying away releases it.
- A planet's texture still loads ahead of a nearby craft's mesh.

**Deferral boundary**

- Everything in spec §7 (PR D). Core is expected to load with an empty body registry after this
  PR; proving it with a test is PR D's.
