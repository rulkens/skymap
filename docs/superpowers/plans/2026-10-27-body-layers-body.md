# Body Layers: the body Layer draws, loads and names its own bodies

**Goal:** the `body` Layer owns Earth, the planets, the moons and the rings end to end — their identity
rows, passes, computes, renderers, texture slots, the surface-tile stream and planner, the terrain seam,
the atmosphere, its `body-m` slab rows, the `body` selection kind and card, palette rows, captions,
planet trails and the Solar System exhibit — and core keeps only what every body-bearing Layer shares
(spec §4, ruling 11). earthScenes gets its own selection kind and palette row on the way.

**Architecture:** the body Layer stops being settings-only. `create` mints the nine body renderers, the
40 body-texture slots plus the atlas slot, and the surface-tile stream; its passes, computes and the one
`surface-tiles` planner row close over that runtime. The Layer declares its Earth and planet slab rows
itself, each atmosphere body's row hosting the `insideAtmosphere` line through `SlabRow.hosts` (P5,
re-ruled). Its Earth, planet and moon rows live in `src/layers/body/bodies/` and fold into core's static
tables through P1's `layerBodyRows`. Core's frame graph, slab machinery, pick encoding, mesh handle,
orbit-trail pass, the static body tables (now projections of the fold) and every selection kind's type
literal stay. No visual change: the same passes draw in the same frame order.

**Tech stack:** TS, WebGPU, RTK; no shader edits (WGSL stays at `src/services/gpu/shaders/`, README rule).

**Spec:** [`specs/2026-10-20-body-layers-design.md`](../specs/2026-10-20-body-layers-design.md) §3 (the
`body` row), §4, §5 rulings 6, 9, 10, 11, 12, 13, §6 P1, P5 ("Re-ruled"), P6 ("Left for the body PR"),
P7, P8, the Growth table, §7 step 4, §8, §9. Built on [`completed/2026-10-22-body-layers-tile-planner-views.md`](completed/2026-10-22-body-layers-tile-planner-views.md)
(#940: `SurfaceTileStream` + pure `planSurfaceTiles`, `state.subsystems.surfaceTiles = { stream, plan }`).
Format precedents: [`missions-craft`](completed/2026-10-20-body-layers-missions-craft.md),
[`earthscenes`](completed/2026-10-21-body-layers-earthscenes.md).

Line citations are at `abed25a34`.

---

## O13 (ruled A, user 2026-10-27): hosts first in the fold, composition untouched

**O13 — The fold order once body's rows join it.** The draft's worry (O11: "Earth's elements would
land after the missions craft that orbit it") was traced table by table, at `abed25a34`:

- **Solver: safe in every order.** `FOCUS_ORDER = focusResolveOrder(SCENE_ANCHORS, ORBITAL_ELEMENTS)`
  (`deriveBodyStates.ts:39`) pulls each row's focus ahead of it (`focusResolveOrder.ts:28-49`, "ancestors
  pulled ahead"), so the whale resolves after Earth whatever the table order. Its emitted order only fills
  the states `Map`, and no reader iterates that map (every reader `.get`s).
- **Pick ids: unaffected.** `BODY_PICK_ROWS.planet = SCENE_PLANETS` (`bodyPickRows.ts:18`), and
  `SCENE_PLANETS` becomes the fold's `PlanetBody` arm; the craft are `MeshBody`, so no Layer order reaches
  a planet's index. Only the authored order inside `BODY_BODY_ROWS` does, and it is today's
  `scenePlanets.ts` order. `SCENE_BODIES` concatenates per arm (`sceneBodies.ts:23-30`): unaffected.
- **Order-free readers.** `ROTATION_ELEMENTS` (`rotationRowById`, find by id); `POSITION_DRIVERS` (`BY_ID`
  map; region membership `bodyRegions.ts:44-47` and `bodyFollowsSimClock` are set tests);
  `ORBIT_REACH_BY_REGION` (a max); `BARYCENTRIC_PAIRS` (by id). Trails come from `BODY_TRAIL_ELEMENTS`
  (body's own rows, Task 14) and blend additively with no depth (`orbitTrailRenderer.ts:109-112`), so
  their order is invisible. No test pins table order (`orbitalElements.test.ts` checks structure only).
- **Not the fold's order:** `deriveSlabs` ties, palette ties, caption registration and the Settings /
  DebugPanel / Labels & Guides order all follow the *composition* (`app.ts:34` missions, `:42` body),
  through Layer members (Task 1, O12), not `LAYER_BODY_ROWS`.
- **The one change in every option:** `ORBITAL_ELEMENTS` loses its hand-authored planet head, so the
  S-stars lead it, and its body rows follow `BODY_BODY_ROWS` (Earth, then `scenePlanets.ts` order: Pluto
  and Charon move, Earth leads). Invisible (the solver reorders); `[...fold, ...S_STAR_ORBITAL_ELEMENTS]`
  would keep the S-stars last at the cost of one more moved line.

So the fix is a choice of fold order and its stated rule, not a guard.

```ts
// before — layerBodyRows.ts header: "Append-only per Layer, in composition order"
export const LAYER_BODY_ROWS = [...MISSIONS_BODY_ROWS, ...EARTH_SCENES_BODY_ROWS];
// ORBITAL_ELEMENTS today: [mercury … charon (core), ...S-stars, whale, petunias, hubble]

// A — the fold lists hosts first; the composition is untouched
export const LAYER_BODY_ROWS = [...BODY_BODY_ROWS, ...MISSIONS_BODY_ROWS, ...EARTH_SCENES_BODY_ROWS];
// ORBITAL_ELEMENTS: [...S-stars, earth, mercury … nereid, whale, petunias, hubble]
// D (missions first): [...S-stars, whale, petunias, hubble, earth, mercury … nereid]

// B — A's fold, and the composition moves body ahead of missions so "composition order" stays the rule
layers: [galaxyCatalog, starCatalog, cosmicWebDensity, cosmicWebFilaments, flow, bodyLayer, missionsLayer, …, earthScenesLayer]
```

| Option | Cost | Visible change | Note |
| ------ | ---- | -------------- | ---- |
| **A** fold order hosts-first | 1 line + a 3-line header rule ("a host's Layer before the Layers whose rows hang off it") | none | precedent: `data/sources.ts:69-81` folds in its own order, not the composition's |
| B composition reorder | A + 2 lines in `app.ts` (array and `satisfies` tuple) | Labels & Guides: "Orbit trails" above "Mission trails"; PR 2's body debug sections above blackHoles' lensing section; body rows return ahead of the Sgr A* slab row; palette ties put body ahead of craft; body captions register before missions' | matches O7's exhibit order; needs one more eye-check (panel order) |
| C explicit sort key | a `LayerBody` rank field (contract change: STOP) or a fold-time `focusResolveOrder` pass (~5 lines + a test) | none | sorts for a reader that does not exist: the solver already sorts |
| D leave it (missions first) | 0 | none | works; the single source of truth lists Earth's dependants before Earth, and the header's rule names the composition the fold does not read |

**Recommend A.** Smallest artifact with a stated rule; it keeps the panel order the user sees. Choose B
if one order everywhere is worth the panel reorder. Task 10 below is written for A; B adds the
`app.ts` lines to it and drops Task 1's "the Sgr A* row moves ahead of Earth" note.

---

## Rulings (user, 2026-10-27)

**No Layer contract member is added or widened beyond the consented ones.** The plan uses
`SlabRow.source` → `hosts` and `LayerSearchEntry.chip` (both consented 2026-10-27), plus existing
members only: `slabs`, `passes`, `computes`, `assets`, `planners`, `terrain`, `facts`, `ui`, `selection`,
`search`, `guides`, `exhibits`, `sources`, `bodies`. `BodyPosition` needs no new variant: every body row
is an `orbit` row, the variant missions added (#936). O9 *narrows* `PassState`; O10 declines a widening.

- **O1 — three PRs:** render + P5 (Tasks 1–6), tiles + P7 (7–9), identity (10–15). PR 3 runs in
  parallel in its own worktree. Why not the spec's globe/atmosphere split: one slot commit writes both
  halves (`bodyTextureSlotRegistry.ts:39-41`), so renderers, slots and the passes that read them move in
  one commit.
- **O2 — A: the tile plan rides the runtime** (starCatalog precedent, `starCatalog/frame.ts:28-137`);
  probe faces have an empty plans store (`createFramePlannerResultStore.ts:34-37`).

  ```ts
  // spec P6:   surfaceTilesPass reads ctx.snapshot.plans.get(surfaceTilePlanner, view).cut  // throws on a probe face
  // this plan: surfaceTilesPass reads runtime.surfaceTiles.plan.cut                        // last planned frame, as today
  ```

- **O3 — one `hostBandOpen` rule, Mpc, per view;** the line keeps the name `'insideAtmosphere'`. Accepted:
  `smoothstep` saturates ≈2.4 cm below the edge at Earth (`fadeBand.ts:33-42`), for shell and aerial line
  at once.

  ```ts
  // before: atmosphereDrawList.ts:71         inside: isInsideAtmosphereShell(camLocal)   // |camLocal| < 1.005
  // after:  body's atmosphereDrawList        inside: hostBandOpen(atmosphereInsideBand(id), ctx, id)
  //         core's bodyRowSlabs (per line)   hostBandOpen(host.band, ctx, row.anchorId)
  ```

- **O4 — the LUT reconcile is the first line of body's `sky-view` compute** (not a planner row).
- **O5 — C: a craft's chip is its kind,** set missions-side per craft: curiosity, perseverance, spirit,
  opportunity `'Rover'`; voyager1, voyager2 `'Probe'`; hubble `'Space telescope'`; whale and petunias no
  chip (Task 11).
- **O6a — earthScenes publishes Søndermarken's palette row** through its own `search`, chip `'Earth'`.
- **O6b — earthScenes gets its own selection kind, `earthScene`,** the way missions got `craft` (#938);
  the `body` kind then claims only body's ids. Søndermarken stays unpicked and uncaptioned;
  `#focus=body-soendermarken` keeps working (Task 12).
- **O7 — Solar System lists fifth:** `[...CORE_EXHIBITS, ...bodyLayerExhibits, ...missionsLayerExhibits]`.
- **O8 — A:** the terrain-pick-marker section moves to body, which publishes its two numbers (Task 9).
- **O9 — delete the constant body store** (Task 5).
- **O10 — `near0SphereBodies` stays;** header rewritten without its expiry; backlog "a per-body slab
  declaration on `LayerBody`" (Task 6).
- **O11 — Earth, planet and moon rows move into `src/layers/body/bodies/` in PR 3** through P1's fold,
  with the ordering fix (O13, Task 10).
- **O12 — all four behaviour changes accepted:** palette body rows move to the last tie group on an equal
  score (`rankPaletteMatches.ts:155-163`); `body-<id>` deep links resolve after `createLayers` through the
  deferring saga (`resolveFocusRefDeferringSaga.ts:16-22`); NEAR0 caption draw order follows
  registration (`label2DDirector.ts:185-191`); the debug toggle `core-mesh-bodies` becomes `body-meshes`
  (a persisted toggle for it is dropped).
- **Perf — no gate** (estimate below).

---

## Global Constraints

- **No Layer contract change beyond this plan's.** Allowed: `SlabRow.source` → `hosts` (Task 1),
  `LayerSearchEntry.chip` (Task 11), and O9's `PassState.data` removal. A task that seems to need any
  other new or widened member of `Layer`, `LayerCoreDeps`, `LayerBody`, `BodyPosition`, `ContentPass`,
  `ContentCompute`, `FrameContentPlanner`, `PassState`, `ReadyFrameContext`, `SelectionKindRow` or a label
  row STOPs and reports. Core's per-kind tables gaining an `earthScene` row (Task 12) is the #938
  precedent, not a contract change.
- **What moves, by one rule.** A file moves into `src/layers/body/` iff, after this PR, every non-test
  importer of it (`src/`, `tools/`, `packages/`) is inside `src/layers/body/`. Otherwise it is shared and
  stays. Check with `grep -rln "<module>'" src tools packages`. Shaders never move (README).
- **Folders** (README table): `passes/` one pass per file; `computes/` one compute per file; `frame.ts`
  the planner; `render/` renderers, encoders, uniform packers; `load/` slots, fetchers, asset rows;
  `subsystems/surfaceTiles/` the stream and planning; `present/` slab rows, partitions, draw lists,
  selection, search, captions, trail rows; `bodies/` one body row per file plus the rows array (leaf
  data: never `layer.ts`, a pass, or a body table that folds Layer rows), `bodies/makers/` the row makers
  only body uses; `ui/` sections and selectors; `exhibits/`; `sources/`; `@types/` the Layer's own types
  (`BodyRuntime`, renderer types only body reads).
- Move or rename TS files only with `npm run move-files -- <from> <to>` or
  `npm run move-files -- --manifest <moves.json>` (`--dry` first); renames with `npm run refactor --
  rename <file>#<symbol> <newName>`. Never `git mv`. Afterwards grep the old path across
  `src tests tools packages docs .claude` (string literals, `vi.mock`, `?static`, `.wesl` `package::`,
  website `.astro`/`.mdx`, CSS `@import` are not rewritten). A `.module.css` beside a moved `.tsx` moves
  by hand with its import.
- **Pass and frame files export only their own symbol** — every task touching
  `src/services/engine/frame/` or `src/layers/body/passes/`. Ratchet:
  `tests/services/engine/frame/frameFilePurity.test.ts`; a moved pass's row re-keys to
  `layers/body/passes/<file>` and a row for a file no longer swept is deleted (rows are never checked
  for orphans).
- One symbol per file in `utils/` and `@types/`; filename = symbol; deep relative imports; `type`, never
  `interface`; types never inline in implementation files.
- Each task deletes what it empties from core in the same commit.
- Comments explain why, never what; module header ≤ 10 lines; comment lines ≤ half the code lines;
  rewrite every comment naming a deleted symbol (`CORE_COMPUTES`, `core-mesh-bodies`,
  `coreSelectionRows`, `CORE_TRAIL_ELEMENTS`, `engine.debug.surfaceTiles`, `isCoreBodyId`, …). Moved data
  rows keep their comments verbatim (JPL/Archinal transcriptions, landmines).
- Commits: one per task, the plan's voice, **no attribution trailer**. Stage by path, never `git add -A`.
  `npx prettier --write <files>`, never `npm run format`. Never rebase, force-push or merge.
- Verify with `npm run typecheck:fast` plus targeted tests; Tasks 1, 3, 8, 10, 12 and 13 also run
  `npx tsc --noEmit` (tsgo misses settings-type cycles); Task 10 also `npm run typecheck` (the tools and
  website projects import the body tables). CI is the gate.

## Review Focus

The failure modes CI would not see unless a test pins them:

1. **The shell and the aerial line disagree at the edge** — both draw (a doubled limb) or neither (a
   black sky). Pinned in Task 1 by `the shell and the aerial line agree on inside at every radius`.
2. **A body gets two slab rows, or the composition overflows the headroom** — a second Earth row draws
   Earth twice and `bodyRowSlabs`/`scheduleProbeCapture` take the first by `hostId`
   (`bodyRowSlabs.ts:30`, `scheduleProbeCapture.ts:84-86`); 33 body rows exceed today's
   `LAYER_SLAB_ROW_HEADROOM = 4` and throw at boot (`createLayers.ts:187-192`). Pinned in Task 1 by
   `the app composition's slab rows name each body once and fit the headroom`.
3. **A probe face draws surface tiles from a plan it cannot see** — capture faces get an empty plans
   store. Pinned in Task 8 by `a capture face draws surface tiles from the runtime's plan`.
4. **A moved body row loses its rotation** — 32 rotation rows are hand-moved into 33 row files (Nereid
   has none today), and a row
   without one falls back to `IDENTITY_MAT3` silently: the texture spins with the ecliptic frame and the
   prime meridian is wrong. Today only Earth, Saturn and Charon are pinned. Pinned in Task 10 by `every
   textured body keeps its rotation row`.
5. **A `body-<id>` deep link lands on no kind, or the home ref never resolves** — once `isBodyKindId`
   drops Søndermarken, the existing claim test still passes with no claimant (its `else` arm expects
   `null`), so `#focus=body-soendermarken` silently opens nothing; and the `body` kind composes after the
   home ref is seeded (`navigateSaga.ts:102-103`). Pinned in Task 12 by `every scene body's focus id is
   claimed by the kind that owns it` and in Task 13 by `the home ref and a body deep link resolve once the
   body kind composes`.

The aerial bake's guarded lookup stays pinned in Task 1 (`the aerial bake skips a hosting row whose body
has no inside entry`); it left this list because the band and the draw list's distance gate cannot
disagree at a reachable pose.

### Final review mandate

Spec fidelity and slop, one round. Plus: (a) `entanglement-radar` over the branch diff; (b) the
core-imports-no-body grep, run from the worktree root, returns only `src/compositions/*`,
`src/data/sources.ts` (the source fold), `src/data/bodies/layerBodyRows.ts` (the body fold) and the
pre-existing `EarthSectionContainer.tsx` (today's list is the first and last plus
`src/data/exhibits/solarSystem.ts`, which Task 14 moves):
`grep -rln "layers/body/" src --include='*.ts' --include='*.tsx' | grep -v "^src/layers/"`;
(c) no `state.gpu.` read of a deleted key (tsc), no `state.subsystems.surfaceTiles`, no
`assetSlots.bodyTextures`; (d) every deviation from the spec is one the Rulings list or O13 names.

---

## Perf estimate and ruling

Worst poses: Earth at street level over Copenhagen, tiles engaged, mono rig; the same under the dome rig
(5–6 views). Per-frame CPU added or moved:

| Change | Mono | Dome |
| ------ | ---- | ---- |
| `bodyRowSlabs` reads rows and bands: per view, per `body-m` slab (≤ ~6 at the surface) a linear row lookup over ≤ 40 candidates and ≤ 1 band check on a memoised `bodyPose`; replaces a memoised `atmosphereDrawList` hit | ~1–2 µs | ~10 µs |
| `frameContext`: 33 static body rows through `slabRowActive` (no `activeBand` → early return) instead of 33 `bodySlabRowOf` allocations per frame | ≤ 0 | ≤ 0 |
| Tile planning moves from `runFrame` into the plan phase: the same `planSurfaceTiles` + `apply`, plus one closure call and the fade gate wrapper | < 1 µs | < 1 µs |
| P7 publisher, panel closed: one `store.getState()` + selector | < 1 µs | < 1 µs |
| P7 publisher, panel open: one dispatch per 250 ms, snapshot scans ≤ 1,280 resident tiles (`surfaceTileStream.ts:343-344`) | ~0.01 ms amortised | same |
| Reconcile inside the `sky-view` compute: the same size compare | 0 | 0 |
| PR 3's rows move and new kind: static tables built once at module load (same rows, one more filter pass); no per-frame code | 0 | 0 |

Under 0.02 ms per frame at the worst pose, GPU unchanged (same passes, same order). **Ruling (user,
2026-10-27): no perf gate.**

---

## File structure (after all three PRs)

```
src/layers/body/
  layer.ts create.ts destroy.ts frame.ts visibility.ts
  @types/BodyRuntime.ts  BodyFacts.ts  <renderer types only body reads>
  bodies/   earth mercury venus mars jupiter saturn uranus neptune pluto moon phobos deimos io europa
            ganymede callisto mimas enceladus tethys dione rhea titan iapetus miranda ariel umbriel
            titania oberon puck triton nereid proteus charon (one LayerBody each) + bodyBodyRows
  bodies/makers/  heliocentricPlanet satelliteBody (their one reader moves here)
  passes/   earthPass surfaceTilesPass terrainPickMarkerPass cloudShellPass planetsPass
            texturedBodiesPass ringsPass bodyGlintsPass atmosphereShellPass aerialPerspectivePass
            bodyMeshesPass
  computes/ skyViewCompute aerialPerspectiveCompute
  render/   earth, surfaceTile(+Layout), terrainPickMarker, texturedBody, planet, ring, cloudShell,
            atmosphereShell, aerialPerspective renderers; encodeAtmosphere{SkyView,AerialPerspective};
            pack{EarthSurface,CloudShell,TexturedBody,Ring,Atmosphere}Uniforms
  load/     bodyTextureSlots bodyTextureAtlasSlot bodyAssetRows bodySurfaceTier (+ fetchers by the rule)
  subsystems/surfaceTiles/  surfaceTileStream planSurfaceTiles surfaceTileOverOf tileBodiesInView
            tileCamerasOf surfaceTileTerrain surfaceTileDebugSnapshotOf (+ body-only utils by the rule)
  present/  bodySlabRows bodyDrawRadiusM bodyDrawEnvelopes atmosphereInsideBand atmosphereDrawList
            atmosphereShellUniforms bodySceneBodyIds bodySceneBodyPartition prepareBodySurfaceFrame
            computeBodySurfaceFrame sceneBodyForId bodySelectionRow isBodyKindId bodySearch
            sceneBodyLabels produceSceneBodyCaptions bodyTrailElements
  sources/  earth planet bodySourceRows
  exhibits/ solarSystem exhibits
  ui/       SurfaceTileAtlasSection(+Container) TerrainPickMarkerTuningSection(+Container)
            selectSurfaceTileDebug
src/layers/earthScenes/present/  earthSceneSelectionRow earthSceneSearch            (new)
src/@types/engine/EarthSceneInfo.d.ts                                               (new)
src/utils/frame/hostBandOpen.ts               (new, core: the one host-band rule)
src/utils/scene/isEarthBody.ts isPlanetBody.ts (new, core: the fold's arm guards, the isMeshBody precedent)
src/data/rendering/layerSlabRowHeadroom.ts    (value grows; ceiling value unchanged)
```

Core keeps (shared): `bodyGlintRenderer` factory, `bodyPickRenderer`, `meshBodyRenderer`, orbit-trail
pass and renderer, cube-face blit, `sceneBodyPartition`, `glintsPassOver`, `bodySlabRosterIds`,
`near0SphereBodies`, `bodySlabRowOf` (hostless craft), `sceneBodyStates`, `sceneBodyPickId`,
`BODY_PICK_ROWS`, the static body tables as fold projections (`SCENE_EARTH`, `SCENE_PLANETS`,
`ORBITAL_ELEMENTS` = S-stars + fold, `ROTATION_ELEMENTS` = fold), the `satellite` maker and `palette`
(missions rows use them), `marsSurfaceParams` (tools), `MESH_ASSET_WIRING`, `createTileStreamSubsystem`,
`TextureAtlas`, tools-shared tile files (`surfaceTileParams`, `heightTileFormat`, `surfaceTileRegistry`,
`SurfaceTileBodyId`, the `utils/surfaceTiles/*` files `tools/` imports), `bodyRowChip`, the card
components (craft and earthScene read them too), and every per-kind selection table's `body` and
`earthScene` rows.

---

## PR 1: render, opening with P5

### Task 1: P5 — the body Layer declares its slab rows; a row names the lines it hosts

review: yes

**Files:**

- Contract: `src/@types/engine/frame/SlabRow.d.ts` (`source` → `hosts`; header: core derives rows only
  for hostless mesh bodies).
- Core: `src/services/engine/frame/bodyRowSlabs.ts` (drops `PassState` and `atmosphereDrawList`),
  `src/utils/frame/hostBandOpen.ts` (create), `src/services/engine/frame/frameContext.ts:63-84` (drops the
  `earth` and `planets` arms), `src/utils/scene/bodySlabRowOf.ts` (footprint radius, no `source`),
  `src/data/rendering/layerSlabRowHeadroom.ts`, `src/services/engine/frame/timing/slabRowCeiling.ts`,
  `src/utils/scene/meshBodySlabHostId.ts:8-11` (doc), callers of `bodyRowSlabs`: `renderFrame.ts:102`,
  `expandFrameOrder.ts:33,89`, `timing/maxFrameInputs.ts:36`, `encodeAtmosphereAerialPerspective.ts:25-31`
  (guarded lookup), `atmosphereDrawList.ts:71` (shared rule).
- blackHoles: `src/layers/blackHoles/present/blackHoleSlabRow.ts:21` (`hosts: [{ line: 'lens' }]`).
- Body: `src/layers/body/present/bodySlabRows.ts`, `atmosphereInsideBand.ts` (create);
  `src/utils/scene/bodyDrawRadiusM.ts` and `src/data/bodies/bodyDrawEnvelopes.ts` →
  `src/layers/body/present/` via `npm run move-files` (only reader after this task is `bodySlabRows`);
  `src/utils/camera/isInsideAtmosphereShell.ts` deleted (one reader), its `INSIDE_PATH_ENTER_RATIO`
  (1.005, `:15`) moves into `atmosphereInsideBand.ts` as a named export; `src/layers/body/layer.ts`
  (`slabs: BODY_SLAB_ROWS`).
- Tests: `tests/services/engine/frame/bodyRowSlabs.test.ts`, `encodeAtmosphereAerialPerspective.test.ts`,
  `atmosphereDrawList.test.ts`, fixture `source` drops in `slabRowActive.test.ts:24`,
  `bodySlabRowOf.test.ts:27`, `deriveView.test.ts:798`, `createLayers.composition.test.ts:104`;
  `frameContext.meshBodyHost.test.ts:56` gives its fixture the body rows;
  `tests/compositions/composedSlabRows.test.ts` (create, beside `sourceRegistryCoverage.test.ts`).

**Contract:**

```ts
// SlabRow.d.ts — replaces `source: 'foreground' | 'lens'` (never read as 'foreground': bodyRowSlabs.ts:22 is the one reader)
/** The extra frame lines this row hosts, each while this view's eye is inside its band; no band = always. */
readonly hosts?: readonly { readonly line: BodyRowSource; readonly band?: FadeBand }[];

// hostBandOpen.ts — the ONE host-band rule; Mpc, per view, off the pose the body passes draw with
export function hostBandOpen(band: FadeBand | undefined, ctx: FrameView, anchorId: PositionedId): boolean;
// band undefined → true; ctx.bodyPose(anchorId) null → false;
// else fadeBand(band, |pose.eyeRelBodyM| in Mpc via SCALE_UNITS) > 0

export function bodyRowSlabs(ctx: FrameView): Record<BodyRowSource, readonly number[]>;
// per line: the `body-m` slabs whose row (ctx.snapshot.slabBodyCandidates, by anchorId === frame.hostId)
// has a `hosts` entry for that line with hostBandOpen true. No PassState, no atmosphere code.

// atmosphereInsideBand.ts (body)
export const INSIDE_PATH_ENTER_RATIO = 1.005;
export function atmosphereInsideBand(bodyId: string): FadeBand | undefined;
// ATMOSPHERE_PARAMS[bodyId] undefined → undefined; else { fullAt: 0, goneAt: 1.005 · atmosphereTopM in Mpc }

// bodySlabRows.ts (body): Earth then SCENE_PLANETS order, one row each (33)
export const BODY_SLAB_ROWS: readonly SlabRow[];
// anchorId: body.id; drawRadiusM: () => bodyDrawRadiusM(body); footprintRadiusM: bodyFootprintRadiusM(body);
// hosts: [{ line: 'insideAtmosphere', band }] for the 9 ATMOSPHERE_PARAMS bodies, else absent
```

- `frameContext`: `slabBodyCandidates = [...state.slabRows filtered by slabRowActive, ...hostless mesh
  bodies → bodySlabRowOf]`. Earth, planets, hostless keep their relative order; the Sgr A* row moves
  ahead of Earth (8 kpc away: no `deriveSlabs` tie is possible).
- `bodySlabRowOf`: `drawRadiusM: () => bodyFootprintRadiusM(body)` (craft carry no atmosphere, envelope
  or ring row, so this is today's value, `bodyDrawRadiusM.test.ts:31`).
- `LAYER_SLAB_ROW_HEADROOM = 1 + SCENE_PLANETS.length + 4` ("Earth and every planet row the body Layer
  declares, the Sgr A* row, three spare"); `SLAB_ROW_CEILING = HOSTLESS_MESH_BODIES.length +
  LAYER_SLAB_ROW_HEADROOM` — the same value as today's `slabRowCeiling.ts:16-17`, so the GPU query set
  does not resize.
- `atmosphereDrawList`'s `inside` becomes `hostBandOpen(atmosphereInsideBand(body.id), ctx, body.id)`
  (O3). It stays in core until Task 2; this task's core → body import of `atmosphereInsideBand` is
  transient and gone by Task 3.
- The aerial bake looks its entry up by the hosting slab's `hostId` and returns without dispatch when
  that entry is missing or not `inside` (no `!`). The aerial pass keeps its own
  `atmosphereDrawList.some(e => e.body.id === hostId && e.inside)` guard
  (`aerialPerspectivePass.ts:15-21`), which carries the `FOREGROUND_MAX_DISTANCE_MPC` gate the band does
  not (spec P5's second edge, verified here).
- Spec P5's first edge (a static Earth row before Earth's record loads) needs no handling: see O9.

**Tests:**

- `the aerial line lands on the row whose band holds this view's eye` — Earth row, eye at 0.99 and 1.01 ×
  `goneAt`: `[earthIndex]` then `[]`. `lens rows host the lens line with no band` (adapted).
- `the shell and the aerial line agree on inside at every radius` — eye at {0.5, 1 − 1e-10, 1, 1 + 1e-10,
  2} × 1.005 × Earth's atmosphere top: `atmosphereDrawList(...).find(earth).inside` ⇔
  `bodyRowSlabs(ctx).insideAtmosphere` holds Earth's row. **Bug caught:** the two rules drift and the
  limb draws twice or the sky goes black at the shell edge.
- `the app composition's slab rows name each body once and fit the headroom` — over
  `APP_COMPOSITION.layers.flatMap(l => l.slabs ?? [])` plus `HOSTLESS_MESH_BODIES.map(bodySlabRowOf)`:
  `anchorId`s unique; the Layer rows' count ≤ `LAYER_SLAB_ROW_HEADROOM`. **Bug caught:** a core-derived
  Earth row beside the body's draws Earth twice; an overflow throws at boot.
- `the aerial bake skips a hosting row whose body has no inside entry` — line open, draw list empty
  (camera distance ≥ `FOREGROUND_MAX_DISTANCE_MPC`): no throw, no dispatch. **Bug caught:** the `!`
  throws mid-frame.

**Done:** `grep -rnE "source: '(lens|foreground)'|\.source ===" src tests` returns no slab-row hit;
`bodyRowSlabs` imports nothing from `atmosphereDrawList`; `grep -rn isInsideAtmosphereShell src tests`
is empty.

- [x] Task 1

### Task 2: the body render files move into the Layer tree (pure moves)

**Files** (one `npm run move-files -- --manifest <moves.json>`, `--dry` first; tests follow the mirror):

| From | To `src/layers/body/` |
| ---- | --------------------- |
| `src/services/engine/frame/passes/{earth,surfaceTiles,terrainPickMarker,cloudShell,planets,texturedBodies,rings,bodyGlints,atmosphereShell,aerialPerspective,coreMeshBodies}Pass.ts` | `passes/` |
| `src/services/engine/frame/computes/{skyView,aerialPerspective}Compute.ts` | `computes/` |
| `src/services/gpu/renderers/bodies/{earth,surfaceTile,texturedBody,planet,ring,cloudShell}Renderer.ts`, `surfaceTileLayout.ts`, `src/services/gpu/renderers/devTools/terrainPickMarkerRenderer.ts`, `src/services/gpu/renderers/atmosphere/{atmosphereShell,aerialPerspective}Renderer.ts`, `src/services/engine/frame/encodeAtmosphere{SkyView,AerialPerspective}.ts`, `src/utils/gpu/pack{EarthSurface,CloudShell,TexturedBody,Ring,Atmosphere}Uniforms.ts` | `render/` |
| `src/services/engine/frame/{prepareBodySurfaceFrame,computeBodySurfaceFrame,sceneBodyForId,coreSceneBodyPartition,atmosphereDrawList,atmosphereDrawListCache,atmosphereShellUniforms}.ts`, `src/data/bodies/coreSceneBodyIds.ts`, `src/utils/**/{cloudDeckFade,bodyCameraDistanceMpc,composeBodySlabCamRelVp,bodySlabCamAltitudeSq,glintBandClass}.ts` | `present/` |
| `src/data/bodies/{atmosphereParams,skyViewLutSizeByTier,limbDarkeningParams}.ts`, `src/data/atmosphere/froxelVolume.ts`, `src/services/engine/wiring/bodyTextureSlotRegistry.ts`, `src/services/loading/slots/bodyTextureAtlasSlot.ts` | `present/` (data) and `load/` (slots) |
| renderer and draw-entry types under `src/@types/rendering/**` and `src/@types/engine/frame/AtmosphereDrawEntry.d.ts` whose importers are all above | `@types/` |

Each row is checked against the Global Constraints' move rule before it goes in the manifest
(`surfaceTileSpecOf` and `isSurfaceTileBodyId` are tile files: PR 2). `bodyGlintRenderer.ts` stays (three
other Layers mint it). Core wiring (`gpuHandleRegistry.ts`, `passes/index.ts`, `computes/index.ts`,
`wireSlots.ts`, `assetWiring.ts`) imports the moved files at their new paths until Task 3.

**Contract:** behaviour-neutral; no symbol renamed.

**Tests:** none new; the moved suites pass unchanged.

**Done:** `npx tsc --noEmit` clean; the old-path grep returns nothing; `frameFilePurity.test.ts` rows
`frame/passes/{bodyGlints,cloudShell,planets,rings,texturedBodies}Pass` (`:54-60`) re-keyed to
`layers/body/passes/…`, `frame/prepareBodySurfaceFrame` (`:47`) deleted.

- [x] Task 2

### Task 3: the body runtime owns its renderers, texture slots, passes and computes

review: yes

**Files:**

- Body: `src/layers/body/{create,destroy,layer}.ts`, `@types/BodyRuntime.ts` (create); every moved pass
  and compute becomes a factory over the runtime; `load/bodyTextureSlotRegistry.ts` (moved in Task 2)
  becomes `load/bodyTextureSlots.ts` (`createBodyTextureSlots(renderers)`, via `npm run move-files` then
  `npm run refactor`); `load/bodyTextureAtlasSlot.ts` takes the renderers instead of `SlotDeps`;
  `load/bodyAssetRows.ts` (create, from `assetWiring.ts:44-96,132-146`); `present/bodySceneBodyPartition.ts`.
- Renames: `npm run refactor -- rename src/layers/body/passes/coreMeshBodiesPass.ts#coreMeshBodiesPass bodyMeshesPass`
  (file follows; name string `'body-meshes'`); `…present/coreSceneBodyIds.ts#CORE_SCENE_BODY_IDS BODY_SCENE_BODY_IDS`;
  `…present/coreSceneBodyPartition.ts#coreSceneBodyPartition bodySceneBodyPartition`.
- Core deletions: `gpuHandleRegistry.ts` rows `:181-195`, `:221-261`, `:275-299` (nine keys: planet,
  bodyGlint, earth, surfaceTile, terrainPickMarker, texturedBody, ring, cloudShell, atmosphereShell);
  their `EngineGpuHandles.d.ts` keys and `engine.ts:188-199` null-inits; 11 entries of
  `CONTENT_PASSES` (`passes/index.ts:38-50`); `computes/index.ts` (empties) and the `CORE_COMPUTES` arm
  of `createLayers.ts:157-160`; `runFrame.ts:47,89-91` (O4); `wireSlots.ts:88`;
  `EngineAssetSlots.d.ts:19-25,33-40` and `engine.ts:275,281`; `slotFor.ts:51-55`;
  `installLoadProgress.ts:40-46`; the body rows of `assetWiring.ts`.
- `src/data/rendering/frameSections.ts` (`core-mesh-bodies` → `body-meshes` at `:263`, comments `:67`,
  `:236-237`).
- Tests: `<key>: null` fixture rows (`grep -rnE "^\s+(earthRenderer|surfaceTileRenderer|terrainPickMarkerRenderer|texturedBodyRenderer|planetRenderer|ringRenderer|cloudShellRenderer|atmosphereShellRenderer|bodyGlintRenderer): null" tests`:
  `earthPass.test` 7, `initGpu.hdrCapabilityWiring.test` 7, `renderFrame.test` 3, `renderFrame.timing.test` 3,
  `visual/renderFrameSplitBaseline.test` 3, and one each in five more); `expandFrameOrder.test.ts`;
  the moved `bodyTextureSlotRegistry.test.ts`, `assetWiring.test.ts:81-130`.

**Contract:**

```ts
export type BodyRuntime = {
  readonly earth: EarthRenderer;
  readonly surfaceTile: SurfaceTileRenderer;
  readonly terrainPickMarker: TerrainPickMarkerRenderer;
  readonly texturedBody: TexturedBodyRenderer;
  readonly planet: PlanetRenderer;
  readonly ring: RingRenderer;
  readonly cloudShell: CloudShellRenderer;
  readonly atmosphere: AtmosphereShellRenderer; // owns the aerial renderer and the sky-view LUT
  readonly glint: BodyGlintRenderer;
  readonly textureSlots: ReadonlyMap<BodyTextureSlotKey, AssetSlot<ImageBitmap, BodyTextureReq>>; // 40
  readonly atlasSlot: AssetSlot<ImageBitmap, void>;
};
```

- `create(deps)` builds each renderer with today's arguments (`gpuHandleRegistry.ts` rows; only
  `deps.ctx.device` plus static imports — no constructor needs anything else), then the slots, whose
  commit/release fan-out (`bodyTextureSlotRegistry.ts:25-60`, atlas `:42-44`) writes the runtime's
  renderers. `destroy` releases in reverse; slots before the renderers they write (the localBubble
  precedent's posture: teardown stops the asset queue first, `engine.ts:414-415`).
- `layer.ts`: `passes: (r) => [earthPass(r), surfaceTilesPass(r), terrainPickMarkerPass(r),
  cloudShellPass(r), planetsPass(r), texturedBodiesPass(r), ringsPass(r), bodyGlintsPass(r),
  atmosphereShellPass(r), aerialPerspectivePass(r), bodyMeshesPass]`; `computes: (r) =>
  [skyViewCompute(r), aerialPerspectiveCompute(r)]`; `assets: (r) => bodyAssetRows(r)` (41 rows,
  `factory: () => r.textureSlots.get(key)!` / `r.atlasSlot`; the demand, release, request and priority
  of `assetWiring.ts:68-96,132-143` unchanged).
- Passes read the runtime for every body renderer and slot (`ringsPass.ts:95`, `cloudShellPass.ts:110`
  `.current()` checks); they keep reading `state.gpu.bodyPickRenderer` and `state.gpu.meshBodyRenderer`
  (core, the missions precedent) and, until PR 2, `state.subsystems.surfaceTiles`.
- `bodySceneBodyPartition(state, ctx, runtime)` = `sceneBodyPartition(state, ctx, BODY_SCENE_BODY_IDS,
  (id) => bodyTextureSpec(id) !== null && runtime.texturedBody.hasMap(id, 'surface'))`.
- `skyViewCompute(runtime)`: first statement `runtime.atmosphere.reconcile({ skyViewLutSize:
  SKY_VIEW_LUT_SIZE_BY_TIER[state.tier] })`, before any guard (O4).
- `bodySurfaceTier` (still called by core's `runFrame.ts:249` until PR 2) reads the committed tier
  through `slotFor(state, key)`, which already consults `state.layerSlots` first (`slotFor.ts:42-43`).
- `bodyMeshesPass` keeps `core-mesh-bodies`' frame position: per-row order stays craft, shape-model moons,
  Søndermarken.

**Tests:**

- `expandFrameOrder` pins `['mission-meshes', 'body-meshes', 'earth-scene-meshes']`.
- `the ring strip lands in the ring, textured-body and atmosphere renderers` — the moved slot test,
  against stub runtime renderers.
- The moved `coreSceneBodyIds.test.ts` (`every resident mesh body on a host row is drawn by exactly one
  mesh pass`) passes with `BODY_SCENE_BODY_IDS`.

**Done:** `npx tsc --noEmit` clean; `grep -rnE "gpu\??\.(earthRenderer|surfaceTileRenderer|terrainPickMarkerRenderer|texturedBodyRenderer|planetRenderer|ringRenderer|cloudShellRenderer|atmosphereShellRenderer|bodyGlintRenderer)\b|core-mesh-bodies|CORE_SCENE_BODY_IDS|CORE_COMPUTES|assetSlots\.bodyTextures" src tests` is empty;
boot passes `concatUniqueRows` and `checkFrameOrder`; the DebugPanel render toggles list `body-meshes`.

- [x] Task 3

### Task 4: core's emptied slot machinery goes; `ASSET_WIRING` becomes the mesh rows

**Files:** delete `src/services/engine/wiring/buildSlotsFromRegistry.ts` (39), `installSlots.ts` (47),
`src/utils/loading/isCoreSlotFieldKey.ts` (16), `isBodyTextureKey.ts` (29) and their tests; drop
`slotFor.ts:64-66`, `installLoadProgress.ts:56-72`, `wireSlots.ts:81-82` (and its stale header `:7,40`);
`assetWiring.ts` → `meshAssetWiring.ts` / `MESH_ASSET_WIRING` via `npm run move-files` + `npm run refactor`
(its importers, `createLayers.ts:47,173`); `tests/services/engine/phases/createLayers.composition.test.ts:252-254`
(collision key becomes a `mesh:` key), `engineSliceDispatches.test.ts:63`.

**Contract:** `EngineAssetSlots = { readonly meshBodies: Map<string, AssetSlot<MeshAsset, MeshReq>> }`.
`AssetKey` keeps the body keys (Layer keys stay listed in the central union, the precedent at
`AssetKey.d.ts:14-22`). Mesh slots stay core (ruling 10).

**Tests:** none new (deletions).

**Done:** `grep -rnE "buildSlotsFromRegistry|installSlots|isCoreSlotFieldKey|isBodyTextureKey|\bASSET_WIRING\b" src tests` is empty.

- [x] Task 4

### Task 5: the constant body store goes (O9)

**Files:** delete `src/@types/engine/data/{EngineData,BodyStore}.d.ts`, `src/services/engine/data/{createEngineData,createBodyStore}.ts`;
`EngineState.d.ts` and `PassState.d.ts` (`data` field), `engine.ts:124`; readers switch to the static
tables: `frameContext.ts:63-68,135-136,149` (`SCENE_EARTH`, `SCENE_PLANETS`, `SCENE_MESH_BODIES`),
`sceneOccluderBodies.ts:38`, body's `sceneBodyForId.ts:11`, `atmosphereDrawList.ts:44-46`, `earthPass`,
`cloudShellPass`, `ringsPass`, `bodyGlintsPass`; the 16 test files that build `data`
(`grep -rlE "data\.bodies|createEngineData|BodyStore" tests`); the `earth: null` cases in 8 of them
(`grep -rlF "earth: null" tests`) are deleted, not ported — they test a branch production never reaches.

**Tests:** none new.

**Done:** `grep -rnE "data\.bodies|createEngineData|BodyStore|earth === null" src tests` is empty.

- [x] Task 5

### Task 6: docs for PR 1

**Files:** `docs/RENDERER.md` (pass map: body passes in the body Layer, `body-meshes`; the atmosphere
reconcile in `sky-view`); `src/layers/README.md` (Status: body draws its own bodies; the tile subsystem
still core until PR 2); `src/layers/body/layer.ts` header; `near0SphereBodies.ts` header (O10: no
expiry); `docs/BACKLOG.md` + detail file "a per-body slab declaration on `LayerBody`" (O10).

- [ ] Task 6

---

## PR 2: tiles, terrain and the debug readout

### Task 7: the surface-tile subsystem moves into the Layer tree (pure moves)

**Files:** one manifest move, by the Global Constraints' rule:

- `src/services/engine/frame/surfaceTilePlanner/*` (4 files, 228 lines), the stream
  (`surfaceTileStream.ts`, 398), `surfaceTileTerrain.ts`, `src/data/bodies/idleSurfaceTilePlan.ts`,
  `src/utils/bodyTextures/bodySurfaceTier.ts`, the fetchers (`fetchSurfaceTileManifest`,
  `fetchSurfaceTileBitmap`, `fetchHeightTile`), `surfaceTileSpecOf`, `isSurfaceTileBodyId`, and every
  `src/utils/surfaceTiles/*.ts` (33 files) and `src/@types/**/SurfaceTile*` type whose importers are all
  body → `subsystems/surfaceTiles/`, `load/`, `@types/`.
- Stays (shared): every file `tools/` imports (`grep -rhoE "src/(utils/surfaceTiles|data/bodies|@types)/[A-Za-z/]+" tools scripts | sort -u`:
  `surfaceTileParams` 9 hits, `heightTileFormat`, `surfaceTileRegistry` 4, several utils),
  `SurfaceTileBodyId` (`FlyToPreset.d.ts:5`), `marsSurfaceParams` (`scenePlanets.ts`,
  `bodyTextureRegistry.ts`), `createTileStreamSubsystem`, `TextureAtlas`.
- Path pins: `frameFilePurity.test.ts:121` (`frame/surfaceTilePlanner/` row deleted: no longer swept),
  `oneMpcSeam.test.ts:63,94`, `docsRenderingFacts.test.ts:17`, `inlineTypeFiles.ts:120`.

**Contract:** behaviour-neutral; core (`runFrame.ts`, `wireSlots.ts`, `createLayers.ts`, `engine.ts`)
imports the moved files at their new paths until Task 8.

**Tests:** none new.

**Done:** `npx tsc --noEmit` clean; the old-path grep returns nothing; `npm run typecheck` (tools
project) clean.

- [ ] Task 7

### Task 8: the planner becomes a body row; body owns the stream, the terrain seam and the tile readout (P6 leftovers, P7)

review: yes

**Files:**

- Body: `create.ts`/`destroy.ts`/`@types/BodyRuntime.ts` (`surfaceTiles`), `frame.ts` (create),
  `layer.ts` (`planners`, `terrain`, `facts`, `ui` debug section), `@types/BodyFacts.ts` (create),
  `subsystems/surfaceTiles/surfaceTileDebugSnapshotOf.ts` (create, from `engine.ts:502-508`),
  `passes/surfaceTilesPass.ts`, `passes/terrainPickMarkerPass.ts`, `load/bodySurfaceTier.ts` (reads the
  runtime's slot, not `slotFor`), `ui/selectSurfaceTileDebug.ts` (create),
  `src/components/containers/SurfaceTileAtlasSectionContainer.tsx` and
  `src/components/DebugPanel/SurfaceTileAtlasSection.{tsx,module.css}` → `src/layers/body/ui/` (move-files;
  CSS by hand). Read `docs/superpowers/conventions/ui-ux.md` and `.claude/skills/create-component/SKILL.md`
  before editing the section.
- Core deletions: `runFrame.ts:28-30,242-252,290-292`; `shouldKeepTicking.ts:38,51` (`surfaceTilesAnimating`);
  `wireSlots.ts:91-102`; `engine.ts:59,211,433-435,502-508`; `EngineSubsystemHandles.d.ts:12,21-22,30-40`;
  `EngineDebugHandle.d.ts:50-55` (`surfaceTiles`); `createLayers.ts:21-22,207-214` (core's terrain row);
  `DebugPanel.tsx:75` mount of the moved section.
- `src/data/rendering/frameSections.ts` PRELUDE: `{ kind: 'plan', name: 'surface-tiles' }` after
  `milky-way` (`:22`), with a one-line why.
- Tests: `runFrame.test.ts:999,1110,1169-1182` move to `tests/layers/body/frame.test.ts`;
  `surfaceTileTerrain.test.ts:8,18`, `buildDemandCtx.test.ts:77`, `liveWorldPose.test.ts:55`,
  `liveRenderCamera.test.ts:41`, `earthPass.test.ts:238,283`, `shouldKeepTicking.test.ts`,
  `DebugPanel.test.ts:47`, `createLayers.composition.test.ts:232-246`.

**Contract:**

```ts
// BodyRuntime gains (the shape #940 put at state.subsystems.surfaceTiles, moved whole)
readonly surfaceTiles: { readonly stream: SurfaceTileStream; plan: SurfaceTilePlan };
readonly publish: (patch: Partial<BodyFacts>) => void;
readonly store: AppStore;

export type BodyFacts = { readonly surfaceTileDebug: SurfaceTileDebugSnapshot };
// layer.ts: facts: { surfaceTileDebug: EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT }

// frame.ts — O2: the plan rides the runtime; the value is unused
export function surfaceTilePlanner(
  runtime: BodyRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }>; // name 'surface-tiles', no fade
// plan: runtime.surfaceTiles.plan = planSurfaceTiles(views, surfaceTileOverOf(views),
//         stream.residency, (id) => bodySurfaceTier(runtime, id)); stream.apply(plan);
//       publish the debug snapshot (below); return { value: undefined, awake: plan.awake, settling: false }

export function surfaceTileDebugSnapshotOf(tiles: BodyRuntime['surfaceTiles']): SurfaceTileDebugSnapshot;
```

- `create` mints the stream with `{ device: deps.ctx.device, requestRender: deps.requestRender }` and
  `plan: IDLE_SURFACE_TILE_PLAN`; `destroy` destroys the stream before the renderers.
- `terrain: (r) => surfaceTileTerrain(r.surfaceTiles)`; `composeTerrain` now composes the Layers'
  providers only (`composeTerrain.ts:8-13` keeps the two-provider throw and the `FLAT_TERRAIN` fallback).
- Plan timing: the plan moves from `runFrame.ts:245` (after views, before the label directors) to the
  PRELUDE plan phase (`renderFrame.ts:61-74`). Verified: nothing between reads this frame's plan. The
  camera step already read last frame's plan (`runFrame.ts:113` < `:245`). One indirect path changes by
  one `apply`: a label producer calling `ctx.bodyPose` reaches `terrainHeightAt` with pre-`apply`
  residency (a height tile landing or evicting reaches a caption one frame later). Accepted.
- Wake vote: the planner's `awake` folds into `snapshot.plans.awake` (`createFramePlannerResultStore.ts:62`),
  which `runFrame.ts:298` already reads after `renderFrame`; the manifest-before-engagement case is in
  `plan.awake` (`planSurfaceTiles.ts:42,60`).
- P7 publisher, in the planner after `apply`: only while
  `selectDebugPanelOpen(runtime.store.getState())` (`state/ui/selectors.ts:37`), at most every 250 ms by a
  `throttleByTime(250)` minted in `create` (never per frame: `runFrame.ts:55-59`'s reason), publish
  `{ surfaceTileDebug: surfaceTileDebugSnapshotOf(runtime.surfaceTiles) }`.
- The section: `{ slot: 'debug', content: SurfaceTileAtlasSectionContainer }`; the container reads
  `selectSurfaceTileDebug` (`selectEngineFacts(state).body?.surfaceTileDebug`, the
  `selectStarChunkSlotsError` shape, `state/engine/selectors.ts:141-142`) and keeps its `flyToLonLat`,
  overlay reads and writes; the presentational section drops its own 250 ms poll (`:45,60`) and renders
  the snapshot prop.

**Tests:**

- `a capture face draws surface tiles from the runtime's plan` — `surfaceTilesPass(runtime)`'s
  `enabled` and `draw` against a ctx whose `snapshot.plans` is a fresh empty store and a runtime holding
  a non-empty cut: no throw, the cut is drawn. **Bug caught:** a pass reading `snapshot.plans` throws on
  every probe face.
- `the planner's wake vote holds while the manifest is in flight` (moved from `runFrame.test.ts:1169-1182`).
- `the tile readout publishes only while the debug panel is open, at most every 250 ms` — panel closed:
  0 publishes over 20 frames; open, frames 16 ms apart: 2 publishes in 300 ms; the published value
  round-trips `structuredClone` unchanged. **Bug caught:** a dispatch every frame, or a non-serialisable
  field tripping RTK's check.
- `createLayers composes the body Layer's terrain and no core provider` (retargets
  `createLayers.composition.test.ts:232-246`).

**Done:** `grep -rnE "subsystems\.surfaceTiles|surfaceTilesAnimating|debug\.surfaceTiles|core:surfaceTiles" src tests` is empty;
boot passes `checkFrameOrder` (the new plan line leads PRELUDE's plan rows, scope `once`).

- [ ] Task 8

### Task 9: the terrain-pick-marker section moves with its pass (O8 A)

**Files:** `src/components/containers/TerrainPickMarkerTuningSectionContainer.tsx`,
`src/components/DebugPanel/TerrainPickMarkerTuningSection.{tsx,module.css}` → `src/layers/body/ui/`;
`layer.ts` (`ui` debug entry); `@types/BodyFacts.ts`; `frame.ts` (publisher);
`DebugPanel.tsx:76`.

**Contract:** `BodyFacts` gains `terrainPickMarker: { heightM: number | null; levelAtEye: number | null }`,
published with the tile readout under the same gate, and computed only while the `terrain-pick-marker`
overlay is on: `heightM` from the stream at the cursor pick, through the helper `terrainPickMarkerPass`
uses (`terrainPickMarkerPass.ts:55-65`), never written from a draw; `levelAtEye` from
`stream.residentHeightLevelAt` at `views[0]`'s eye. The section drops its `cameraDebug` prop and poll.
`engine.debug.cameraDebug` and its two fields stay (the Camera section reads them).

**Tests:** none new (UI re-plumbing; the publisher gate is pinned by Task 8).

- [ ] Task 9

---

## PR 3: the body's identity

### Task 10: Earth, planet and moon rows move into `body/bodies/`; the fold lists hosts first (O11, O13 A)

review: yes

**Files:**

- Create `src/layers/body/bodies/<id>.ts`, one `LayerBody` per body (33: Earth plus today's 32
  `SCENE_PLANETS` rows), and `bodyBodyRows.ts`.
- Move by the rule (their one reader moves here): `npm run move-files -- --manifest <moves.json>` for
  `src/data/bodies/makers/{heliocentricPlanet,satelliteBody}.ts` → `src/layers/body/bodies/makers/`;
  headers' "lives beside `SCENE_PLANETS`" rewritten. The `satellite` maker, `palette`,
  `marsSurfaceParams` and `orbitPlaneFrames` stay (missions rows and `tools/` read them).
- Create `src/utils/scene/isEarthBody.ts`, `src/utils/scene/isPlanetBody.ts`.
- Modify: `src/data/bodies/layerBodyRows.ts` (order and header rule, O13 A); `sceneEarth.ts` and
  `scenePlanets.ts` (become projections; headers); `orbitalElements.ts` (drop the planet and moon block
  `:48-799` and the imports it alone used; header keeps the JPL transcription note pointing at the body
  rows); `rotationElements.ts` (drop `:20-243`; header keeps the Archinal source); `sceneBodies.ts:4-6`
  (header: a body is seeded as a row in its Layer's `bodies/`); `src/layers/body/layer.ts`
  (`bodies: BODY_BODY_ROWS`).
- Tests: `tests/data/bodies/rotationElements.test.ts` (one new case).

**Contract:**

```ts
// src/layers/body/bodies/mars.ts — today's three rows moved verbatim, comments included
export const MARS: LayerBody = {
  body: heliocentricPlanet({ … }),               // scenePlanets.ts:32-41
  position: { kind: 'orbit', elements: { … } },  // orbitalElements.ts:123-147
  rotation: { … },                               // rotationElements.ts:42-49
};
// EARTH: body sceneEarth.ts:21-27, elements orbitalElements.ts:98-122, rotation rotationElements.ts:35-41.
// NEREID carries no `rotation` (none today). Export name = the id in UPPER_SNAKE (MOON, TITANIA, …).

export const BODY_BODY_ROWS: readonly LayerBody[]; // EARTH, then today's scenePlanets.ts order (MERCURY … NEREID)

export function isEarthBody(body: SceneBody): body is EarthBody;   // body.id === 'earth'
export function isPlanetBody(body: SceneBody): body is PlanetBody; // 'albedo' in body && 'surface' in body
//                                                                     (Earth has no albedo, a star no albedo, a mesh no surface)
// sceneEarth.ts:   export const SCENE_EARTH: EarthBody — the fold's one isEarthBody row; throws at load when absent
// scenePlanets.ts: export const SCENE_PLANETS: readonly PlanetBody[] = fold bodies filtered by isPlanetBody
// orbitalElements.ts:  ORBITAL_ELEMENTS = [...S_STAR_ORBITAL_ELEMENTS, ...the fold's orbit rows]
// rotationElements.ts: ROTATION_ELEMENTS = the fold's rotations

// layerBodyRows.ts (O13 A). Header rule: "a host's Layer before the Layers whose rows hang off it".
export const LAYER_BODY_ROWS = [...BODY_BODY_ROWS, ...MISSIONS_BODY_ROWS, ...EARTH_SCENES_BODY_ROWS];
```

- Rows are leaf data (P1): types, `src/data` constants and makers, pure utils and `./makers/*`; never
  `ORBITAL_ELEMENTS`, a `SCENE_*` table, `ROTATION_ELEMENTS`, `positionDrivers` or `layer.ts`. A
  violation is a load-time TDZ crash in every suite that imports a body table (CI sees it).
- `SCENE_PLANETS` keeps today's order exactly, so `BODY_PICK_ROWS.planet` indexes are unchanged.
- `tools/` and the website keep importing `SCENE_PLANETS`, `SCENE_EARTH` and `ORBITAL_ELEMENTS` from
  core (`buildTextures.ts:24`, `marsSurfaceBake.ts:13`, `objectCatalogue.ts:6-9`).

**Tests:**

- `every textured body keeps its rotation row` — every `BODY_TEXTURE_REGISTRY` entry's `bodyId` has a
  `rotationRowById`. **Bug caught:** a row file drops its `rotation` in the move, and the body's texture
  turns with the ecliptic frame, its prime meridian wrong; nothing else pins 29 of the 32 rows.
- Guarded unchanged: `orbitalElements.test.ts` (unique ids, every focus resolves), `deriveBodyStates.test.ts`
  (J2000 pins), `scenePlanets.test.ts`, `sceneEarth.test.ts`, `sceneBodyPickId.test.ts:30`
  (`SCENE_PLANETS[localIdx]` is the Moon), `neptuneMoons.test.ts`, `uranusMoons.test.ts`,
  `layerBodyRowsCoverage.test.ts` (body's rows in the fold, by identity).

**Done:** `npx tsc --noEmit` and `npm run typecheck` (tools, website) clean; no planet or moon id appears
in `src/data/bodies/{orbitalElements,scenePlanets,sceneEarth,rotationElements}.ts`
(`grep -nE "'(earth|mercury|moon|titan|nereid|charon)'" <those files>` empty); `SCENE_PLANETS` ids print
in today's order (checked once by the implementer, not a test).

- [ ] Task 10

### Task 11: `LayerSearchEntry.chip`; the palette's `layer` arm shows it; craft rows chip their kind (O5 C)

**Files:** `src/@types/engine/layer/LayerSearchEntry.d.ts`; `src/components/CommandPalette/paletteRows.tsx:239-241`
(and its comment, which says the arm has no chip); the `layer` arm of `ScoredRow.d.ts` if the entry is
not already carried; `src/layers/missions/present/craftSearch.ts`; tests `paletteRows.test.ts`,
`CommandPalette.test.ts`.

**Contract:**

```ts
export type LayerSearchEntry = {
  readonly id: string;
  readonly names: readonly string[];
  readonly class: 'primary' | 'catalog';
  /** Category tag shown at the row's right edge; omitted → no chip. */
  readonly chip?: string;
};
// paletteRows layer arm: glyphRowView(m, <the entry's chip in the place arm's `styles.source` span>)

// craftSearch.ts, beside ALIASES: the craft's kind, per craft (O5 C); whale and petunias absent → no chip
const CHIP: Readonly<Record<string, string>> = {
  curiosity: 'Rover', perseverance: 'Rover', spirit: 'Rover', opportunity: 'Rover',
  voyager1: 'Probe', voyager2: 'Probe', hubble: 'Space telescope',
};
```

**Test:** `a layer row shows its entry's chip, and none when omitted`. **Bug caught:** the chip is
dropped between the entry and the row view.

- [ ] Task 11

### Task 12: earthScenes' own selection kind and palette row (O6a, O6b)

review: yes

**Files:**

- Kind types: `src/data/selection/selectionKinds.ts` (`'earthScene'` after `'craft'`),
  `src/@types/engine/{SelectionRef,FocusableTarget,SelectionRow}.d.ts`, `src/@types/engine/EarthSceneInfo.d.ts`
  (create).
- Per-kind tables (the #938 list plus the two arms `craft` also joined):
  `src/services/engine/helpers/{refOf,targetIdentityKey,buildFocusable,rowFocusable,selectionHaloTable,liveFocusRow,logCameraState}.ts`,
  `src/services/url/urlHashFor.ts`, `src/services/engine/camera/focusFraming.ts`,
  `src/utils/selection/mayHaveLabel.ts`, `src/state/settings/core/pickingSlice.ts`, and the exhibits that
  author a whole `picking.kinds` record: `src/data/exhibits/{solarSystem,zoneOfAvoidance}.ts`,
  `src/layers/missions/exhibits/voyagerMissions.ts` (tsc names any other).
- earthScenes: `src/layers/earthScenes/present/{earthSceneSelectionRow,earthSceneSearch}.ts` (create);
  `src/layers/earthScenes/layer.ts` (`selection`, `search`, `ui` detail card; header).
- The `body` kind narrows: `src/utils/scene/isCoreBodyId.ts` drops `EARTH_SCENE_BODY_IDS` (header);
  `src/data/bodies/earthSceneBodyIds.ts` header (the ids the `earthScene` kind claims).
- Cards: `BodyDetailCardContainer.tsx` (and `BodyDetailCard.tsx`, `CompactBodyCard.tsx` where the prop is
  typed): `BodyInfo | CraftInfo | EarthSceneInfo`.
- Tests: `tests/support/allKindsEnabled.ts`; `tests/services/url/urlHashFor.test.ts`; the claim test moves
  out of `tests/layers/missions/present/craftSelectionRow.test.ts:33-41` into
  `tests/compositions/bodyFocusClaims.test.ts` (create); `rankPaletteMatches.test.ts`.

**Contract:**

```ts
export type EarthSceneInfo = Omit<BodyInfo, 'type'> & { readonly type: 'earthScene' };
// SelectionRef gains   | { readonly type: 'earthScene'; readonly id: SceneBodyId }

export function earthSceneSelectionRow(): SelectionKindRow<Extract<SelectionRef, { type: 'earthScene' }>>;
// pickSources: []; resolvePick → null; encodePick → null   (unpicked, spec §3)
// extractRow: bodyRowAt(id, deriveBodyStates(simDays).get(id)!.positionMpc) as type 'earthScene', ids in EARTH_SCENE_BODY_IDS only
// focusId: claims and decodes `body-<id>` for id ∈ EARTH_SCENE_BODY_IDS; encodes `body-${id}`

export async function* earthSceneSearch(): AsyncIterable<readonly LayerSearchEntry[]>;
// yields once, per EARTH_SCENES_BODY_ROWS mesh body: { id: `body-${id}`, class: 'primary', names: [label], chip: 'Earth' }

// earthScenes/layer.ts
selection: () => [earthSceneSelectionRow()],
search: earthSceneSearch,
ui: [{ slot: 'detailCard', content: { type: 'earthScene', Detail: BodyDetailCardContainer, Compact: CompactBodyCard } }],
```

- Each per-kind row mirrors the `body` row, as `craft`'s did: `urlHashFor` → `body-${id}`;
  `targetIdentityKey` → `body:${id}`; halo `nearFieldHalo`; framing `bodyLikeFraming`; `liveFocusRow`
  and `logCameraState` take it beside `body` and `craft`; `pickingSlice` `earthScene: true`; each
  exhibit's `kinds` record copies its `body` value. `mayHaveLabel` → `false` (uncaptioned, spec §3).
- The card renders exactly as before, "Body" eyebrow included. Søndermarken stays uncaptioned (no label
  entry) and unpicked (no pick source; `earthSceneMeshesPass` already draws no pick).
- The DebugPanel's picking-kind list gains an `earthScene` row that does nothing (no pick source):
  `PickingSettings.kinds` is total over the kinds. Accepted (user, 2026-10-27); this task adds the
  backlog line "Narrow `PickingSettings.kinds` to pickable kinds" to `docs/BACKLOG.md`.
- `isCoreBodyId` claims only `BODY_PICK_ROWS` ids, so the `body` and `earthScene` claims are disjoint by
  construction, and core's `kind: 'body'` palette row for Søndermarken goes with it.

**Tests:**

- `every scene body's focus id is claimed by the kind that owns it` — resolver composed from
  `missionsLayer.selection()`, `earthScenesLayer.selection()` and `coreSelectionRows()` (Task 13 swaps in
  `bodyLayer.selection()`). For every `SCENE_BODIES` id: `MISSION_CRAFT_IDS` → `craft`,
  `EARTH_SCENE_BODY_IDS` → `earthScene`, `isCoreBodyId` → `body`, and `null` only for seeded-star ids
  (`SCENE_SUN`, `SCENE_STARS`, `SCENE_S_STARS`); every non-null ref's `focusIdOf` is `body-<id>`.
  **Bug caught:** Søndermarken loses its claimant and `#focus=body-soendermarken` opens nothing (today's
  test expects `null` there and would pass), or a Layer forgets its `selection` member, or two kinds
  claim one id and every resolve throws.
- `Søndermarken ranks exactly one palette row, chip "Earth"`. **Bug caught:** core's body row survives
  beside earthScenes' row, or both vanish.

**Done:** `npx tsc --noEmit` clean; `grep -n EARTH_SCENE_BODY_IDS src/utils/scene/isCoreBodyId.ts` empty;
boot passes `assertSelectionRowsDisjoint`.

- [ ] Task 12

### Task 13: the `body` selection kind, its card and its source rows move into the Layer

review: yes

**Files:**

- Move: `src/services/engine/selection/bodySelectionRow.ts` → `src/layers/body/present/`;
  `src/utils/scene/isCoreBodyId.ts` → `src/layers/body/present/isBodyKindId.ts` (rename via
  `npm run refactor`; `rankPaletteMatches.ts:75` imports it from the Layer until Task 14 deletes that
  reader, in the same dispatch);
  `src/data/sources/{earth,planet}.ts` → `src/layers/body/sources/` + `bodySourceRows.ts` (create).
- Delete: `src/services/engine/selection/coreSelectionRows.ts`; `engine.ts:337-342` seeds
  `state.selectionKindRows = []` (rewrite the comment); `CORE_DETAIL_CARDS.body`
  (`detailCardTable.ts:44-50`; header `:36-38`).
- Modify: `src/data/sources.ts:64-67` (fold `bodySourceRows` as `missionsSourceRows` is folded, `:80`);
  `src/layers/body/layer.ts` (`sources`, `selection`, `ui.detailCard`).
- Stay core: the `'body'` literal in `selectionKinds.ts:12`, `SelectionRef`/`SelectionRow`/`FocusableTarget`,
  and every per-kind table row (`refOf`, `targetIdentityKey`, `buildFocusable`, `rowFocusable`,
  `selectionHaloTable`, `urlHashFor`, `focusFraming`, `mayHaveLabel`, `pickingSlice`, `liveFocusRow`,
  `logCameraState`); `EARTH_REF`; `Source.Planet = 22`, `Source.Earth = 23`; the card components.
- Tests: `tests/services/engine/selection/*` that import `coreSelectionRows`; `allKindsEnabled.ts`;
  `tests/layers/body/present/bodySelectionRow.test.ts` (moved); `bodyFocusClaims.test.ts` composes
  `bodyLayer.selection()` in place of `coreSelectionRows()`.

**Contract:** `bodySelectionRow()` unchanged in behaviour (pick sources, `BODY_PICK_ROWS` resolve,
`sceneBodyPickId` encode, `body-<id>` claim over `isBodyKindId`, now `BODY_PICK_ROWS` ids only). Card
entry `{ slot: 'detailCard', content: { type: 'body', Detail: BodyDetailCardContainer, Compact:
CompactBodyCard } }`. A body Layer card left beside core's would silently win (`detailCardTable.ts:61-66`
does not check duplicates), so core's entry goes in this commit.

**Tests:**

- `the home ref and a body deep link resolve once the body kind composes` — store seeded with
  `EARTH_HOME` and a pending `#focus=body-mars` before `createLayers`: no row, no throw; after
  `createLayers` and the `engineStatusChanged` pulse, the selection rows hold Earth and Mars
  (`watchSelectionRowsSaga.ts:75-83`, `resolveFocusRefDeferringSaga.ts:16-22`). **Bug caught:** home
  never re-extracts and the app opens with nothing focused.
- `every scene body's focus id is claimed by the kind that owns it` (Task 12) passes with the body
  Layer's row.

**Done:** `grep -rn "coreSelectionRows\|isCoreBodyId" src tests` is empty; `assertSelectionRowsDisjoint`
passes at boot.

- [ ] Task 13

### Task 14: palette rows, captions, planet trails and the Solar System exhibit

**Files:**

- Search: `src/layers/body/present/bodySearch.ts` (create); delete the `kind: 'body'` palette row:
  `rankPaletteMatches.ts:75-81`, `ScoredRow.d.ts:38`, `paletteRows.tsx:181-182`,
  `paletteRowLabel.ts:22-23`, `actionForRow.ts:48-51` and their tests (`actionForRow.test.ts:66`,
  `paletteRowLabel.test.ts:45`, `paletteRows.test.ts:14,23`). `bodyRowChip` and `namedRowView` stay
  (the starCatalog arm, `paletteRows.tsx:183-186`). `isBodyKindId`'s palette reader goes with
  `rankPaletteMatches.ts:75`.
- Captions: `src/services/engine/presentation/{sceneBodyLabels,produceSceneBodyCaptions}.ts` →
  `src/layers/body/present/` (move-files); delete `engine.ts:312-321` (and its moot tiebreak comment)
  and `src/data/labels/sceneBodyCaptionLabel.ts`.
- Trails: delete `src/data/bodies/coreTrailElements.ts` (its filter has nothing left to exclude);
  create `src/layers/body/present/bodyTrailElements.ts`; delete core's group at
  `createLayers.ts:43,203-204`; `orbitReachByRegion.ts:6-9` header (names `CORE_TRAIL_ELEMENTS`).
- Exhibit: `src/data/exhibits/solarSystem.ts` → `src/layers/body/exhibits/solarSystem.ts`;
  `src/layers/body/exhibits/exhibits.ts` (create, `bodyLayerExhibits`); `coreExhibits.ts:16`;
  `appExhibits.ts:11` (O7 order). Its starCatalog `initialState` import (`solarSystem.ts:8`) becomes a
  body → starCatalog read, as `voyagerMissions.ts` already does.
- `src/layers/body/layer.ts`: `search`, `guides`, `exhibits`.
- Tests: `produceSceneBodyCaptions.test.ts`, `sceneBodyLabels.test.ts` (moved); `rankPaletteMatches.test.ts`;
  `createLayers.composition.test.ts`.

**Contract:**

```ts
// bodySearch.ts — static, yields once over BODY_BODY_ROWS (Earth, then the planets and moons)
export async function* bodySearch(): AsyncIterable<readonly LayerSearchEntry[]>;
// row: { id: `${BODY_FOCUS_PREFIX}${body.id}`, class: 'primary', names: [body.label],
//        chip: regionOfBody(body.id)?.label }   // "Solar System" for every row (bodyRegions.ts:96)

// bodyTrailElements.ts — every body row's orbit; equals today's CORE_TRAIL_ELEMENTS as a set
export const BODY_TRAIL_ELEMENTS: readonly OrbitalElements[]; // BODY_BODY_ROWS' `orbit` positions

// layer.ts
guides: () => ({
  screenLabels: [{ slab: NEAR0, id: 'sceneBodyCaptions', label: 'body', produceLabels: produceSceneBodyCaptions }],
  orbitTrails: { show: 'orbitTrails', rows: BODY_TRAIL_ELEMENTS },
}),
```

**Tests:**

- `each body ranks exactly one palette row` — "Mars" and "Titan" each rank one row, chip "Solar System".
  **Bug caught:** a core `kind: 'body'` row survives beside the Layer row.
- `each planet is captioned once` — after `createLayers` over a fixture with the body Layer, the NEAR0
  director holds exactly one producer with id `sceneBodyCaptions`. **Bug caught:** core's registration
  survives and every planet caption draws twice.
- `createLayers composes only the Layers' orbit-trail groups` — a one-Layer fixture yields exactly its
  group. **Bug caught:** core's group survives beside body's and every planet trail draws at double
  brightness.

**Done:** `grep -rnE "kind: 'body'|CORE_TRAIL_ELEMENTS|SCENE_BODY_CAPTION_LABEL|sceneBodyCaptions" src | grep -v "^src/layers/body/"` is empty.

- [ ] Task 14

### Task 15: docs for PRs 2–3

**Files:** `src/layers/README.md` (Status: body is formed — its `layer.ts` declares every member above,
its rows in `bodies/`; earthScenes has its own kind and palette row; the folder table gains
`bodies/makers/`; the `bodies?` row names the fold's host-first order); `docs/RENDERER.md` (the tile
planner row, the terrain seam's provider); `docs/science.md:19,87` (the element and rotation tables'
paths now point at `src/layers/body/bodies/`); `packages/website/src/data/docsSettings.ts` only if a
settings row moved (none expected); spec §3 "Sun?" answered in the spec's own words: the Sun stays with
the stars (its row, drawing, caption, selection and search are all starCatalog's; body reads only its
position), so it moves with the seeded stars (§7 step 5); stale comments the survey found:
`source.ts:180-182` (the Sun's pick code), `BodySourceEntry.d.ts:5` (Sun listed as body-typed).

- [ ] Task 15

---

## Execution

Lean SDD, one worktree per PR, CI as the gate, one final review per PR. No perf gate (ruled). PR 3 runs
in parallel with PRs 1–2 in its own worktree (O1).

| PR | Dispatch | Tasks | Model | Why grouped |
| -- | -------- | ----- | ----- | ----------- |
| 1 | A | 1 | Opus | `review: yes`; the slab model alone |
| 1 | B | 2 | Sonnet | one manifest, mechanical |
| 1 | C | 3–4 | Opus | one mental model: runtime ownership, then what it empties; Task 3 `review: yes` |
| 1 | D | 5–6 | Sonnet | sweep + docs |
| 2 | E | 7 | Sonnet | one manifest |
| 2 | F | 8–9 | Opus | the planner, terrain and both debug sections share the runtime and the facts; Task 8 `review: yes` |
| 3 | G | 10–11 | Sonnet | data move with comments verbatim, then the chip contract; both mechanical; Task 10 `review: yes` |
| 3 | H | 12–13 | Opus | the two kinds and their shared claim test, one selection model; both `review: yes` |
| 3 | I | 14–15 | Sonnet | the rows that hang off the kind, then docs |

Within a PR every dispatch is sequential (shared files). PR 3 shares with PRs 1–2 only
`src/layers/body/layer.ts` and `createLayers.ts` (different lines); it merges `main` in before landing.

| PR | Tasks | Moved (≈, `wc -l`) | Edited (≈) | Depends on |
| -- | ----- | ------------------ | ---------- | ---------- |
| 1. Render + P5 | 1–6 | 7.1k: passes 1.5k, renderers 3.6k, slots 0.7k, atmosphere data/helpers 1.0k, packers/helpers 0.3k | 1.1k | main |
| 2. Tiles + P7 | 7–9 | 3.4k: subsystem 3.1k (minus tools-shared), debug UI 0.46k | 0.4k | PR 1 |
| 3. Identity | 10–15 | 1.6k: body rows 1.2k (element block 0.75k, rotations 0.23k, planets 0.18k, makers 0.05k) + per-file imports ~0.3k, selection/captions/exhibit 0.4k | 0.7k: kind rows and earthScenes identity 0.3k, palette 0.2k, fold and projections 0.1k, docs 0.1k | main (independent) |

---

## Definition of Done

**Deliverables**

- **PR 1:** `SlabRow.hosts`; `hostBandOpen`; `BODY_SLAB_ROWS`, `atmosphereInsideBand`; `bodyRowSlabs(ctx)`;
  `LAYER_SLAB_ROW_HEADROOM` grown with an unchanged `SLAB_ROW_CEILING`; the body runtime (`create`,
  `destroy`, `BodyRuntime`) owning nine renderers, 40 texture slots and the atlas slot; 11 body passes
  (incl. `body-meshes`), 2 body computes, 41 body asset rows; nine GPU handle rows, `CORE_COMPUTES`, the
  body slot families, `buildSlotsFromRegistry`, `installSlots`, `isCoreSlotFieldKey`, `isBodyTextureKey`
  and (O9) the body store deleted; `MESH_ASSET_WIRING`; docs.
- **PR 2:** the stream, planning and terrain under `src/layers/body/subsystems/surfaceTiles/`;
  `surfaceTilePlanner` and its PRELUDE line; `terrain` from the body Layer; `BodyFacts` with
  `surfaceTileDebug` and `terrainPickMarker`; both debug sections in the body Layer's `ui`;
  `engine.debug.surfaceTiles`, `state.subsystems.surfaceTiles`, `surfaceTilesAnimating` and core's terrain
  row deleted.
- **PR 3:** 33 body rows in `src/layers/body/bodies/` + `BODY_BODY_ROWS` and `body.bodies`; the fold
  host-first; `SCENE_EARTH`, `SCENE_PLANETS`, `ORBITAL_ELEMENTS`, `ROTATION_ELEMENTS` as projections;
  `isEarthBody`, `isPlanetBody`; `LayerSearchEntry.chip` shown by the palette; craft chips by kind; the
  `earthScene` kind, `EarthSceneInfo`, earthScenes' `selection`, `search` and card; the body Layer's
  `selection`, `ui.detailCard`, `sources`, `search`, `guides` (captions, trails) and `exhibits`;
  `coreSelectionRows`, `isCoreBodyId`, `CORE_TRAIL_ELEMENTS`, the `kind: 'body'` palette row, core's
  caption registration and trail group deleted.

**Observable behaviour (smoke), identical to main except O12's list.** Each item is a deep link to the
worktree's own server, shot beside main.

- `#focus=body-earth` from orbit: globe, clouds, atmosphere limb, night lights; pull back until Earth is
  sub-pixel: the glint as on main.
- `#focus=body-earth`, descend to street level over Copenhagen: tiles stream and sharpen; the aerial haze
  on the horizon; at the shell edge (~100 km) the limb hands over to the in-atmosphere sky with no
  doubled or black frame.
- The dome rig at Copenhagen street level: tiles in every face; the sky the same in each.
- `#focus=body-saturn`: rings, ring shadow, the ring strip on the planet and its atmosphere.
- `#focus=body-titan`, `#focus=body-mars`, `#focus=body-pluto`: textured bodies with atmospheres.
- `#focus=body-io&t=2026-01-01T00:00:00Z`, `#focus=body-moon&t=2026-01-01T00:00:00Z`: the same face
  turned to the camera as on main (the moved rotation rows).
- `#focus=body-phobos`, `#focus=body-deimos`: the shape-model moons as meshes, probe-lit.
- `#focus=body-curiosity`: the rover on Gale's floor with its shadow; Mars tiles engaged.
- `#focus=body-soendermarken`: the park on terrain, uncaptioned and unpicked; the InfoCard as on main.
- A tier change (Settings → quality) while at Earth: the sky stays correct (the LUT reconcile).
- DebugPanel open at street level: the surface-tile section updates about four times a second; the
  terrain-pick-marker section shows its two numbers with the overlay on; closing the panel stops the
  readout.
- Palette: "Mars" → one row, chip "Solar System"; "HST" → one row, chip "Space telescope"; "Oppy" →
  chip "Rover"; "Voyager" → two rows, chip "Probe"; "oh no not again" → one row, no chip; "Søndermarken"
  → one row, chip "Earth". Clicking a planet caption selects it with the same InfoCard. The Solar System
  exhibit opens as on main and lists fifth on the remote (O7). Orbit trails toggle hides every planet
  trail; S-star trails keep their own toggle.

**Out of scope:** the seeded stars and the Sun's row (§7 step 5); a per-body slab declaration and
`near0SphereBodies`' deletion (O10); mesh slots (ruling 10); narrowing `PickingSettings.kinds` to
pickable kinds; the debug overlay keys and `terrainPickMarkerRadiusM`, which stay in core's shared debug
settings; picking sub-pixel mesh bodies (backlog); the remaining core exhibits.
