# Body Layers: the missions craft

**Spec:** [`specs/2026-10-20-body-layers-design.md`](../specs/2026-10-20-body-layers-design.md) §3 (the
`missions` row), §4, §5 rulings 2, 3, 5, 7, 8, §6 P1 (the `orbit`/`sampled` position variants) and P2
(missions' own glint-renderer instance), the Growth table, §7 step 3, §8.

**Strategy.** Two PRs. PR 1 moves the nine craft rows into `src/layers/missions/bodies/`, folds them into
the static tables through two new `BodyPosition` variants, and has missions draw them through the one
core mesh handle with its own mesh, contact-shadow and glint passes. Core's partition roster narrows to
what core still draws; NEAR0's sphere range and the probe scheduler keep the whole body-slab roster.
Composition order (`missions` before `earthScenes`) keeps every table's row order, so pick indexes and
draw order are unchanged. The Voyager cross-read is settled: a Voyager row is the one source of its
launch instant, for both `presentFromIso` and its sampled position; missions reads its own rows, core
reads only the fold. PR 2 moves the craft's identity: the `craft` selection kind and detail card, the
pick code, ruling 8's captions, and palette search.

**Contract widenings:** only `BodyPosition`'s `orbit` and `sampled` variants, which the spec consents to.
`ContentPass`, `PassState`, `LayerCoreDeps`, `LayerBody` and `LayerSearchEntry` stay as they are. Any
other member change is a STOP: report it, don't add it.

**Rulings (user, 2026-10-20, ask WGDt):** S1 — mesh slots stay with the core handle (revises spec §3 and
the Growth row). Two PRs. R1 — craft get their own `craft` selection kind now. R2 — `Source.MeshBody`
(32) is renamed `Source.Craft`, same value. R3 — missions gets a `search` member. R4 — craft captions
keep a Labels & Guides toggle: one missions label item, "Spacecraft", mutes every craft caption.

**Execution:** lean SDD, one plan in flight; PR 2 starts after PR 1 merges.

- PR 1: Dispatch A (Sonnet) = Tasks 1–2, data only. Dispatch B (Opus) = Tasks 3–4, frame and roster
  model; Task 4 is `review: yes`. Controller does Task 5 inline.
- PR 2: Dispatch C (Opus) = Tasks 6–7 in one commit, `review: yes`. Dispatch D (Sonnet) = Task 8.

**Perf estimate and ruling.** Worst pose `#focus=body-curiosity` (the Mars `body-m` row carries four
rovers plus Phobos and Deimos, the probe is due, Hubble/whale/Voyagers sub-pixel). CPU: about 4 more
`sceneBodyPresentation` walks per frame (linear over ~100 bodies, ~5 µs each) from `mission-meshes` and
`mission-glints`; Phobos/Deimos skip `contact-shadows`' partition. Net under 0.03 ms. GPU: same meshes,
decals and render passes; at most one extra instanced draw (≤9 glints, 252 B `writeBuffer`), under
0.01 ms. **Ruling: no perf gate.**

**Planning findings the tasks build on:**

- **S1 — mesh slots stay core.** A mesh slot's `commit`/`onRelease` write the core handle
  (`meshSlotRegistry.ts:26,30`); `LayerCoreDeps` has no GPU handle; a Layer asset factory reading
  `SlotDeps.state` would hand a Layer the whole `EngineState` (`createLayers.ts:229`). The keyed family
  is built over `MESH_PRESENTATIONS`, which already folds every Layer's rows, so adding a craft is still
  one row in its Layer.
- **Presence gating stays core.** `spacecraftPresent` is the one presence filter read by
  `frameContext.ts:66-68` (slab rows, partitions, glints, picks) and mesh-slot demand
  (`assetWiring.ts:121`). The `presentFromIso` values move with the rows; the util stays.
- **The roster splits.** `near0SphereBodies` (`deriveView.ts:128`) and the probe scheduler
  (`scheduleProbeCapture.ts:41`) need every body drawn on a body slab, whichever Layer draws it:
  `bodySlabRosterIds` (everything) vs `coreSceneBodyIds` (what core draws).
- **Interim `CORE_MESH_BODY_IDS`.** While `earthScenes` is bodies-only, core still draws (and glints)
  Søndermarken, so core's roster needs a data-level set naming earthScenes' rows, marked
  `delete when earthScenes draws its own rows`.
- **`contactDecal`** exists only on `perseverance`, `curiosity` and `mer`, so the contact-shadows pass
  moves to missions whole.
- **Craft glints stay unpicked**, as today (`bodyGlintsPass.ts:345`); backlog "Sub-pixel mesh bodies
  can't be picked".
- **`ORBITAL_ELEMENTS` order.** Whale, petunias and Hubble move from before the S-stars to after them.
  Every reader keys by id, filters by id or topologically sorts (`FOCUS_ORDER`); the J2000 fixture pin in
  `deriveBodyStates.test` guards it.
- **Partition rosters need no presence filtering:** `ctx.snapshot.sceneBodies` holds only present mesh
  bodies (`frameContext.ts:131-138`), so a static id set is exact.
- The probe test (`scheduleProbeCapture.test.ts:40-43`) uses craft fixtures: the existing guard against
  the probe losing craft.
- **Website and conventions:** `packages/website/src/data/docsSettings.ts` (tested by
  `tests/packages/website/docsReference.test.ts`) tracks every toggle/label row; main's
  `tests/conventions/layerStateShape.test.ts` requires `state/<cluster>/selectors.ts` per cluster.

---

## PR 1: the craft's rows and drawing

### Task 1: `BodyPosition` gains `orbit` and `sampled`; the fold projects them

**Files:**

- `src/@types/engine/layer/BodyPosition.d.ts`
- `src/data/bodies/orbitalElements.ts` (`:884`, append after `S_STAR_ORBITAL_ELEMENTS`)
- `src/data/bodies/surfaceFixedSites.ts:66` (project `site` only)
- `src/data/missions/spacecraftBodies.ts` → `src/data/bodies/sampledBodies.ts` and
  `src/data/missions/sampledBodyIds.ts` → `src/data/bodies/sampledBodyIds.ts`, via
  `npm run move-files -- <from> <to>` (rewrites the 13 and 9 importers). Afterwards grep the old
  `data/missions/` paths across `src tests tools packages docs .claude` for string-literal paths.
- `src/layers/README.md` (the `bodies?` row wording)

**Contract:**

```ts
// BodyPosition.d.ts: one variant per position table a moved row lands in
export type BodyPosition =
  | { readonly kind: 'site'; readonly site: SurfaceFixedSite }
  | { readonly kind: 'orbit'; readonly elements: OrbitalElements } // into ORBITAL_ELEMENTS
  | { readonly kind: 'sampled'; readonly sampled: SampledBody }; // into SAMPLED_BODIES
```

- `ORBITAL_ELEMENTS` = core's rows, then `...S_STAR_ORBITAL_ELEMENTS`, then the fold's `orbit` elements.
- `SAMPLED_BODIES` = its two core rows (until Task 2), then the fold's `sampled` rows.
- `SURFACE_FIXED_SITES` appends only `site` positions.
- README `bodies?` row: "One body row per file, + the rows array. Leaf data: imports types, `src/data`
  constants and makers, and pure utils; never a body table, `layer.ts` or a pass.
  `data/bodies/layerBodyRows.ts` folds them by import."

**Test:** none; a type and projection change with no writer yet. The `deriveBodyStates` and
`positionDrivers` suites cover it.

**Done:** tsc clean; the grep for the old `data/missions/` paths returns nothing.

- [x] Task 1

### Task 2: the nine craft rows move into `missions/bodies/`; the Voyager cross-read is settled

**Files:**

- Create in `src/layers/missions/bodies/`: `whale.ts`, `petunias.ts`, `voyager1.ts`, `voyager2.ts`,
  `hubble.ts`, `curiosity.ts`, `perseverance.ts`, `spirit.ts`, `opportunity.ts`, `missionsBodyRows.ts`.
- Create `src/data/missions/hitchhikerOrbit.ts` (from `orbitalElements.ts:44-51`),
  `src/data/missions/capeCanaveralLc41.ts` (from `sampledBodies.ts:12-13`),
  `src/utils/missions/launchIsoOf.ts` (the `launchIso` helper, `sampledBodies.ts:15-20`),
  `src/utils/meshBodies/meshGroundOffsetM.ts` (the `groundOffsetM` helper, `surfaceFixedSites.ts:13-20`).
- Modify: `src/data/bodies/layerBodyRows.ts`; `src/data/bodies/sceneMeshBodies.ts` (drop `:3`, `:8-9`,
  `:19-71`; header); `src/data/bodies/orbitalElements.ts` (drop `:44-51`, `:816-879`, unused imports);
  `src/data/bodies/surfaceFixedSites.ts` (drop `:9`, `:13-65`; header);
  `src/data/bodies/rotationElements.ts` (drop `:13`, `:245-285`); `src/data/bodies/sampledBodies.ts`
  (drop the core rows and helpers; header); `src/layers/missions/layer.ts` (`bodies:`, header);
  `src/layers/missions/present/produceMissionCaptions.ts`;
  `tests/data/bodies/rotationElements.meshBodies.test.ts:4`.

**Contract.** Each row file exports one `LayerBody`, today's rows moved verbatim with their comments:

| file              | export         | `body` seed (`meshBody(...)`)                       | `position`                                                                                         | `rotation`                    |
| ----------------- | -------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| `whale.ts`        | `WHALE`        | `sceneMeshBodies.ts:20-25`                          | `orbit`: `orbitalElements.ts:821-837`                                                              | `rotationElements.ts:250-256` |
| `petunias.ts`     | `PETUNIAS`     | `:26-31`                                            | `orbit`: `:838-856`                                                                                | `:257-263`                    |
| `voyager1.ts`     | `VOYAGER_1`    | `:37-43`, `presentFromIso: LAUNCH`                  | `sampled`: `{ id, trailColor: VOYAGER_1_LIME, launchIso: LAUNCH, launchPad: CAPE_CANAVERAL_LC41 }` | `:266`                        |
| `voyager2.ts`     | `VOYAGER_2`    | `:44-50`, likewise                                  | likewise, `VOYAGER_2_GREEN`                                                                        | `:267`                        |
| `hubble.ts`       | `HUBBLE`       | `:51`                                               | `orbit`: `:863-879`                                                                                | `:273-279`                    |
| `curiosity.ts`    | `CURIOSITY`    | `:52-57`                                            | `site`: `surfaceFixedSites.ts:25-32`, `altitudeM: meshGroundOffsetM('curiosity')`                  | `:282`                        |
| `perseverance.ts` | `PERSEVERANCE` | `:58-63`                                            | `site`: `:35-42`                                                                                   | `:283`                        |
| `spirit.ts`       | `SPIRIT`       | `:64`                                               | `site`: `:47-54` (`'mer'`)                                                                         | `:284`                        |
| `opportunity.ts`  | `OPPORTUNITY`  | `:65-70`                                            | `site`: `:58-65` (`'mer'`)                                                                         | `:285`                        |

- **The Voyager cross-read.** In each Voyager file, `const LAUNCH = launchIsoOf('<id>')` is the single
  source for both `presentFromIso` and `sampled.launchIso`.
- `MISSIONS_BODY_ROWS = [WHALE, PETUNIAS, VOYAGER_1, VOYAGER_2, HUBBLE, CURIOSITY, PERSEVERANCE, SPIRIT, OPPORTUNITY]`
  (today's `SCENE_MESH_BODIES` order).
- `LAYER_BODY_ROWS = [...MISSIONS_BODY_ROWS, ...EARTH_SCENES_BODY_ROWS]` (composition order).
- `hitchhikerOrbit.ts` exports `HITCHHIKER_ORBIT_SEMI_MAJOR_KM` (Earth datum + 400 km),
  `HITCHHIKER_ORBIT_PERIOD_DAYS` (renamed from the misleading `MESH_BODY_PERIOD_DAYS`) and
  `PETUNIA_TRAIL_OFFSET_DEG`, keeping the `:44-50` comment.
- `launchIsoOf(craftId: string): string` and `meshGroundOffsetM(meshKey: string): number` throw on a
  missing event/asset, as today.
- Rows import only types, `src/data` constants and makers, and these utils — never a body table that
  folds Layer rows (`ORBITAL_ELEMENTS`, `SCENE_MESH_BODIES`, `SURFACE_FIXED_SITES`, `ROTATION_ELEMENTS`,
  `SAMPLED_BODIES`, `positionDrivers`). `sceneEarth.ts` (imports only `bodyGlintMaxPx`) is allowed.
- `produceMissionCaptions`: `CRAFT` is the `MeshBody` of every `MISSIONS_BODY_ROWS` row whose
  `position.kind === 'sampled'`; it no longer reads `SCENE_MESH_BODIES`, `ANCHORED_MESH_BODY_IDS` or
  `SAMPLED_BODY_IDS`.
- `missions/layer.ts`: `bodies: MISSIONS_BODY_ROWS`; header says core still draws them until Task 4.

**Test:** none new; the existing suites guard the move: `deriveBodyStates.test.ts` (J2000 fixture pins
whale, petunias, Hubble to full f64), `deriveBodyStates.launch.test.ts` (Voyager on LC-41),
`surfaceFixedSites.test.ts`, `rotationElements.meshBodies.test.ts`, `orbitalElements.hubble.test.ts`,
`layerBodyRowsCoverage.test.ts`, `produceMissionCaptions.test.ts`.

**Done:**

- No craft id appears in `src/data/bodies/{sceneMeshBodies,orbitalElements,surfaceFixedSites,rotationElements,sampledBodies}.ts`.
- `SCENE_MESH_BODIES` ids read `whale, petunias, voyager1, voyager2, hubble, curiosity, perseverance, spirit, opportunity, soendermarken`;
  `SURFACE_FIXED_SITES` reads `curiosity, perseverance, spirit, opportunity, soendermarken`.

- [x] Task 2

### Task 3: the roster splits; mesh and glint drawing become shared helpers (behaviour-neutral)

**Files:**

- `src/services/engine/frame/coreSceneBodyIds.ts` → `bodySlabRosterIds.ts` via
  `npm run refactor -- rename src/services/engine/frame/coreSceneBodyIds.ts#coreSceneBodyIds bodySlabRosterIds`; header.
- `src/services/engine/frame/near0SphereBodies.ts` (header only)
- `src/services/engine/frame/drawableMeshBodies.ts`
- `src/services/engine/frame/drawMeshBodiesOnRow.ts` (create, from `meshBodiesPass.ts:41-93`)
- `src/services/engine/frame/drawMeshBodyPicksOnRow.ts` (create, from `meshBodiesPass.ts:105-135`)
- `src/services/engine/frame/scheduleProbeCapture.ts:22,41`
- `src/services/engine/frame/passes/meshBodiesPass.ts`, `contactShadowsPass.ts`, `bodyGlintsPass.ts`
- `src/utils/scene/bodyGlintBackdropFade.ts` (create, from `bodyGlintsPass.ts:103,137-142,184-187`)
- `src/utils/scene/packBodyGlints.ts` (create, from `bodyGlintsPass.ts:192-225`)
- `tests/services/engine/frame/frameFilePurity.test.ts` (`bodyGlintsPass` row: 3 → 2)
- `tests/services/engine/frame/near0SphereBodies.test.ts` (create)

**Contract:**

```ts
// renamed, body unchanged: every scene body drawn on a body-m row, whichever Layer draws it
export function bodySlabRosterIds(meshBodies: readonly MeshBody[]): ReadonlySet<string>;

// attached-to-host ∩ roster first (empty ⇒ [] with no partition), then that roster's partition `meshes`
export function drawableMeshBodies(
  state: PassState, ctx: FrameView, hostId: string, roster: ReadonlySet<string>,
): readonly MeshPresentation[];

export function drawMeshBodiesOnRow(
  pass: GPURenderPassEncoder, view: SlabView, ctx: FrameView, state: PassState,
  bodies: readonly MeshPresentation[],
): void;
// skips anchored sites as today; `pickIdOf` is `sceneBodyPickId` until PR 2
export function drawMeshBodyPicksOnRow(
  pass: GPURenderPassEncoder, view: SlabView, ctx: FrameView, state: PassState,
  bodies: readonly MeshPresentation[], pickIdOf: (bodyId: string) => number | null,
): void;

export function bodyGlintBackdropFade(camPosMpc: Readonly<Vec3>, states: ReadonlyMap<string, BodyState>): number;
/** Packs each glint above GLINT_MIN_BRIGHTNESS into `staging`; returns the count. */
export function packBodyGlints(
  staging: Float32Array,
  glints: readonly (PlanetBody | MeshBody)[],
  input: { readonly states: ReadonlyMap<string, BodyState>; readonly camPosMpc: Readonly<Vec3>;
           readonly pxPerRad: number; readonly backdropFade: number },
): number;
```

- In `drawableMeshBodies` the partition is `sceneBodyPartition(state, ctx, roster, () => false)`; meshes
  never consult surface maps.
- `meshBodiesPass` and `contactShadowsPass` call the helpers with `bodySlabRosterIds(ctx.snapshot.meshBodies)` for now.
- `scheduleProbeCapture` reads `sceneBodyPartition(state, ctx, bodySlabRosterIds(ctx.snapshot.meshBodies), () => false).meshes`;
  header: probe candidates are every drawn mesh, whichever pass draws it.
- `bodyGlintsPass`'s `draw` and `drawPick` call the two glint utils; `drawPick`'s brightness recompute
  reads `bodyGlintBackdropFade` too.

**Test:** `near0SphereBodies drops every resolved mesh body, whichever Layer draws it` — `resolved` holds
a planet, `curiosity`, `soendermarken` and a seeded star; `meshBodies = SCENE_MESH_BODIES`; only the star
survives. **Bug caught:** Task 4 narrows the wrong roster and craft leak into NEAR0's sphere range,
pulling its near plane in. No other test reaches `near0SphereBodies`.

**Done:** the `bodyGlintsPass`, `scheduleProbeCapture` and `produceMissionCaptions` suites pass unchanged;
`grep -rn coreSceneBodyIds src` returns only `coreSceneBodyPartition.ts`'s comment.

- [ ] Task 3

### Task 4: missions draws its craft; core's roster narrows

review: yes

**Files:**

- Create: `src/data/bodies/coreMeshBodyIds.ts`, `src/services/engine/frame/coreSceneBodyIds.ts` (new:
  core's own roster), `src/layers/missions/present/missionCraftIds.ts`,
  `src/layers/missions/passes/missionMeshesPass.ts`, `src/layers/missions/passes/missionGlintsPass.ts`.
- Move: `npm run move-files -- src/services/engine/frame/passes/contactShadowsPass.ts src/layers/missions/passes/contactShadowsPass.ts`.
- Rename: `npm run refactor -- rename src/services/engine/frame/passes/meshBodiesPass.ts#meshBodiesPass coreMeshBodiesPass`;
  its name string becomes `'core-mesh-bodies'`.
- Modify: `src/services/engine/frame/coreSceneBodyPartition.ts`, `src/services/engine/frame/passes/index.ts`
  (drop `contactShadowsPass`), `src/data/rendering/frameSections.ts`,
  `src/layers/missions/{create,destroy,layer}.ts`, `src/layers/missions/@types/MissionsRuntime.d.ts`,
  `src/layers/missions/passes/missionTrailsPass.ts` (`runtime.renderer` → `runtime.trailRenderer`);
  comments only in `executeFrame.ts:260`, `renderTargets.ts:38`, the `bodyGlintsPass.ts` header.
- Tests: `tests/services/engine/frame/expandFrameOrder.test.ts:372`,
  `tests/services/engine/frame/coreSceneBodyIds.test.ts` (create).

**Contract:**

```ts
// coreMeshBodyIds.ts. Data may import a Layer's bodies/ (the layerBodyRows precedent).
/** The mesh bodies core still draws: earthScenes is bodies-only. delete when earthScenes draws its own rows */
export const CORE_MESH_BODY_IDS: ReadonlySet<string>; // EARTH_SCENES_BODY_ROWS' mesh-body ids

// coreSceneBodyIds.ts: SCENE_PLANETS ∪ (meshBodies ∩ CORE_MESH_BODY_IDS)
export function coreSceneBodyIds(meshBodies: readonly MeshBody[]): ReadonlySet<string>;

// missionCraftIds.ts
export const MISSION_CRAFT_IDS: ReadonlySet<string>; // MISSIONS_BODY_ROWS' mesh-body ids

export type MissionsRuntime = {
  readonly trailRenderer: MissionTrailRenderer;
  readonly glintRenderer: BodyGlintRenderer; // createBodyGlintRenderer(deps.ctx.device, HDR_TARGET_FORMAT), as blackHoles/create.ts:18
};
```

- `coreSceneBodyPartition` binds roster `coreSceneBodyIds(ctx.snapshot.meshBodies)`; `hasSurfaceMap` unchanged.
- `missionMeshesPass` (`'mission-meshes'`, no runtime, no `fade`): enabled when the row is `body-m` and
  `drawableMeshBodies(…, hostId, MISSION_CRAFT_IDS)` is non-empty; `draw`/`drawPick` call the Task 3
  helpers; `pickIdOf` is `sceneBodyPickId` in PR 1, so pick encodings are unchanged.
- `coreMeshBodiesPass` does the same with `coreSceneBodyIds(ctx.snapshot.meshBodies)`.
- `contactShadowsPass` keeps its name and gate order (`:25-31`), reading `MISSION_CRAFT_IDS`.
- `missionGlintsPass(runtime)` (`'mission-glints'`, no picking — craft glints stay unpicked): gates are
  the foreground distance gate, then `bodyGlintBackdropFade > 0`, then a non-empty
  `sceneBodyPartition(state, ctx, MISSION_CRAFT_IDS, () => false).glints`. `draw` packs into a staging
  buffer the factory allocates (`MISSION_CRAFT_IDS.size × INSTANCE_FLOATS`, the `blackHoleMarkerPass.ts:31`
  pattern, never module scope), then `runtime.glintRenderer.draw` with today's rebased vp
  (`bodyGlintsPass.ts:232-233`).
- `missions/layer.ts`: `passes: (runtime) => [missionTrailsPass(runtime), missionMeshesPass, contactShadowsPass, missionGlintsPass(runtime)]`;
  `destroy` also destroys `glintRenderer`.

`frameSections.ts` — core's pass stays last, so per-row draw order is unchanged (craft, then
Søndermarken, Phobos, Deimos):

```ts
passes: ['body-glints', 'mission-glints', 'black-hole-marker'],       // POST_LENSING (:211)
{ sampleDepth: ['contact-shadows', 'atmosphere-shell'] },            // unchanged (:258)
'mission-meshes',                                                     // replaces 'mesh-bodies' (:259)
'core-mesh-bodies',
```

Update the PRELUDE probe-roster comment (`:66-71`) to name both mesh passes and both glint passes.

**Tests** (`coreSceneBodyIds.test.ts`; stub `meshBodyRenderer.hasMesh` true for every id,
`texturedBodyRenderer: null`):

- `every resident mesh body on a host row is drawn by exactly one mesh pass` — for host `mars` with the
  camera at Curiosity and host `earth` with the camera at Hubble, `drawableMeshBodies` with
  `coreSceneBodyIds(SCENE_MESH_BODIES)` and with `MISSION_CRAFT_IDS` are disjoint and their union equals
  the call with `bodySlabRosterIds(SCENE_MESH_BODIES)`. **Bug caught:** `CORE_MESH_BODY_IDS` and
  `MISSION_CRAFT_IDS` drift, so a craft draws twice and z-fights, or Søndermarken/Phobos/Deimos vanish.
- `every sub-pixel scene body glints in exactly one glint pass` — camera 5 AU out: core's and missions'
  `.glints` are disjoint and their union is the whole-roster `.glints`. **Bug caught:** a craft glints at
  double brightness, or not at all.
- `expandFrameOrder.test.ts:372` expects `['mission-meshes', 'core-mesh-bodies']`.

**Done:** `grep -rn "'mesh-bodies'" src tests` returns nothing; `contactShadowsPass` exists only under
`src/layers/missions/passes/`; boot passes `concatUniqueRows` and `checkFrameOrder`; the DebugPanel render
toggles list `mission-meshes`, `core-mesh-bodies` and `mission-glints`.

- [ ] Task 4

### Task 5: docs

**Files:** `src/layers/README.md` (Status: missions draws its craft through core's mesh handle;
earthScenes still bodies-only); `docs/RENDERER.md:34` (core's `coreMeshBodiesPass` and each Layer's mesh
pass, through one handle); `.claude/skills/add-mission/SKILL.md` steps 7–9 (a new craft is one file in
`src/layers/missions/bodies/` plus one entry in `MISSIONS_BODY_ROWS`, with the same palette-tint and
`meshGroundOffsetM` rules).

**Test:** none.

- [ ] Task 5

---

## PR 2: the craft's identity

### Task 6: the `craft` selection kind and its pick code

review: yes

**Files:**

- Source registry: `src/data/source.ts` (`MeshBody: 32` → `Craft: 32`, doc rewritten),
  `src/data/sources/mesh-body.ts` (delete), `src/layers/missions/sources/{craft,missionsSourceRows}.ts`
  (create), `src/@types/data/craft/CraftSourceEntry.d.ts` (create), `src/@types/data/SourceEntry.d.ts`,
  `src/data/sources.ts`, `src/utils/math/galaxyType.ts:99`.
- Body identity: `src/data/bodies/bodyPickRows.ts` (drop `'mesh-body'`), `src/utils/scene/isRegistryBodyId.ts`,
  `src/utils/scene/isCoreBodyId.ts` (create), `src/services/engine/selection/bodySelectionRow.ts`.
- Selection kind types: `src/data/selection/selectionKinds.ts`,
  `src/@types/engine/{SelectionRef,FocusableTarget,SelectionRow}.d.ts`, `src/@types/engine/CraftInfo.d.ts` (create).
- Per-kind tables: `src/services/engine/helpers/{refOf,targetIdentityKey,buildFocusable,rowFocusable,selectionHaloTable}.ts`,
  `src/services/url/urlHashFor.ts`, `src/services/engine/camera/focusFraming.ts`,
  `src/utils/selection/mayHaveLabel.ts`, `src/state/settings/core/pickingSlice.ts`.
- Missions: `src/layers/missions/present/{craftPickId,craftSelectionRow}.ts` (create),
  `missionMeshesPass.ts` (`pickIdOf: craftPickId`), `layer.ts` (`sources`, `selection`, `ui.detailCard`).
- Cards: `BodyDetailCard.tsx`, `CompactBodyCard.tsx`, `BodyDetailCardContainer.tsx` (prop widened to
  `BodyInfo | CraftInfo`).
- Tests: `tests/support/allKindsEnabled.ts`, `tests/services/url/urlHashFor.test.ts`,
  `tests/layers/missions/present/craftSelectionRow.test.ts` (create).

**Contract:**

```ts
export type CraftInfo = Omit<BodyInfo, 'type'> & { readonly type: 'craft' };
// SelectionRef gains   | { readonly type: 'craft'; readonly id: string }
export function craftPickId(bodyId: string): number | null; // packSelection(Source.Craft, MISSIONS craft index + PICK_SENTINEL_OFFSET)
export function craftSelectionRow(): SelectionKindRow<Extract<SelectionRef, { type: 'craft' }>>;
export function isRegistryBodyId(id: string): boolean; // any non-star scene body (decodeFramedPose)
export function isCoreBodyId(id: string): boolean;     // earth, planets, CORE_MESH_BODY_IDS (the body kind's claim, palette rows)
```

- Craft row `type: 'craft'`, `bearsLabel: false`. `focusId.claims` is `body-<id>` for `id ∈ MISSION_CRAFT_IDS`
  (deep links keep `body-`, anti-goal 3); `extractRow` returns `bodyRowAt`'s fields with `type: 'craft'`.
- The body kind's `claims` narrows to `body-<id>` with `isCoreBodyId(id)`; the claims are disjoint by construction.
- Each per-kind table's `craft` row mirrors its `body` row: `urlHashFor` → `body-${id}`;
  `targetIdentityKey` → `body:${id}`; halo `nearFieldHalo`; framing `bodyLikeFraming`.
- Detail card `{ type: 'craft', Detail: BodyDetailCardContainer, Compact: CompactBodyCard }`, rendering
  exactly as before, "Body" eyebrow included.

**Tests:**

- `craftSelectionRow round-trips pick, ref and focus id for every craft` — `resolvePick(craftPickId(id))`
  is `{ type: 'craft', id }`; `decode(encode(ref))` is `ref`. **Bug caught:** the craft index and pick
  code fall out of step, so clicking Hubble selects the whale.
- `body-<id> is claimed by exactly one kind for every scene body` — `composeSelectionRows.resolveFocusId`
  never throws over all `SCENE_BODIES` ids. **Bug caught:** an overlapping claim throws on every craft deep link.

- [ ] Task 6

### Task 7: ruling 8, the craft captions under missions (one commit with Task 6)

**Files:** `src/layers/missions/visibility.ts`, `src/layers/missions/state/missions/initialState.ts`,
`src/@types/settings/MissionsSettings.d.ts`, `src/layers/missions/present/produceMissionCaptions.ts`;
`src/utils/labels/meshBodyCaption.ts` (takes a `pickId`); `src/services/engine/presentation/sceneBodyLabels.ts`
(delete the mesh branch `:102-109` and its imports); `src/services/engine/presentation/produceSceneBodyCaptions.ts`
(drop `meshBody` from `:18,28`); `packages/website/src/data/docsSettings.ts:516` ("Mesh bodies" becomes
"Spacecraft" on `missions.items.craft.labelEnabled`);
`.claude/skills/add-mission/SKILL.md` (Gotchas row `:217`); tests `produceMissionCaptions.test.ts`,
`produceSceneBodyCaptions.test.ts`, `sceneBodyLabels.test.ts`, `sceneBodyPartition.presence.test.ts`.

**Contract:** the missions label entry gains one item, `craft` (Labels & Guides row "Spacecraft", on by
default), that claims every id in `MISSION_CRAFT_IDS` — the R4 toggle, replacing body's "Mesh bodies"
item one-for-one; follow how a label item claims several ids today (`claimedLabelItemsOf.ts`) and add no
new mechanism (STOP if one seems needed). `produceMissionCaptions` captions every present craft, gated on
that item, and passes `craftPickId(id)` to `meshBodyCaption`; `emphasisDim` applies only to `sampled` craft.

**Tests:**

- `emphasising Voyager 1 dims Voyager 2's caption and leaves Hubble's at full alpha`. **Bug caught:**
  every non-emphasised craft dims during the Voyager exhibit.
- `each craft is captioned once, by missions` (retargets `produceMissionCaptions.test.ts:90`).

- `unchecking Spacecraft hides every craft caption and nothing else`. **Bug caught:** the item claims
  only the sampled craft (the old missions scope), so rover and Hubble captions ignore the toggle.

**Done:** Labels & Guides lists "Spacecraft" and no "Mesh bodies"; `docsReference.test.ts` passes;
`grep -rn "mesh-body" src packages/website/src` returns nothing.

- [ ] Task 7

### Task 8: palette search from missions

**Files:** `src/layers/missions/present/craftSearch.ts` (create: `CRAFT_SEARCH_NAMES` + the generator);
`src/layers/missions/layer.ts` (`search`); `src/data/bodies/bodySearchNames.ts` (drop `:13-23`);
`src/utils/palette/rankPaletteMatches.ts:74` (`isCoreBodyId`); `src/components/CommandPalette/paletteRows.tsx:246`
(the `layer` arm shows the card shot via `SHOT_CARD_IDS`); `packages/website/src/data/objectCatalogue.ts:183`
(craft aliases from `CRAFT_SEARCH_NAMES`); `.claude/skills/add-mission/SKILL.md` step 10; tests
`rankPaletteMatches.test.ts`, `CommandPalette.test.ts`.

**Contract:** each craft yields one row `{ id: 'body-<id>', class: 'primary', names: [label, ...aliases] }`,
once; core's body rows exclude craft.

**Test:** `a craft alias ranks exactly one palette row` — "HST" ranks one row for Hubble, "Oppy" one for
Opportunity. **Bug caught:** core's body row and missions' row both survive.

- [ ] Task 8

---

## Definition of Done

**Deliverables**

- **PR 1:** `BodyPosition`'s `orbit` and `sampled` variants; `src/layers/missions/bodies/` (9 rows +
  `MISSIONS_BODY_ROWS`) and `missions.bodies`; `hitchhikerOrbit.ts`, `capeCanaveralLc41.ts`, `launchIsoOf`,
  `meshGroundOffsetM`; `SAMPLED_BODIES`/`SAMPLED_BODY_IDS` under `data/bodies/`; `bodySlabRosterIds`, the
  narrowed `coreSceneBodyIds`, `CORE_MESH_BODY_IDS` (with its expiry marker), `MISSION_CRAFT_IDS`;
  `drawMeshBodiesOnRow`, `drawMeshBodyPicksOnRow`, `bodyGlintBackdropFade`, `packBodyGlints`; passes
  `mission-meshes`, `contact-shadows` (moved), `mission-glints`, core's `core-mesh-bodies`;
  `MissionsRuntime.{trailRenderer, glintRenderer}`; two new test files; README, RENDERER, add-mission updates.
- **PR 2:** the `craft` selection kind, `CraftInfo`, `Source.Craft` (code 32) and the missions source row;
  `craftPickId`, `isCoreBodyId`; missions `selection`, `ui.detailCard`, `search`; the "Spacecraft" label
  item replacing "Mesh bodies" in the app and the website settings reference.

**Observable behaviour (smoke).** PR 1 must look identical to main.

- `#focus=body-curiosity`: the rover sits on Gale's floor with its contact shadow and is probe-lit within
  about a second; Phobos and Deimos still draw. Same for `#focus=body-perseverance`, `#focus=body-spirit`,
  `#focus=body-opportunity`.
- `#focus=body-hubble`: Hubble over Earth with probe lighting and its caption ("Mesh bodies" still mutes it in PR 1).
- `#focus=body-whale`, `#focus=body-petunias`: the whale's nose points along the track; the pot sits 40 m behind.
- `#focus=body-voyager1&t=1979-03-05T12:00:00Z`: Voyager 1 at Jupiter; with Mission trails on, the trail welds to the mesh.
- `#focus=body-voyager1&t=1977-09-05T13:30:00Z`: rising from LC-41.
- `#focus=body-voyager1&t=1970-01-01T00:00:00Z`: no Voyager mesh, glint or caption.
- `#focus=body-soendermarken`: the park on terrain, uncaptioned and unpicked, still drawn by core.
- `#focus=body-mars`, zoom out: the rovers cross-fade into glints between 3 and 1 px, then dissolve with
  the solar-system backdrop; no craft glint doubles.
- Clicking the Hubble mesh selects Hubble with the same InfoCard.
- PR 2 adds: a "Spacecraft" row in place of "Mesh bodies" that mutes every craft caption; craft captions
  on by default, and a caption click selects the craft; palette
  "HST", "Oppy" and "oh no not again" each give one row with its shot; `#focus=body-soendermarken` still
  lands; a `#pose=b,voyager1,…` link reopens at Voyager; in the Voyager exhibit, emphasising Voyager 1 dims
  only Voyager 2's caption; unchecking `craft` in the DebugPanel's picking kinds makes craft unclickable.

**Out of scope:** mesh slots moving into Layers (S1); earthScenes' mesh pass, slot and Søndermarken's
glint (the next PR, which deletes `CORE_MESH_BODY_IDS`' drawing role); the body PR and P5; picking
sub-pixel craft; absent-craft focus and selection (backlog); moving `spacecraftPresent` out of core;
starCatalog's seeded stars (§7 step 5).
