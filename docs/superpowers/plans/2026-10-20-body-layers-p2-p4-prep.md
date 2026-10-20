# Body Layers prep: partition roster, grouped trail rows, terrain seam (P2–P4)

**Spec:** [`specs/2026-10-20-body-layers-design.md`](../specs/2026-10-20-body-layers-design.md) §6 P2,
P3 and P4, §5 rulings 4 and 6, §7 step 2.

**Shape:** one PR, three commits: P2 (Task 1), P3 (Tasks 2–4), P4 (Tasks 5–6). Behaviour-neutral
except one approved user-visible change: the S-star trails get their own toggle.

**Execution:** lean SDD. Dispatch A = Task 1, B = Tasks 2–4, C = Tasks 5–6, in sequence (B and C
both edit `createLayers.ts`, `LayerInstance.d.ts` and `instantiateLayer.ts`). No perf gate: P3 adds
two fade resolutions per frame, at most, and nothing else runs per frame that did not before.

**Contract widenings in this plan:** only the two the spec consented to. `LayerGuides.orbitTrails`
becomes a group, and `Layer.terrain?` is added. `ContentPass`, `PassState`'s shape beyond the
renamed field, and `LayerCoreDeps` stay as they are. Any other member change is a STOP: report, don't
add it.

**Planning findings the tasks build on:**

- **No pass-level fade for trails.** `gatePassByFade` resolves one address, `pass.fade`
  (`gatePassByFade.ts:21-24`). Keeping `fade: 'orbitTrails'` would hide the S-star trails whenever
  Orbit trails is off, and a list of addresses on `ContentPass.fade` would widen the contract. So the
  pass drops `fade:`, its own `enabled` does the all-zero check, and core binds one fade resolver per
  group at composition, because `PassState` has no `visibilityEntries` (`PassState.d.ts:12-23`).
- **Field rename.** `EngineState.orbitTrailRows` holds groups after Task 3, so it is renamed
  `orbitTrailGroups` in the same commit (14 references, all in files Tasks 3–4 already edit).
- **A fifth terrain reader.** `terrainPickMarkerPass.ts:73` reads terrain height. It is a body pass, so
  it stays on the tile subsystem (through `surfaceTileTerrain`) and moves with it in the body PR.
- **Interim terrain provider.** Core's surface-tile provider holds the only slot in this PR, so any
  Layer that declares `terrain` throws at boot. That is how the body PR's half-finished move gets caught.

---

## Commit 1: P2, the partition takes a roster

### Task 1: `sceneBodyPartition` takes a roster and a surface-map check; core binds both

**Files:**

- `src/services/engine/frame/sceneBodyPartition.ts` (modify)
- `src/services/engine/frame/coreSceneBodyPartition.ts` (create)
- `src/@types/engine/frame/SceneBodyPartition.d.ts` (create)
- `src/services/engine/frame/coreSceneBodyIds.ts` (header comment only)
- `src/services/engine/frame/drawableMeshBodies.ts:13,23`
- `src/services/engine/frame/scheduleProbeCapture.ts:22,41`
- `src/services/engine/frame/passes/texturedBodiesPass.ts:63,103,110`
- `src/services/engine/frame/passes/planetsPass.ts:51,74,87,95,139`
- `src/services/engine/frame/passes/bodyGlintsPass.ts:77,143,157,165,290`, plus the comment at `:241`
- `tests/services/engine/frame/sceneBodyPartition.presence.test.ts:81,181`

**Contract:**

```ts
// src/@types/engine/frame/SceneBodyPartition.d.ts — the four buckets, lifted unchanged from sceneBodyPartition.ts:27-32
export type SceneBodyPartition = {
  readonly glints: readonly (PlanetBody | MeshBody)[];
  readonly flat: readonly PlanetBody[];
  readonly textured: readonly PlanetBody[];
  readonly meshes: readonly MeshPresentation[];
};

export function sceneBodyPartition(
  state: PassState,
  ctx: FrameView,
  roster: ReadonlySet<string>,
  hasSurfaceMap: (bodyId: string) => boolean,
): SceneBodyPartition;

// core's binding: roster = coreSceneBodyIds(ctx.snapshot.meshBodies); hasSurfaceMap = the registry guard plus texturedBodyRenderer residency
export function coreSceneBodyPartition(state: PassState, ctx: FrameView): SceneBodyPartition;
```

**What changes:**

- **Roster.** `roster` replaces `coreSceneBodyIds(...)` at `sceneBodyPartition.ts:33`.
- **Surface-map check.** `hasSurfaceMap(body.id)` replaces the whole condition at `:50-51`, and the
  `bodyTextureSpec` registry guard moves with it into the core binding: the `BodyTextureId` cast
  needs that guard, and the registry moves into `body` together with the renderer.
- **What the partition no longer touches.** Its imports of `coreSceneBodyIds`, `bodyTextureSpec` and
  `BodyTextureId`, and its read of `state.gpu.texturedBodyRenderer`.
- **Unchanged.** The `meshBodyRenderer.hasMesh` read at `:45`.
- **Header comments.** Rewrite `:1-9` to say "the roster's bodies" instead of "core's own". In
  `coreSceneBodyIds.ts:4`, "`sceneBodyPartition` keeps these" becomes "`coreSceneBodyPartition`".
- **Callers.** All 11 call sites switch to `coreSceneBodyPartition(state, ctx)`, a name change only.

**Test:** none new; a behaviour-neutral signature change.

- Retarget the presence test (`:81`) and the routing helper `partition()` (`:181`) to
  `coreSceneBodyPartition`, keeping their state stubs. Calling bare `sceneBodyPartition` with a
  residency check would make the "titan, not in the registry" case textured and silently change what
  the routing suite pins, because the registry guard now lives in the core binding.

**Done:**

- `grep -n "texturedBodyRenderer\|bodyTextureSpec\|coreSceneBodyIds" src/services/engine/frame/sceneBodyPartition.ts`
  returns nothing.
- The routing suite passes unchanged apart from the import.

- [x] Task 1

---

## Commit 2: P3, trail rows grouped with a show key

### Task 2: the S-star trails show key on starCatalog

review: yes

**Files:**

- `src/@types/settings/SStarTrailsSettings.d.ts` (create)
- `src/layers/starCatalog/state/sStarTrails/slice.ts` (create)
- `src/layers/starCatalog/state/sStarTrails/initialState.ts` (create)
- `src/layers/starCatalog/state/sStarTrails/selectors.ts` (create)
- `src/layers/starCatalog/state/slices.ts`
- `src/layers/starCatalog/visibility.ts`
- `src/layers/starCatalog/layer.ts` (the `ui` array)
- `src/layers/body/state/orbitTrails/slice.ts:1-5` (comment: it no longer governs the S-stars)
- `src/@types/settings/OrbitTrailsSettings.d.ts` (comment)
- `tests/state/settings/makeSettingsFixture.ts:124-126`, plus any settings literal tsc flags
  (`tests/layers/starCatalog/passes/starPointsPass.test.ts:280`,
  `tests/services/engine/phases/wireSlots.test.ts:338`)

**Template.** Copy the `missionTrails` cluster end to end:
`src/layers/missions/state/missionTrails/{slice,initialState,selectors}.ts`,
`src/@types/settings/MissionTrailsSettings.d.ts`, `missions/state/slices.ts`,
`missions/visibility.ts:7`, `missions/layer.ts:36`.

**Values:**

- Show entry: `{ key: 'sStarTrails' }`. No `cluster:`; the cluster defaults to the key
  (`visibilityClusterOf.ts:7`).
- Settings type: `SStarTrailsSettings = { enabled: boolean }`.
- `initialState`: `{ enabled: true }`. Today the S-star trails show by default under
  `orbitTrails.enabled: true` (`body/state/orbitTrails/initialState.ts:12-14`).
- Slice: `name: 'settings/sStarTrails'`, `reducerPath: 'sStarTrails'`, `reducers: {}`;
  `setVisibility` writes the switch.
- Slices tuple: `starCatalogLayerSettings = [starCatalogsSlice, sStarTrailsSlice] as const`.
- Toggle row, appended to starCatalog's `ui`:
  `{ slot: 'labelsAndGuides', content: { toggle: 'sStarTrails', label: 'S-star trails' } }`.

**Nothing else needs registering:** `EngineSettingsState` derives from the slices
(`EngineSettingsState.d.ts:4`); `appSettingsSlices.ts:32` spreads starCatalog's tuple;
`SettingsSnapshot` captures every Layer cluster; `createLayers.ts:192` composes the entry and the
fades seed from it; `selectToggleRows` reads and writes through the entry. Settings are not persisted
(`state/persistedValues.ts` holds only the splash key), so there is no migration.

**Test:** none. This copies a generic mechanism the Orbit trails and Local Bubble container tests
already cover (`LabelsAndGuidesSectionContainer.test.ts:95,119`); "Orbit trails last" (`:119`) stays true.

**Done:** `INITIAL_SETTINGS.sStarTrails.enabled === true`; the Labels & Guides panel lists "S-star trails".

- [ ] Task 2

### Task 3: `LayerGuides.orbitTrails` becomes a group; composition binds each group's fade

**Files:**

- `src/@types/engine/layer/OrbitTrailGroup.d.ts` (create)
- `src/@types/engine/frame/GatedOrbitTrailGroup.d.ts` (create)
- `src/services/engine/layer/gateOrbitTrailGroup.ts` (create)
- `src/@types/engine/layer/LayerGuides.d.ts:12-16`
- `src/@types/engine/layer/LayerInstance.d.ts:23`
- `src/services/engine/layer/instantiateLayer.ts:33`
- `src/services/engine/phases/createLayers.ts:7,40,200-203`
- `src/@types/engine/state/EngineState.d.ts:125-127`, `src/@types/engine/frame/PassState.d.ts`,
  `src/services/engine/engine.ts` (the `orbitTrailRows` → `orbitTrailGroups` rename)
- `src/@types/engine/layer/Layer.d.ts:96-97` (doc)
- `src/layers/starCatalog/layer.ts:63`
- `tests/services/engine/phases/createLayers.composition.test.ts:108-164`

**Contract:**

```ts
// OrbitTrailGroup.d.ts
export type OrbitTrailGroup = {
  /** The show entry whose value fades this group's trails. */
  readonly show: ShowKey;
  readonly rows: readonly OrbitalElements[];
};
// GatedOrbitTrailGroup.d.ts
export type GatedOrbitTrailGroup = OrbitTrailGroup & {
  /** The group's show value (fade × clip), resolved by core on each call; 0 while hidden. */
  fade(snapshot: Pick<ReadyFrameContext, 'nowMs'>): number;
};
// LayerGuides
readonly orbitTrails?: OrbitTrailGroup;
// LayerInstance
readonly orbitTrails: readonly OrbitTrailGroup[];      // [] or [the Layer's group]
// EngineState (renamed from orbitTrailRows)
orbitTrailGroups: readonly GatedOrbitTrailGroup[];
// gateOrbitTrailGroup.ts
export function gateOrbitTrailGroup(
  group: OrbitTrailGroup,
  state: Pick<EngineState, 'subsystems' | 'visibilityEntries'>,
): GatedOrbitTrailGroup;
```

**Gate.** `fade` calls `resolveVisibilityOpacity(state, snapshot, group.show)`
(`resolveVisibilityOpacity.ts:13`). For an item-less key this is exactly the value `gatePassByFade`
hands the pass today (`resolveFadeValue.ts:16-17`). Bind `state` the way `gatePassByFade(pass, state)`
does at `createLayers.ts:153`, and read it on each call.

**Composition** at `createLayers.ts:200`: core's group `{ show: 'orbitTrails', rows: CORE_TRAIL_ELEMENTS }`
first, then each instance's groups in tuple order, each mapped through `gateOrbitTrailGroup`. Core's
group keeps the body Layer's key, which the pass declares today (`orbitTrailsPass.ts:35`). starCatalog
declares `{ show: 'sStarTrails', rows: S_STAR_ORBITAL_ELEMENTS }`.

**Test:** update "composes core's orbit-trail rows then every Layer's guides.orbitTrails, in tuple
order" (`:150`) to groups: `orbitTrailGroups[0].rows` is `CORE_TRAIL_ELEMENTS` by identity with
`show === 'orbitTrails'`, then each Layer's group with `rows` matching its declared array by identity
and `show` carried over. `orbitTrailLayer` (`:108`) declares a group.

**Done:** tsc clean across `PassState`'s `orbitTrailGroups`. The pass compiles only once Task 4
lands; Tasks 3 and 4 share one commit.

- [ ] Task 3

### Task 4: `orbitTrailsPass` applies one fade per group

**Files:**

- `src/services/engine/frame/passes/orbitTrailsPass.ts`
- `tests/services/engine/frame/passes/orbitTrailsPass.test.ts`

**Contract:**

- `ContentPass<'orbitTrails'>` becomes `ContentPass`.
- Delete `fade: 'orbitTrails'` (`:35`), so `gatePassByFade` passes it through untouched
  (`gatePassByFade.ts:22`). The file header says why, in one or two lines (see the planning findings).

**`enabled`:**

- Keep the null-handle and foreground checks first (`:38-39`); the tests call it with a null handle
  and a bare context.
- Then return `false` when every group's `fade(ctx.snapshot)` is 0 — the skip `isZero` gave before.
- The region cull (`:45-58`) is unchanged.

**`draw`:**

- Size `staging` to the total rows across all groups (`:69-72`).
- Loop over the groups, skipping any whose fade is 0. Within a group the per-row body (`:85-146`) is
  unchanged, except `alpha` multiplies by that group's fade instead of the handed `fade` (`:114`).
- `enabled` and `draw` both read `fade(ctx.snapshot)`, a pure function of the snapshot, so they agree.

**Tests:**

- Replace `multiplies the handed value into each per-orbit alpha` (`:491-500`) with
  `multiplies each group's own fade into that group's per-orbit alpha`: two groups, Mercury at fade
  0.5 and a second row at 0.25, both picked so their size alpha saturates at 1 (see `:492-495`);
  float 17 of each record is ≈0.5 and ≈0.25, told apart by colour floats 12–14. **Bug caught:** one
  group's fade applied to every row.
- Add `enabled stays on while any group's fade is above 0, and is off when all are 0`: groups at
  [0, 1] → `true`, [0, 0] → `false`, camera inside the foreground gate. **Bug caught:** `every`/`some`
  swapped, which hides the S-star trails whenever Orbit trails is off.
- Fixtures: `makeState` (`:262-278`) becomes
  `orbitTrailGroups: [{ show: 'orbitTrails', rows: CORE_TRAIL_ELEMENTS, fade: () => 1 }]`; the
  `orbitTrailRows: [el]` sites (`:607,:671,:712`) wrap the same way; drop the trailing fade argument
  at every `enabled`/`draw` call.

**Done:** `grep -n "fade: 'orbitTrails'" src` returns nothing; `frameFilePurity`'s `ALLOWED` row for
`orbitTrailsPass` stays at 1.

- [ ] Task 4

---

## Commit 3: P4, the terrain-height seam

### Task 5: the `LayerTerrain` contract, the fold, and core's interim provider

review: yes

**Files:**

- `src/@types/engine/layer/LayerTerrain.d.ts` (create)
- `src/@types/camera/TerrainSubCamera.d.ts` (create)
- `src/data/camera/flatTerrain.ts` (create)
- `src/utils/surfaceTiles/surfaceTileTerrain.ts` (create)
- `src/services/engine/layer/composeTerrain.ts` (create)
- `src/@types/engine/layer/Layer.d.ts` (runtime-bound section, after `planners` at `:111`)
- `src/@types/engine/layer/LayerInstance.d.ts`
- `src/services/engine/layer/instantiateLayer.ts:23-38`
- `src/services/engine/phases/createLayers.ts` (header, plus the fold after `:203`)
- `src/@types/engine/state/EngineState.d.ts`
- `src/services/engine/engine.ts:305` (initial value)
- `src/@types/scene/SurfaceTileDebugSnapshot.d.ts:49`
- `src/services/engine/helpers/logCameraState.ts:12,26`
- `src/layers/README.md` (table row)
- `tests/utils/surfaceTiles/surfaceTileTerrain.test.ts` (create)
- `tests/services/engine/phases/createLayers.composition.test.ts`

**Contract:**

```ts
// src/@types/camera/TerrainSubCamera.d.ts — lifted from SurfaceTileDebugSnapshot.d.ts:49
export type TerrainSubCamera = LonLatDeg & { readonly coveredMaxLevel: number | null };

// src/@types/engine/layer/LayerTerrain.d.ts
/** Everything core's camera reads from the ground, and nothing else. */
export type LayerTerrain = {
  readonly heightAt: TerrainHeightAtLookup;
  readonly residentHeightLevelAt: ResidentHeightLevelLookup;
  /** Where over the body the last planned tile frame's camera sat; null while disengaged. */
  subCamera(): TerrainSubCamera | null;
};

// Layer.d.ts, runtime-bound
/** The ground core's camera reads. At most one provider per composition — createLayers
 *  throws on two; with none, core reads FLAT_TERRAIN. */
terrain?(runtime: Runtime): LayerTerrain;

// LayerInstance:   readonly terrain?: LayerTerrain;
// EngineState:     terrain: LayerTerrain;     // FLAT_TERRAIN until createLayers folds it

export const FLAT_TERRAIN: LayerTerrain;       // heightAt = datumOnlyTerrainHeight; others → null
export function surfaceTileTerrain(subsystems: Pick<EngineSubsystemHandles, 'surfaceTiles'>): LayerTerrain;
export function composeTerrain(
  providers: readonly { readonly name: string; readonly terrain: LayerTerrain }[],
): LayerTerrain;                               // 0 → FLAT_TERRAIN, 1 → it, ≥2 → throws naming both
```

**Interim provider.**

- `createLayers` folds `[{ name: 'core:surfaceTiles', terrain: surfaceTileTerrain(state.subsystems) }, ...each instance's terrain]`
  into `state.terrain`.
- **Why core keeps the slot.** A body Layer can't provide `terrain` yet: its `create` has no route to
  `state.subsystems.surfaceTiles` without widening `LayerCoreDeps`. The body PR deletes the core row;
  while both exist, the "two providers" throw catches a half-finished move (the `concatUniqueRows`
  precedent, `createLayers.ts:144-147`).

**`surfaceTileTerrain` reads `subsystems.surfaceTiles` on every call, never captures it:** `wireSlots`
creates the subsystem after `createLayers` (`bootstrap.ts:20-21`, `wireSlots.ts:95`), and teardown
sets it to null (`engine.ts:436-437`).

**Miss rules, carried over unchanged:** `heightAt` returns `?? 0` (`terrainHeightAtOf.ts:6`);
`residentHeightLevelAt` returns `?? null` (`engine.ts:531-532`); `subCamera` returns
`surfaceTiles?.getDebugSnapshot().subCamera ?? null` (`makeReconcileEffects.ts:30`).

**Other edits:** `SurfaceTileDebugSnapshot.subCamera` and `logCameraState`'s `earthSubCamera`
parameter switch to `TerrainSubCamera | null`. README row: `terrain?` | `terrain.ts` | "Runtime-bound:
the ground core's camera reads (`heightAt`, `residentHeightLevelAt`, `subCamera`). At most one Layer;
boot throws on two; none → flat."

**Tests:**

- `surfaceTileTerrain reads the subsystem installed after it was built`: build the provider over
  `{ surfaceTiles: null }` → `0 / null / null`; assign a stub subsystem to the same object
  (`terrainHeightAt → 1234`, `residentHeightLevelAt → 15`,
  `getDebugSnapshot → { subCamera: { lonDeg: 12.5, latDeg: 55.7, coveredMaxLevel: 19 } }`); the same
  provider now returns `1234 / 15 / that subCamera`. **Bug caught:** a provider that captures the
  subsystem when built — the camera would sit on the datum forever and clip into terrain, and every
  other test stubs past it.
- `throws at boot when two Layers provide terrain` (`createLayers.composition.test.ts`): two Layers
  each declare `terrain: () => FLAT_TERRAIN`; `createLayers` rejects with a message matching
  `/terrain/`. The two-Layer form keeps the test valid after the body PR removes core's row.

**Done:** tsc clean; `state.terrain` is `FLAT_TERRAIN` before boot and core's provider after `createLayers`.

- [ ] Task 5

### Task 6: core readers switch to `state.terrain`; delete `terrainHeightAtOf`

review: yes

**Files:**

- `src/services/engine/engine.ts:36,530-532`
- `src/services/engine/frame/frameContext.ts:32,99`
- `src/services/engine/frame/runFrame.ts:41,133`
- `src/services/engine/helpers/liveWorldPose.ts:13,22`
- `src/services/engine/wiring/makeReconcileEffects.ts:30`
- `src/services/engine/frame/passes/terrainPickMarkerPass.ts:20,73`
- `src/utils/surfaceTiles/terrainHeightAtOf.ts` (delete)
- `tests/services/engine/wiring/makeReconcileEffects.test.ts:119-139`
- `tests/services/engine/helpers/liveWorldPose.test.ts:54`
- `tests/services/engine/frame/runFrame.test.ts:993`
- Any other state stub that now reaches a migrated reader (`DebugPanel.test.ts`,
  `liveRenderCamera.test.ts`, `buildDemandCtx.test.ts`, `earthPass.test.ts` stub `surfaceTiles`): add
  `terrain: FLAT_TERRAIN` only where it reaches a migrated reader.

**Contract:**

- `terrainHeightAt: state.terrain.heightAt` at `frameContext.ts:99`, `runFrame.ts:133`,
  `liveWorldPose.ts:22` and `engine.ts:530`.
- `residentHeightLevelAt: state.terrain.residentHeightLevelAt` at `engine.ts:531-532`.
- `state.terrain.subCamera()` at `makeReconcileEffects.ts:30`.
- Read `state.terrain.<member>` at call time, never cached in an engine-construction closure:
  `createLayers` reassigns it after the debug handle (`engine.ts:470+`) and the reconcile effects are built.
- **`terrainPickMarkerPass` is the exception.** `PassState` has no `terrain`, and this pass moves into
  `body` with the subsystem; it reads `surfaceTileTerrain(state.subsystems).heightAt`.
- **Untouched (they move in the body PR):** `engine.ts:503-504` (the DebugPanel's surface-tile
  snapshot) and `engine.ts:436-437` (teardown).

**Test:** no new test; every reader gets the same number from the same subsystem. Retarget `:119` to
"logCameraState forwards the terrain seam's sub-camera readout", stubbing
`state.terrain = { ...FLAT_TERRAIN, subCamera: () => ({ lonDeg: 12.53, latDeg: 55.67, coveredMaxLevel: 19 }) }`;
the assertion is unchanged.

**Done:** `grep -rn "terrainHeightAtOf" src tests` returns nothing;
`grep -rn "subsystems.surfaceTiles"` over `engine.ts`, `frameContext.ts`, `runFrame.ts`,
`liveWorldPose.ts` and `makeReconcileEffects.ts` returns only `engine.ts:436-437,503-504`.

- [ ] Task 6

---

## Definition of Done

**Deliverables**

- `sceneBodyPartition(state, ctx, roster, hasSurfaceMap)`, `coreSceneBodyPartition`, `SceneBodyPartition`.
- `OrbitTrailGroup`, `GatedOrbitTrailGroup`, `gateOrbitTrailGroup`; `LayerGuides.orbitTrails` as a
  group; `EngineState.orbitTrailGroups` holding gated groups.
- On starCatalog: the `sStarTrails` show entry, settings cluster (default on) and the Labels & Guides
  row "S-star trails".
- `Layer.terrain?`, `LayerTerrain`, `TerrainSubCamera`, `FLAT_TERRAIN`, `surfaceTileTerrain`,
  `composeTerrain`, `EngineState.terrain`, the README row; `terrainHeightAtOf` deleted.

**Observable behaviour (smoke)**

- **Solar system.** Planets textured or flat exactly as before, no z-fighting; distant bodies as
  glints; Phobos, Deimos and the craft meshes resolve, and a mesh body picks up its probe lighting.
- **Labels & Guides.** "S-star trails" appears, checked. "Orbit trails" stays last.
- **Independent trail toggles.** At Sgr A*, the S-star trails draw. Unchecking "S-star trails" fades
  only them; unchecking "Orbit trails" fades the planet and moon trails and leaves the S-star trails on.
- **Solar System exhibit.** Still forces Orbit trails on.
- **Terrain.** Over Søndermarken the camera rests on terrain, not the datum, and doesn't clip through;
  the terrain-pick-marker overlay lands on the ground; the DebugPanel camera section shows the
  resident height level at the eye; `logCameraState` prints the sub-camera lon/lat.

**Out of scope:** P5 (the inside-atmosphere slab row); moving the surface-tile subsystem, its
DebugPanel section, teardown and `terrainPickMarkerPass` into `body`; the body Layer providing
`terrain`; per-Layer partitions and a missions glint-renderer instance; S-star rows as starCatalog
`bodies/` rows and `ORBIT_REACH_BY_REGION` reading composed rows (§7 step 5).
