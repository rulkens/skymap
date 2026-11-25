# Sampled trails as a core service: design spec

> **Status.** Draft, 2026-11-25. Owner: Alexander Rulkens. The owner ruled the shape the same day
> (§2). **Written against** main at d36088137.
> **Scope.** Preparation only: core draws the trails of bodies on sampled tracks, and Layers hand in
> their rows. The asteroid 2026 QQ8 is the next PR (§8).

## 1. Why

Asteroid 2026 QQ8 belongs in the body Layer as a small body, like Bennu, but it moves on a sampled
track, not on orbital elements (owner, 2026-11-25). Today everything a sampled track needs is owned
by the missions Layer: the track file, its loader, the trail pass and renderer. A sampled row must
also carry a launch pad and a launch time, and only a mesh body can be absent at a date.

The owner declined to build the asteroid on top of that, and ruled out one Layer reading another's
settings ("we dont want cross-layer dependencies"). Orbit trails already solve the same problem:
core draws, each Layer hands in its rows and its own switch. Sampled trails take that shape.

## 2. Decisions (owner rulings, 2026-11-25)

1. **QQ8 lives in the body Layer** as a small body on a `sampled` position.
2. **Trail drawing is a core service; Layers hand in rows.** Chosen over a `trajectories` Layer
   (it would have had to read the missions Layer's emphasised craft, or missions read it) and over
   a core "emphasis" setting.
3. **"Mission trails" stays** the missions Layer's switch, with its setting `missionTrails` and the
   link token `layers=missionTrails`. This replaces the earlier ruling of the same day to rename
   them "Trajectories", which belonged to the Layer design.
4. **One track file per body, loaded by the Layer that owns the body.** `spacecraftTracks.bin`
   becomes `sampledTrack.<id>.bin`, with its R2 family and npm script renamed. Core fetches no
   data file: it would name content, and every composition would carry the loader. Cost accepted:
   a re-bake, the owner's R2 sync, one small fetch per body, and tabs left open across the deploy
   lose the Voyager tracks until reloaded.
5. **Past a track's last sample the body is absent.** Today it is held frozen there. For the
   Voyagers this changes the scene after 2099-12-31 only.
6. **Prep is its own PR**, then QQ8. No perf gate.

## 3. The shape after this PR

| Unit | Owns |
| --- | --- |
| core | the track parser and a load helper, the track store, the sampled-trails pass and renderer, the pieces near a planet, interpolation, the invented launch climb, presence |
| `src/layers/missions/` | loading its craft's tracks, its trail rows and colours, the switch "Mission trails", `nearPlanets`, the emphasised craft and its dimming; craft meshes, captions, camera, events, the exhibit |

### 3.1 The contract member (grows the Layer contract; needs the owner's yes)

`LayerGuides` gains one member, beside `orbitTrails` and composed the same way (`createLayers`
binds each group's `show` key to a per-view fade; the core pass walks the groups and declares no
pass-level fade):

```ts
/** src/@types/engine/layer/SampledTrailGroup.d.ts */
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

/** src/@types/engine/layer/SampledTrailRow.d.ts */
export type SampledTrailRow = { readonly id: SceneBodyId; readonly color: Vec3 };
```

The missions Layer hands in:

```ts
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

The trail tint leaves the position row for the trail row: a position says how a body moves, the
trail row how its trail looks. The mission timeline's lane colour reads `MISSION_TRAIL_ROWS`.

Geometry is built for the bodies some group names, once per track-store version, as today.

### 3.2 Names

| Today | After |
| --- | --- |
| `src/layers/missions/trails/**` | core, beside the orbit-trail equivalents (`src/services/gpu/renderers/`, `src/@types/rendering/sampledTrailRenderer/`, `src/services/engine/frame/passes/`, `src/utils/`, `src/data/`) |
| pass `'mission-trails'`, `missionTrailsPass(runtime)` | `'sampled-trails'`, `sampledTrailsPass` |
| `MissionTrailRenderer`, `createMissionTrailRenderer`, `runtime.trailRenderer` | `SampledTrailRenderer`, `createSampledTrailRenderer`, `state.gpu.sampledTrailRenderer` |
| `MissionTrailGeometry`, `MissionTrailFrame`, `CraftTrail` | `SampledTrailGeometry`, `SampledTrailFrame`, `SampledTrail` |
| `buildMissionTrails`, `missionTrailStyle` | `buildSampledTrails`, `sampledTrailStyle` |
| `MISSION_TRAIL_WIDTH_PX`, `MISSION_TRAIL_MAX_SAG_KM` | `SAMPLED_TRAIL_WIDTH_PX`, `SAMPLED_TRAIL_MAX_SAG_KM` |
| shaders `shaders/bodies/missionTrail/`, GPU labels `mission-trail-*` | `shaders/bodies/sampledTrail/`, `sampled-trail-*` |
| `spacecraftTracks.bin`, family `spacecraft-tracks` | `sampledTrack.<id>.bin` (one per body), `sampled-tracks` |
| `loadSpacecraftTracksSaga`, `parseSpacecraftTracks`, `writeSpacecraftTracks` | `loadSampledTracksSaga(ids)` (core helper; a Layer lists it in its `sagas`), `parseSampledTracks`, `writeSampledTracks` |
| `tools/bodies/buildSpacecraftTracks.ts`, `npm run build-spacecraft-tracks` | `tools/bodies/buildSampledTracks.ts`, `npm run build-sampled-tracks` |
| `src/@types/missions/SampledBody` | `src/@types/scene/SampledBody` |
| `spacecraftPresent` | `bodyPresent` |
| `missions/missionCamera/utils/hermiteTrackVelAt` | `src/utils/orbit/hermiteTrackVelAt` |

Stay in missions, under their names: `missionTrails` (setting, visibility key, switch),
`MissionTrailsSettings`, `emphasisDim`, `MISSION_EMPHASIS_DIM`.

Keep their names, already neutral: `NearTrail`, `TrailDraw`, `TrailStay`, `TrailCentre`,
`TRAIL_CENTRES`, `trailDrawsAt`, `trailStaysOf`, `tessellateTrack`, `nearTrailPiece`,
`trackKmToMpc`, `TRAIL_STAY_FADE`, `TRAIL_ENTRY_FADE_REACH`, the file's byte layout and its `SCTK`
magic.

Each file is the existing format holding one track. `loadSampledTracksSaga(ids)` returns a saga
that fetches `sampledTrack.<id>.bin` per id after engine-ready and puts each track in the store;
the missions Layer lists `loadSampledTracksSaga(MISSION_TRACK_IDS)`, the ids of its own sampled
bodies. Core itself starts no fetch.

### 3.3 A sampled body's launch is optional

```ts
/** src/@types/scene/SampledBody.d.ts */
export type SampledBody = {
  readonly id: SceneBodyId;
  /** Absent for a body that was never launched; present, the body rises from `pad` on Earth
   *  between `iso` and the track's first sample. */
  readonly launch?: { readonly iso: string; readonly pad: LonLatDeg };
};
```

Without a launch, `withLaunchAscent` returns the track unchanged and `sampledCraftPositionMpc` never
runs the climb. Rejected: a separate `'launched'` position kind (the greenfield cross-check's first
pick); every reader of `kind === 'sampled'` would have to learn a second kind.

### 3.4 Presence comes from the track

`bodyPresent(id, simDays)` answers for every body:

- before a row's `presentFromIso`: absent (unchanged, mesh bodies);
- a sampled body with no track loaded: absent (unchanged);
- a sampled body before its start or after its last sample: absent. The start is the launch
  instant when the row has one, otherwise the first sample.

The planet list in the frame and the body captions apply it, as mesh bodies already do. A sampled
body's trail draws only while the body is present.

An absent body keeps a finite snapshot position so lookups stay total: `hermiteTrackAt` holds the
first sample before the track and the last sample after it. Today it returns NaN before the first
sample, hidden only by the launch climb in front of it.

Rejected: a "present until" date on the row; it would repeat the track's span and drift on a
re-fetch.

### 3.5 The builder

`buildSampledTracks` builds a track for every `HORIZONS_BODIES` row with `vectors: 'state'`: read,
refine, decimate to 1 km, check, write. The Voyager-only steps leave the loop:

- the encounter blend against DE441 becomes that body's entry in a refinement table keyed by id;
- the launch, flyby and milestone events are written by their own tool,
  `tools/missions/buildMissionEvents.ts`, run by the same npm script.

It writes one file per body. Success: each Voyager file holds the same samples, bit for bit, as
that craft's track in today's `spacecraftTracks.bin`, and `missionEvents.generated.ts` changes in its header comment at most.

## 4. What changes on screen

- A Voyager is absent after 2099-12-31.
- Nothing else: the switch, old links, the Voyager exhibit, trails in normal mode and both tours
  look as before.

## 5. Ground preparation

This PR is the ground preparation for 2026 QQ8. The check ran on 2026-11-25 (ideal diff, a
greenfield cross-check from the requirements alone, owner sign-off, then the owner's ruling against
cross-Layer reads). Its steps are this PR's commits, in order:

1. Layers can hand sampled-trail rows to core (the contract member, composed, no reader yet).
2. Core draws sampled trails; the missions Layer hands in its rows (move and rename).
3. One track file per body, loaded by its Layer; the builder loses its Voyager steps.
4. A sampled body's launch is optional.
5. Every body can be absent, and a track sets its own window.

Verdicts for QQ8 after them: growth at every touchpoint (§8). The cross-check agreed on a shared
owner for file, loader and trail drawing, on the derived window, on the split builder and on the
trail tint leaving the position; it differed on launch (§3.3).

## 6. Not in this PR

- Focusing or searching a body that is absent (`docs/backlog/2026-10-06-absent-craft-focus-and-palette.md`).
- `trajectoryRegistry` as a module-global store (`docs/backlog/2026-11-05-spacecraft-tracks-hidden-input.md`).
- `bodyPositionMpcAt` living under `src/utils/exhibits/mission/`.
- A `selectedOnly` list on the group, as orbit trails have. Added when a Layer needs it.

## 7. Success criteria

- The missions Layer imports nothing that draws or loads tracks, and core imports nothing from
  the missions Layer (`layerImportBoundary` test).
- The Voyager exhibit at Jupiter, trails in normal mode, and the trail from the pad shoot the same
  as on main.
- Each `sampledTrack.<id>.bin` holds the same samples as that track in `spacecraftTracks.bin`.
- A sampled planet-class body with a track from T0 to T1 is absent from the frame's planets and
  from the captions outside [T0, T1] (unit tests on a fixture; no such body ships yet).

## 8. Next: 2026 QQ8

Its own PR on top of this one: a row in `src/layers/body/bodies/smallBodies/`, an entry in
`AUTHORED_ROWS`, a row in `HORIZONS_BODIES`, a row in `planet_facts.seed.json`, and a
`sampledTrails` group in the body Layer's `guides` under a switch that Layer owns, and its id in
the body Layer's own `loadSampledTracksSaga` list. Sphere, glint,
caption, card and search follow from the body row. The loops around Earth are that group's
`nearPlanets`.
