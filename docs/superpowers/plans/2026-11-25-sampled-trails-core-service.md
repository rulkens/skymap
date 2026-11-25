# Sampled trails as a core service: implementation plan

> Spec: [`2026-11-25-sampled-trails-core-service-design.md`](../specs/2026-11-25-sampled-trails-core-service-design.md).
> Branch `refactor/sampled-trails-core-service`, from main at d36088137. Preparation for asteroid
> 2026 QQ8; no new body ships here.
> Execution: lean SDD ([`sdd-execution.md`](../conventions/sdd-execution.md)), three serial
> dispatches. No perf gate (owner, 2026-11-25).

## Strategy

Core draws the trails of bodies on sampled tracks; a Layer hands in its rows through a new
`guides.sampledTrails` member, shaped like `guides.orbitTrails`. The missions Layer keeps its
switch (`missionTrails`), its `nearPlanets` setting and its emphasised craft, and stops owning the
pass, the renderer and the track format. Each task is one commit and leaves the suite green.

Moves and renames go through the tools, never `git mv` plus hand-edited imports:
`npm run move-files -- <from> <to>` (or `-- --manifest <moves.json>`, `--dry` first) for files, and
`npm run refactor -- rename <file> <Old> <New>` for symbols (see `.claude/skills/refactor/SKILL.md`).
`.wesl` files are the exception: `move-files` does not read them, so move them with `git mv` and
fix their `package::` imports and the `?static` import paths by hand.

## Task 1: Layers can hand sampled-trail rows to core

**Files:** `src/@types/engine/layer/SampledTrailGroup.d.ts` (new), `SampledTrailRow.d.ts` (new),
`src/@types/engine/frame/GatedSampledTrailGroup.d.ts` (new), `LayerGuides.d.ts`, `Layer.d.ts`
(doc at :90-96), `LayerInstance.d.ts`, `src/services/engine/layer/instantiateLayer.ts`,
`src/services/engine/layer/gateOrbitTrailGroup.ts`, `src/services/engine/phases/createLayers.ts`,
`src/@types/engine/EngineState.d.ts`, `src/services/engine/engine.ts` (:267), `PassState.d.ts`,
`src/compositions/README.md` (row 17), `tests/services/engine/phases/createLayers.composition.test.ts`.

**Contract:**

```ts
export type SampledTrailGroup = {
  /** The show entry whose value fades this group's trails. */
  readonly show: ShowKey;
  /** Bodies on a `sampled` position, each with its trail tint (linear HDR). */
  readonly rows: readonly SampledTrailRow[];
  /** Read each frame: draw a body's stay near a planet around that planet. Absent = never. */
  nearPlanets?(state: PassState): boolean;
  /** Read each frame: an opacity factor for one row. Absent = 1. */
  dim?(state: PassState, id: SceneBodyId): number;
};
export type SampledTrailRow = { readonly id: SceneBodyId; readonly color: Vec3 };
export type GatedSampledTrailGroup = SampledTrailGroup & { fade(view: FrameView): number };
```

`LayerGuides.sampledTrails?: SampledTrailGroup`; `EngineState.sampledTrailGroups: readonly
GatedSampledTrailGroup[]`, composed exactly as `orbitTrailGroups` (`createLayers.ts:206-208`) and
exposed on `PassState`.

- [ ] `gateOrbitTrailGroup` binds a show key to a fade and nothing else: rename it `gateTrailGroup`,
      generic over `{ readonly show: ShowKey }`, and use it for both lists. One function, not a twin.
- [ ] Test `createLayers composes the Layers' sampled-trail groups`, beside the orbit-trail one at
      `createLayers.composition.test.ts:145`: two fixture Layers, one group each, both land in
      `state.sampledTrailGroups` with a `fade` function.
- [ ] Fix the stale comment at `EngineState.d.ts:95` while there (only Layers' groups compose).
- [ ] Commit.

## Task 2: Core draws sampled trails; the missions Layer hands in its rows

**review: yes** (shaders and the TS↔WGSL uniform contract move).

**Files:** everything under `src/layers/missions/trails/` except `load/`, `sagas/`,
`state/`; `src/services/gpu/shaders/bodies/missionTrail/*`; `src/layers/missions/{layer,create,destroy}.ts`,
`@types/MissionsRuntime.d.ts`, `bodies/voyager1.ts`, `bodies/voyager2.ts`,
`timeline/utils/timelineLanes.ts`, `craft/present/missionLabelSource.ts`,
`missionCamera/utils/hermiteTrackVelAt.ts`; `src/@types/missions/SampledBody.d.ts`;
`src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts`,
`src/services/engine/frame/passes/index.ts`, `src/data/rendering/frameSections.ts` (:289),
`tools/site/matteHiddenPasses.ts` (:34), `packages/website/src/data/siteShots.ts` (:55); the tests
mirror under `tests/layers/missions/trails/` and `tests/services/gpu/shaders/missionTrail.parity.test.ts`.

**Where things go** (mirror the orbit-trail homes):

| From `src/layers/missions/trails/` | To |
| --- | --- |
| `@types/MissionTrailRenderer`, `MissionTrailFrame`, `MissionTrailGeometry`, `CraftTrail`, `NearTrail`, `TrailDraw`, `TrailStay`, `TrailCentre` | `src/@types/rendering/sampledTrailRenderer/` as `SampledTrailRenderer`, `SampledTrailFrame`, `SampledTrailGeometry`, `SampledTrail`, and the four `Trail*`/`NearTrail` names unchanged |
| `render/missionTrailRenderer.ts` | `src/services/gpu/renderers/bodies/sampledTrailRenderer.ts` (`createSampledTrailRenderer`) |
| `render/buildMissionTrails.ts`, `render/nearTrailPiece.ts`, `utils/{tessellateTrack,trackKmToMpc,trailDrawsAt,trailStaysOf}.ts` | `src/utils/trails/` (`buildSampledTrails`; the rest keep their names) |
| `data/missionTrailStyle.ts` | `src/data/bodies/sampledTrailStyle.ts` (`SAMPLED_TRAIL_WIDTH_PX`, `SAMPLED_TRAIL_MAX_SAG_KM`, `TRAIL_STAY_FADE`, `TRAIL_ENTRY_FADE_REACH`) |
| `MISSION_EMPHASIS_DIM`, `utils/emphasisDim.ts` | stay in missions: `craft/data/missionEmphasisDim.ts`, `craft/utils/emphasisDim.ts` |
| `data/trailCentres.ts` | `src/data/bodies/trailCentres.ts` |
| `passes/missionTrailsPass.ts` | `src/services/engine/frame/passes/sampledTrailsPass.ts`, a plain `ContentPass` named `'sampled-trails'` in `CONTENT_PASSES` |
| shaders `bodies/missionTrail/` | `src/services/gpu/shaders/sampledTrail/`; GPU labels `sampled-trail-*` |
| `missionCamera/utils/hermiteTrackVelAt.ts` | `src/utils/orbit/hermiteTrackVelAt.ts` |

**Contract:**

```ts
// EngineGpuHandles gains, with its GPU_HANDLE_ROWS row:
sampledTrailRenderer: SampledTrailRenderer | null;

// The renderer builds for the ids it is given, once per track-store version:
ensureTracks(version: number, ids: readonly SceneBodyId[]): readonly SampledTrail[];
buildSampledTrails(ids: readonly SceneBodyId[]): SampledTrail[];

// src/@types/missions/SampledBody loses `trailColor` (the tint is the trail row's):
export type SampledBody = {
  readonly id: SceneBodyId;
  readonly launchIso: string;
  readonly launchPad: LonLatDeg;
};

// src/layers/missions/trails/data/missionTrailRows.ts
export const MISSION_TRAIL_ROWS: readonly SampledTrailRow[]; // voyager1 lime, voyager2 green

// src/layers/missions/layer.ts
guides: (runtime) => ({
  screenLabels: [missionLabelSource(runtime.pickCode)],
  sampledTrails: {
    show: 'missionTrails',
    rows: MISSION_TRAIL_ROWS,
    nearPlanets: (state) => state.settings.missionTrails.nearPlanets,
    dim: (state, id) => emphasisDim(state.settings.missions.craft, id),
  },
}),
```

**The pass** follows `orbitTrailsPass.ts`: no pass-level `fade`; `enabled` is false when the
renderer is null, every group's `fade(ctx)` is 0, or no row's body is present
(`spacecraftPresent`); `draw` calls `beginFrame` once, then per group (skipping fade 0) and per row
draws what `trailDrawsAt(trail, simDays, group.nearPlanets?.(state) ?? false)` returns at opacity
`fade * (group.dim?.(state, id) ?? 1) * draw.weight`. Everything else in today's `draw`
(`missionTrailsPass.ts:38-87`) carries over unchanged. The ids handed to `ensureTracks` are the
union of all groups' row ids.

- [ ] The missions runtime, `create` and `destroy` drop `trailRenderer`; `layer.ts` drops the pass
      and keeps the `missionTrails` visibility entry, slice and switch.
- [ ] `timelineLanes.ts:15` reads the lane colour from `MISSION_TRAIL_ROWS`.
- [ ] The uniform layout (`TRAIL_UNIFORM_OFFSETS`, 144 bytes, `fadeInvKm` at 124, `fadeRelKm` at
      128) and the vertex stride do not change; the parity test moves with the shaders and must
      pass untouched in its assertions.
- [ ] No new test: this task moves code. `tests/conventions/layerImportBoundary.test.ts` must pass
      without a new allow-list row (core imports nothing from `src/layers/missions/`).
- [ ] `grep -rn "missionTrail\|MissionTrail\|mission-trail" src tests tools packages` leaves only
      the missions Layer's own `missionTrails` setting, key, slice, type and `MISSION_TRAIL_ROWS`.
- [ ] Commit.

## Task 3: One track file per body, loaded by its Layer; the builder loses its Voyager steps

**review: yes** (binary files, a saga).

**Files:** `src/layers/missions/trails/load/parseSpacecraftTracks.ts`,
`trails/sagas/loadSpacecraftTracksSaga.ts`, `src/layers/missions/layer.ts`,
`tools/bodies/buildSpacecraftTracks.ts`, `tools/utils/io/writeSpacecraftTracks.ts`,
`tools/missions/buildMissionEvents.ts` (new), `tools/deploy/r2/dataFamilies.ts` (:91-98),
`tools/utils/io/rawDataRegistry.ts` (:2243), `package.json` (:49),
`packages/website/src/data/docsCommands.ts` (:117-118), their tests.

**Contract:**

```ts
// src/services/bodies/parseSampledTracks.ts — the SCTK v1 reader, unchanged in bytes
// src/services/bodies/loadSampledTracksSaga.ts
/** A saga that, after engine-ready, fetches `sampledTrack.<id>.bin` for each id, puts each track
 *  in `trajectoryRegistry` and requests a render. A failed fetch warns and skips that body. */
export function loadSampledTracksSaga(ids: readonly SceneBodyId[]): SagaFactory;

// src/layers/missions/layer.ts
sagas: [loadSampledTracksSaga(MISSION_TRACK_IDS)], // ids of MISSIONS_BODY_ROWS with a sampled position
```

File: `public/data/sampledTrack.<id>.bin`, the existing `SCTK` v1 format holding one track. R2
family `{ label: 'sampled-tracks', match: /^sampledTrack\.[^.]+\.bin$/ }` (same transport and
flags as today's row). npm script `build-sampled-tracks` runs `tools/bodies/buildSampledTracks.ts`,
then `tools/missions/buildMissionEvents.ts`, then `build-data-manifest`.

**Builder:** `buildSampledTracks` loops `HORIZONS_BODIES.filter((b) => b.vectors === 'state')`:
read the CSVs, apply that id's entry in a refinement table if it has one (the Voyagers' DE441
encounter blend, `buildSpacecraftTracks.ts:116-125`), decimate, check, write one file. Assert in the
tool that the filter yields exactly the rows today's `startsWith('voyager')` does.
`buildMissionEvents` takes over `buildSpacecraftTracks.ts:91-109` and `:133-165`.

- [ ] Before changing the tool: fetch the raw Voyager vectors (`npm run fetch-horizons -- voyager1
      voyager2`, then the dense windows via `tools/fetch/fetchVoyagerWindows.ts`), run the tool as
      it stands, and keep its two outputs outside the repo as the reference.
- [ ] After: each new file's samples equal that craft's track in the reference file bit for bit
      (`tDays`, `posKm`, `velKmS`), and `missionEvents.generated.ts` differs from the reference in
      its header comment at most. Report both comparisons in the reply. If the fresh reference
      differs from the committed `missionEvents.generated.ts` (Horizons drift), stop and report.
- [ ] Tests: the parser and saga tests move and rename with their files; the saga test asserts
      one fetch per id and that a failed fetch for one id still loads the other. Use a neutral
      fixture id beside a Voyager one.
- [ ] Do not delete or rewrite `spacecraftTracks.*.bin` in `public/data/`.
- [ ] Commit.

## Task 4: A sampled body's launch is optional

**Files:** `src/@types/missions/SampledBody.d.ts` → `src/@types/scene/SampledBody.d.ts`
(`npm run move-files`), `src/utils/orbit/sampledCraftPositionMpc.ts`, `src/utils/orbit/withLaunchAscent.ts`,
`src/layers/missions/bodies/voyager1.ts`, `voyager2.ts`, their tests.

**Contract:**

```ts
export type SampledBody = {
  readonly id: SceneBodyId;
  /** Absent for a body that was never launched; present, the body rises from `pad` on Earth
   *  between `iso` and the track's first sample. */
  readonly launch?: { readonly iso: string; readonly pad: LonLatDeg };
};
```

- [ ] Test `withLaunchAscent returns the track itself for a body with no launch`.
- [ ] Test `sampledCraftPositionMpc holds a body with no launch on its first sample before the
      track starts` (finite, equal to the first sample's position).
- [ ] The Voyager rows regroup their two fields; their positions before, at and after the join do
      not change (the existing tests cover it).
- [ ] Commit.

## Task 5: Every body can be absent, and a track sets its own window

**review: yes** (frame assembly).

**Files:** `src/utils/scene/spacecraftPresent.ts` → `bodyPresent.ts` (`npm run move-files`, then
`npm run refactor -- rename`), `src/utils/orbit/hermiteTrackAt.ts`,
`src/services/engine/frame/frameContext.ts` (:60, :64, :120),
`src/services/engine/frame/evaluateAssetDemand.ts` (:79), the caption anchor filter
(`resolveAnchors.ts:16,27-29`), `src/services/engine/frame/passes/sampledTrailsPass.ts`, their tests.

**Behaviour of `bodyPresent(id, simDays)`:**

| Body | Absent when |
| --- | --- |
| any row with `presentFromIso` | before it (unchanged) |
| sampled, no track loaded | always (unchanged) |
| sampled, with `launch` | before `launch.iso`, or after the track's last sample |
| sampled, no `launch` | before the track's first sample, or after its last |
| every other body | never |

- [ ] Tests on `bodyPresent`, one per row of the table, with a two-sample fixture track.
- [ ] Test `hermiteTrackAt holds the first sample before the track starts` (finite; today NaN).
- [ ] `frameContext` filters the planet list by `bodyPresent`, as it already filters mesh bodies;
      test `an absent sampled planet is not in the frame's planets`, with a fixture planet-class
      body on a sampled position outside its track.
- [ ] Captions: an anchor is dropped for any absent body, not only for mesh bodies; test
      `a caption anchored on an absent planet is dropped`.
- [ ] The sampled-trails pass skips a row whose body is absent.
- [ ] Left alone: selection and search of an absent body (backlogged).
- [ ] Commit.

## Task 6: Docs

**Files:** `docs/RENDERER.md` (:84-86), `docs/DATA.md` (:219, :287), `src/compositions/README.md`
(rows 17 and 43), `src/layers/README.md` (member table), `docs/BACKLOG.md` (:63, :337),
`docs/backlog/2026-11-05-spacecraft-tracks-hidden-input.md`,
`docs/backlog/2026-10-06-absent-craft-focus-and-palette.md`,
`docs/backlog/2026-10-06-scale-fade-bands-voyager-comment.md`,
`docs/backlog/2026-11-24-sun-trail-gap-after-launch.md`.

- [ ] Names and paths follow the code. RENDERER.md says who owns what: core draws, a Layer hands
      in `guides.sampledTrails` and loads its own bodies' tracks.
- [ ] `docs/backlog/2026-11-05-spacecraft-tracks-hidden-input.md`: the store is now written by
      each Layer's loader; the hidden-input finding itself still stands.
- [ ] No completed plan or spec is edited.
- [ ] Commit.

## Definition of Done

**Deliverables**

- [ ] `LayerGuides.sampledTrails`, `SampledTrailGroup`, `SampledTrailRow`, `state.sampledTrailGroups`.
- [ ] Core pass `'sampled-trails'`, `state.gpu.sampledTrailRenderer`, shaders under `shaders/sampledTrail/`.
- [ ] `loadSampledTracksSaga(ids)`, `parseSampledTracks`, `sampledTrack.<id>.bin` per Voyager,
      `npm run build-sampled-tracks`, `tools/missions/buildMissionEvents.ts`.
- [ ] `SampledBody` under `src/@types/scene/` with an optional `launch`; `bodyPresent`.
- [ ] `src/layers/missions/trails/` holds only the Layer's rows and its `missionTrails` state.

**Smoke pass** (each shot beside the same link on main)

- [ ] Voyager exhibit at Jupiter: one trail, around the planet, fading at its loose end.
- [ ] Voyager exhibit at launch: the trail starts on the pad.
- [ ] Normal mode with `layers=missionTrails`: both Sun-centred trails, full strength.
- [ ] The exhibit's craft switch: the other craft's trail and caption dim.
- [ ] The switch still reads "Mission trails" and toggles the trails.

**Out of scope**

- Asteroid 2026 QQ8 and any sampled body in the body Layer.
- A `selectedOnly` list on the sampled-trail group.
- Focusing or searching an absent body; `trajectoryRegistry` as a module-global store.
- The owner's R2 sync of the new files (after merge, `npm run sync-r2-secure`).
