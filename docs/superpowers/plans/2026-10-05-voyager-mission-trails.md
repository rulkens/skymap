# Voyager mission trails — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development under the
> lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Voyager 1 and 2 sit at their JPL positions from launch to 2100, each drawing a trail
that grows with the sim clock, and a Voyager exhibit's timeline jumps the clock to launch,
flybys and heliopause crossings.

**Architecture:** Six behaviour-neutral prep refactors land first (regions from position
drivers, a trajectory registry in the snapshot memo key, a shared `lib::trailOcclusion`, an
exhaustive exhibit-section switch, time in the takeover capture, span/velocity-aware Horizons
fetch rows). The feature adds a `sampled` position driver evaluated by f64 Hermite over an
adaptive sample asset (`spacecraftTracks.bin`, loaded after first paint), one presence
predicate, a `missionTrails` pass drawing a static hi/lo vertex buffer plus a live head vertex,
and a Voyager exhibit with a `timeline` section.

**Tech stack:** TypeScript, WebGPU + WESL, Redux Toolkit + redux-saga, Vitest, tsx tools, the
JPL Horizons API.

**Spec:** `docs/superpowers/specs/2026-10-05-voyager-mission-trails-design.md`

## Global constraints

- **Accuracy:** craft position ≤ **1 km** from the dense Horizons fetch after decimation
  (Hermite reconstruction); trail chord sag ≤ **10 km**; hi/lo reconstruction ≤ **1 km** at 160 AU.
- **Horizons query** for craft: `COMMAND='-31'` / `'-32'`, `CENTER='500@10'`,
  `REF_PLANE='FRAME'`, `TIME_TYPE='UT'`, `OUT_UNITS='KM-S'`, `CSV_FORMAT='YES'`, `VEC_TABLE='2'`
  (state: position + velocity). Span: first available instant after launch → `2100-01-01`.
  Dense windows: 1 min within ±2 d, 1 h within ±60 d of each encounter date, 1 d elsewhere.
  Encounter dates (window centres, cited): V1 Jupiter 1979-03-05, Saturn 1980-11-12;
  V2 Jupiter 1979-07-09, Saturn 1981-08-26, Uranus 1986-01-24, Neptune 1989-08-25.
  Heliopause (cited literals): V1 2012-08-25, V2 2018-11-05.
- **Time unit:** `tDays` is a UT Julian date — the unit of `deriveBodyStates(simDays)`
  (`CONST_J2000 = 2451545.0`, `src/data/time/constJ2000.ts:27`). Never TDB.
- **Presence:** present ⇔ track loaded AND `simDays ≥ tDays[0]`. Not present ⇒ the snapshot
  state is Earth's position (never a missing entry — 22 sites do `states.get(id)!`). After the
  last sample: held at it.
- **Planet/moon outputs unchanged** by P6: regenerated `ephemerisCorrections.generated.ts` is
  byte-identical; existing raw CSVs untouched.
- **Conventions:** one symbol per `utils/` and `@types/` file; `type`, never `interface`; frame
  and pass files export only their one symbol (`frameFilePurity` ratchet — put this line in
  every brief); TS moves via `npm run move-files -- <from> <to>` (`--dry` first), never `git mv`;
  raw-data paths via `tools/utils/io/rawDataRegistry.ts`; briefs say `npx prettier --write`,
  never `npm run format`.
- **Branches:** never commit on `main`. **Prep (Tasks 1–6)**: branch `mission-trails-prep` off
  `main`, spec + plan committed there first, one commit per task, PR with base `main`.
  **Feature (Tasks 7–12)**: branch `mission-trails` stacked on the prep branch; stacked PRs get
  no GitHub CI — local gate `npm run typecheck` + `npm test`.

## Review focus

1. **A deep link to a craft before launch or before the asset loads** (`#focus=body-voyager1&t=1970-01-01T00:00:00Z`).
   No throw; the craft is not drawn, labelled or pickable; the camera frames Earth. Tested in
   Task 9 (presence) and Task 8 (state exists before load).
2. **A clip, tour or exhibit exited while the clock was `live`.** The clock comes back live at
   the real now, not frozen at the capture instant. Tested in Task 5.
3. **Scrubbing backwards through a flyby with trails on.** The trail shrinks with no rebuild;
   the head stays on the mesh. Tested in Task 10 (`k` and head vertex).
4. **A sample-asset fetch that fails or 404s.** The craft stays absent, nothing throws, the rest
   of the scene loads. Tested in Task 9.
5. **The asset arriving while the clock is paused.** The craft appears without a clock change.
   Tested in Task 2 (version invalidates the memo) and Task 9.

---

## PR 1: prep (`mission-trails-prep`)

### Task 1: Region membership from the position drivers (P1)

**Files:** `src/data/bodies/bodyRegions.ts` (modify), `src/utils/regions/regionOfBody.ts`
(modify only if its doc changes), `tests/data/bodies/bodyRegions.test.ts` (modify)

**Behaviour:** membership walks `POSITION_DRIVERS` and follows `bodyHostId`
(`positionDrivers.ts:44-55`) to the root, replacing the `ORBITAL_ELEMENTS`/`focusRootId` walk
(`bodyRegions.ts:36-44`) and the `SURFACE_FIXED_SITES` special case (`:50-58`). The extent test
(`boundsExtent`, `:77-80`) becomes one predicate `isUnbound(driver: PositionDriver): boolean`
(today: `kind === 'orbit' && elements.e > 1`) — kept local to the file unless a second caller
appears.

- [ ] Add test `every position driver belongs to exactly one region` (iterate
      `POSITION_DRIVERS`, assert `regionOfBody(id) !== null`).
- [ ] Add test `region membership is unchanged` — snapshot today's `{ regionId: memberIds[] }`
      before the change and assert equality after.
- [ ] Implement; `npm test -- bodyRegions regionOfBody` green; commit.

### Task 2: Trajectory registry in the snapshot memo key (P2)

**Files:** `src/services/bodies/trajectoryRegistry.ts` (create — or the nearest existing
module-state home under `src/services/`; one export object), `src/@types/scene/SampledTrack.d.ts`
(create), `src/services/engine/frame/deriveBodyStates.ts` (modify `:44-49`),
`tests/services/engine/frame/deriveBodyStates.test.ts` (modify)

**Contract:**
```ts
// src/@types/scene/SampledTrack.d.ts
export type SampledTrack = {
  readonly id: string;
  readonly tDays: Float64Array;  // UT Julian date, ascending, n
  readonly posKm: Float64Array;  // 3n, Sun-centred, equatorial (ICRF)
  readonly velKmS: Float32Array; // 3n
};
// trajectoryRegistry
export const trajectoryRegistry: {
  get(id: string): SampledTrack | undefined;
  set(track: SampledTrack): void;   // bumps version
  version(): number;
};
```
`deriveBodyStates` memoizes on `(simDays, trajectoryRegistry.version())`. Empty in prep — no
behaviour change.

- [ ] Add test `a registry version bump recomputes the snapshot at the same simDays` (call twice
      with the same `simDays`, `set` a dummy track between, assert a new Map identity).
- [ ] Implement; tests green; commit.

### Task 3: Extract `lib::trailOcclusion` (P3) — review: yes

**Files:** `src/services/gpu/shaders/lib/trailOcclusion.wesl` (create),
`src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl` (modify `:17-52,:94-114`),
`src/services/gpu/renderers/bodies/orbitTrailRenderer.ts` (modify `:65-109,:208-218`),
`src/services/gpu/renderers/trailOcclusionUniforms.ts` (create — the TS packer; pick the folder
beside other shared uniform packers if one exists), the orbit-trail parity test
(`orbitTrailConstants.parity.test.ts`, modify)

**Behaviour:** the occluder-sphere struct, `sphereClearance`, and the sphere-loop + depth test
move to the lib module as functions taking the uniform block and fragment inputs; the TS packer
owns the block's byte layout and writes it from `sceneOccluderSpheres` + the depth binding
inputs the pass already gathers (`orbitTrailsPass.ts:168-169`). Orbit-trail pixels unchanged.

- [ ] Move the layout constants to the packer; the parity test asserts the WGSL struct and the
      packer agree byte-for-byte (offsets, stride, size).
- [ ] `npm run typecheck` + `npm test -- orbitTrail`; visual: orbit trails still occlude behind
      planets (`http://localhost:5176/#focus=body-saturn&t=1980-11-12T23:46:00Z`, trails on).
- [ ] Commit.

### Task 4: Exhaustive exhibit section dispatch (P4)

**Files:** `src/components/ExhibitOverlay/ExhibitNoteSection.tsx` (modify `:25-129`),
`src/components/ExhibitOverlay/ExhibitOverlay.tsx` (modify `:64`)

**Behaviour:** `switch (section.kind)` with one case per `ExhibitSection` arm and a `never`
default (`const unreachable: never = section`); the second branch at `ExhibitOverlay.tsx:64`
routes through the same switch or asks a per-kind predicate. Rendering unchanged. No new test
(tsc is the check).

- [ ] Implement; typecheck; commit.

### Task 5: Time joins the takeover scene capture (P5) — review: yes

**Files:** `src/@types/engine/settings/SceneSnapshot.d.ts` (modify),
`src/state/scene/captureScene.ts` (modify `:35-41`), `src/state/scene/restoreSceneSaga.ts`
(modify `:58-62`), `src/state/time/timeSlice.ts` (add one reducer if needed),
`src/state/clips/watchClipSaga.ts` (or wherever the clip's own clock restore lives — delete it
if it becomes a pure duplicate, else leave it and note in the ledger),
`tests/state/scene/restoreSceneSaga.test.ts`, `tests/state/takeover/withSceneSnapshotSaga.test.ts`

**Contract:**
```ts
export type SceneSnapshot = Readonly<{
  settings: SettingsSnapshot;
  orientation: OrientationFrameId;
  focus: SelectionRef | null;
  time: TimeState;   // captured verbatim
}>;
```
**Restore semantics** (one reducer `restoreTime({ time, nowMs })` or the existing actions):
- `mode: 'live'` → back to live at the real now (`goLive` with the current wall-clock JD), with
  the captured `rateIndex`/`direction`/`paused`.
- `mode: 'manual'` → the sim instant derived from the capture at capture time
  (`deriveSimDays(captured, capturedNowMs)`), re-anchored at the restore `nowMs`, with the
  captured rate, direction and paused flag. Store `capturedNowMs` beside the time, or capture the
  derived `simDays` — implementer's choice, stated in the report.

- [ ] Test `exit restores a manual paused clock to its captured instant`.
- [ ] Test `exit restores a live clock to live at the real now` (advance a fake wall clock
      between capture and restore; assert `mode === 'live'` and the anchor tracks the new now).
- [ ] Test `exit restores rate and direction changed inside the takeover`.
- [ ] Implement; `npm test -- scene takeover time clip`; commit.

### Task 6: Horizons fetch rows with span and state vectors (P6) — review: yes

**Files:** `tools/bodies/@types/HorizonsBody.d.ts` (modify), `tools/bodies/horizonsBodies.ts`
(modify), `tools/fetch/fetchHorizons.ts` (modify `:21-26,:61-65,:98-107`),
`tools/parsers/horizonsVectorsCsv.ts` (modify `:21-26`), `tools/bodies/buildEphemerisCorrections.ts`
(modify `:89,:158`), `data/raw/horizons/README.md`, tests under `tests/tools/...` mirroring each

**Contract:**
```ts
export type HorizonsBody = {
  id: string;                 // scene body id
  target: string;             // Horizons COMMAND
  centre: string;             // e.g. '500@10'
  span: readonly [startIso: string, stopIso: string];
  stepMinutes: number;        // base step; dense windows are a fetch-call argument (Task 7)
  vectors: 'position' | 'state';  // VEC_TABLE '1' | '2'
};
```
The correction fit iterates its own list of fitted ids (the planet + moon ids it fits today),
not every fetch row. The CSV gains `vx_kms,vy_kms,vz_kms` columns only for `vectors: 'state'`;
the parser returns velocities when present. Chunks are cut from each row's `span` (≤ 89k rows
each, whole-minute steps, as today).

- [ ] Test: chunking a row with span 1977-09-05 → 2100-01-01 yields no chunk before the start.
- [ ] Test: the parser reads a 7-column state CSV fixture and a 4-column position fixture.
- [ ] Run `npm run build-ephemeris-corrections` is NOT required (50 min); instead assert the
      fit's id list equals today's `HORIZONS_BODIES` ids and that the existing raw CSV paths are
      unchanged. Commit.
- [ ] Open the prep PR (base `main`), watch CI.

---

## PR 2: feature (`mission-trails`, stacked)

### Task 7: Fetch Voyager and build the track asset — review: yes

**Files:** `tools/bodies/horizonsBodies.ts` (two rows), `tools/fetch/fetchHorizons.ts` (dense
windows argument), `tools/bodies/buildSpacecraftTracks.ts` (create),
`tools/utils/math/decimateHermiteSamples.ts` (create), `tools/utils/math/closestApproach.ts`
(create), `tools/utils/io/writeSpacecraftTracks.ts` (create),
`src/utils/orbit/parseSpacecraftTracks.ts` (create), `src/data/missions/missionEvents.generated.ts`
(generated), `src/@types/missions/MissionEvent.d.ts` (create),
`tools/deploy/r2/allowDataFile.ts` (one basename), `package.json` (`build-spacecraft-tracks`
script, chained with `build-data-manifest`), `tools/utils/io/rawDataRegistry.ts`, `docs/DATA.md`
(refresh order), tests mirroring each util

Read `docs/DATA.md` first.

**Binary format `public/data/spacecraftTracks.bin`** (little-endian):

| Offset | Type | Field |
|---|---|---|
| 0 | `u8[4]` | magic `SCTK` |
| 4 | `u32` | version = 1 |
| 8 | `u32` | track count T |
| 12 | per track: `u32` idLen, `u8[idLen]` UTF-8 id, pad to 4, `u32` n | track table |
| aligned to 8 | per track in table order: `f64[n]` tDays, `f64[3n]` posKm, `f32[3n]` velKmS (pad each track's block to 8) | columns |

**Contracts:**
```ts
// tools — keep sample i only if Hermite over its kept neighbours misses it by > tolKm
decimateHermiteSamples(t: Float64Array, pos: Float64Array, vel: Float32Array, tolKm: number): Uint32Array  // kept indices
closestApproach(craft: {t; pos}, target: {t; pos}): { jd: number; distanceKm: number }
writeSpacecraftTracks(tracks: readonly SampledTrack[]): Uint8Array
// src
parseSpacecraftTracks(buf: ArrayBuffer): SampledTrack[]   // throws on bad magic/version
// generated
export const MISSION_EVENTS: readonly MissionEvent[];
export type MissionEvent = { bodyId: string; kind: 'launch' | 'flyby' | 'heliopause'; iso: string; label: string };
```
The build reads the raw state CSVs (dense windows merged with the base daily series, duplicates
dropped), decimates at 1 km, finds each flyby's closest approach against the target's Horizons
vectors (fetch the targets' `500@10` positions over each ±2 d window at 1 min if not already
raw), writes the `.bin` and `missionEvents.generated.ts`, and prints samples, bytes and worst
reconstruction error per track. Throw if any reconstruction error exceeds 1 km.

- [ ] Test `decimateHermiteSamples keeps the reconstruction within tolerance` on a synthetic
      hyperbolic flyby (analytic, 1-min dense) — max error ≤ tol, and fewer samples kept than given.
- [ ] Test `closestApproach finds the minimum of a synthetic flyby` to 1 minute.
- [ ] Test `parseSpacecraftTracks round-trips writeSpacecraftTracks` (two tracks, odd n) and
      `throws on a wrong magic`.
- [ ] Run `npm run fetch-horizons` for the two craft rows + flyby targets, then
      `npm run build-spacecraft-tracks`; record the printed sizes in the report (expect ~2k
      samples, ~88 kB). Titan closest approach for V1 should land 1980-11-12 ~05:4x UTC at
      ~6,490 km (sanity check, not a test).
- [ ] Commit (raw CSVs stay under `data/` per the registry, not committed if gitignored; the
      `.bin` follows the existing public/data convention — check `docs/DATA.md`).

### Task 8: The `sampled` position driver — review: yes

**Files:** `src/@types/scene/PositionDriver.d.ts` (new arm), `src/data/missions/spacecraftBodies.ts`
(create `SAMPLED_BODIES`), `src/data/bodies/positionDrivers.ts` (spread the new table; `bodyHostId`
case → `'sun'`), `src/utils/orbit/hermiteTrackAt.ts` (create),
`src/services/engine/frame/deriveBodyStates.ts` (new phase after 1b), `src/data/bodies/bodyRegions.ts`
(`isUnbound` → `kind === 'sampled'` only), deletions below, `tests/fixtures/bodyStatesJ2000.json`
(regen), tests

**Contracts:**
```ts
| { readonly kind: 'sampled'; readonly id: string; readonly focusId: 'sun' }   // PositionDriver arm
export const SAMPLED_BODIES: readonly { readonly id: string }[];               // voyager1, voyager2
hermiteTrackAt(track: SampledTrack, tDays: number): Vec3d   // km; clamps past the end; caller guarantees tDays ≥ tDays[0]
```
Phase: for each `SAMPLED_BODIES` row — track present and `simDays ≥ tDays[0]` → Hermite (f64)
→ `× KM_TO_MPC` → `+ sun position`; otherwise Earth's state position. No `orbit` field.

**Delete:** `voyager1/2` rows (`orbitalElements.ts:795-823`), `src/data/bodies/makers/probe.ts`,
`hyperbolicPositionMpc` + the `e > 1` branch of `keplerianPositionMpc` if no caller remains (grep),
the hyperbola half of `isUnbound`. Keep every other per-id row (mesh seeds, rotation `lookAt
earth`, search names, facts, featured tabs) — re-check `featuredTabs.ts:39-61,145-150,348-361`
captures still resolve.

- [ ] Test `hermiteTrackAt reproduces samples exactly and an analytic arc between them`.
- [ ] Test `hermiteTrackAt clamps past the last sample`.
- [ ] Test `a craft with no track sits at Earth's position`; `a craft before its first sample
      sits at Earth's position`.
- [ ] Test `Voyager 1 at Titan closest approach is within 1,000 km of Horizons` — load the real
      `.bin` (or a fixture slice of it) into the registry; compare to a Horizons fixture point
      (add to `tests/fixtures/`).
- [ ] Regenerate `bodyStatesJ2000.json` (Voyager now = Earth's position at J2000, pre-launch).
- [ ] `npm run typecheck` (exhaustive `bodyHostId` flags any missed switch) + full suite; commit.

### Task 9: Load the asset and gate presence — review: yes

**Files:** `src/state/missions/loadSpacecraftTracksSaga.ts` (create; register in the root saga),
`src/utils/scene/spacecraftPresent.ts` (create), `src/services/engine/frame/sceneBodyPartition.ts`
(filter its mesh-body input), `src/services/engine/presentation/sceneBodyLabels.ts` (`:109`
filter), tests

**Contracts:**
```ts
spacecraftPresent(id: string, simDays: number): boolean   // true for every non-sampled id
```
The saga fetches via `dataUrl('spacecraftTracks.bin')` after first paint (follow the
`constellationsFetcher.ts:23-55` pattern), parses, `trajectoryRegistry.set` each track, and
requests a render wake if the frame loop needs one (check how other late loads wake a paused
frame — render-wake is dep-only, see the renderer landmine). On fetch/parse failure: log once,
leave the registry empty. The pick table (`BODY_PICK_ROWS`, `SCENE_MESH_BODIES` indexing in
`meshBodiesPass.ts:137`, `bodySelectionRow.ts:33`) stays unfiltered so pick ids do not shift.

- [ ] Test `an absent craft is in neither glints nor meshes and has no label`; `a present craft is`.
- [ ] Test `a failed track fetch leaves the craft absent and does not throw` (saga test).
- [ ] Test `a track arriving while paused shows the craft` (saga sets the registry; next
      snapshot at the same simDays has the Hermite position).
- [ ] Commit.

### Task 10: Mission trails pass — review: yes

Read `docs/RENDERER.md` first.

**Files:** `src/services/engine/frame/passes/missionTrailsPass.ts` (create; register beside
`orbitTrailsPass` in the HDR / NEAR0 step), `src/services/gpu/renderers/bodies/missionTrailRenderer.ts`
(create), `src/services/gpu/shaders/bodies/missionTrail/{vertex,fragment,io}.wesl` (create),
`src/utils/orbit/tessellateTrack.ts` (create), `src/utils/math/splitF64HiLo.ts` (create),
`src/data/missions/missionTrailStyle.ts` (create: per-craft colour, width px), tests

**Contracts:**
```ts
tessellateTrack(track: SampledTrack, maxSagKm: number): { tDays: Float64Array; posKm: Float64Array }  // Hermite-subdivided until chord sag ≤ maxSagKm (10)
splitF64HiLo(v: Float64Array): { hi: Float32Array; lo: Float32Array }   // hi = f32(v), lo = f32(v - hi)
```
| Vertex attribute | Format | Offset |
|---|---|---|
| `posHi` | `float32x3` | 0 |
| `posLo` | `float32x3` | 12 |
| stride | | 24 |

Uniforms: `camHi: vec3f`, `camLo: vec3f`, view-projection of the camera-relative frame, colour
(linear HDR), width px, viewport, plus the `lib::trailOcclusion` block. Vertex: `rel = (posHi −
camHi) + (posLo − camLo)`, then `lib::segmentQuad`'s `expandSegmentQuad`; near-plane clip per
segment as the other segment shaders do. Vertices are world Mpc (Sun position + km × KM_TO_MPC),
built when `trajectoryRegistry.version()` changes. Per frame per present track: `k` = count of
tessellated `tDays ≤ simDays` (binary search), draw segments `[0, k)` plus one to a head vertex
written from the snapshot position. Drawn when the orbit-trails setting is on.

- [ ] Test `tessellateTrack keeps chord sag within tolerance` on a synthetic arc.
- [ ] Test `splitF64HiLo reconstructs within 1 km at 160 AU` (in Mpc).
- [ ] Test `draw count k is the number of vertices at or before simDays` (pure helper if the pass
      needs one; frame-file purity: put it in `src/utils/`).
- [ ] Test layout parity: WGSL `io.wesl` vertex struct vs the renderer's attribute table.
- [ ] Visual (deep links in DoD); commit.

### Task 11: Voyager exhibit and timeline section — review: yes

**Files:** `src/@types/exhibits/ExhibitTimelineSection.d.ts` (create), `src/@types/exhibits/ExhibitSection.d.ts`
(add arm), `src/components/ExhibitOverlay/ExhibitTimeline.tsx` (create, + its css module if the
overlay uses them), `src/components/ExhibitOverlay/ExhibitNoteSection.tsx` (new case),
`src/data/exhibits/voyager.ts` (create), `src/data/exhibits/exhibitRegistry.ts` (row), tests

**Contracts:**
```ts
export type ExhibitTimelineSection = {
  readonly kind: 'timeline';
  readonly fromIso: string;                     // '1977-08-20'
  readonly events: readonly MissionEvent[];     // MISSION_EVENTS
};
```
The timeline spans `fromIso` → the wall-clock now; its thumb reads the derived sim day; drag
dispatches `setSimDays({ simDays, nowMs })`; a tick click dispatches the same for the event's
instant (rate and play state untouched; camera untouched). The exhibit turns orbit trails on
(as `solarSystem.ts` does) and frames the outer solar system; notes cite Horizons and the
heliopause sources. Exit restore comes from Task 5.

- [ ] Test `a tick click sets the clock to the event instant without pausing`.
- [ ] Test `the thumb position follows the sim day` (pure mapping helper in `src/utils/`).
- [ ] Commit.

### Task 12: Docs, backlog, close-out

**Files:** `docs/DATA.md`, `docs/BACKLOG.md` + `docs/backlog/2026-10-05-*.md` (three adjacent
items: `scaleFadeBands.ts:166` Voyager comment, `narrowMat4` per-frame allocation, atmosphere
shell depth-sampling duplication — plus `watchClipSaga` clock restore if Task 5 kept it),
`src/services/engine/presentation/scaleFadeBands.ts` comment only if trivially wrong now.

- [ ] Write the backlog lines + detail files; commit.
- [ ] R2 sync of `spacecraftTracks.bin` is the user's step before merge — say so in the PR body.

## Definition of Done

**Deliverables**
- [ ] `public/data/spacecraftTracks.bin` + manifest entry + R2 allow-list row;
      `npm run build-spacecraft-tracks`; `MISSION_EVENTS` generated.
- [ ] `sampled` `PositionDriver` arm; `SAMPLED_BODIES`; `trajectoryRegistry`; `spacecraftPresent`.
- [ ] `missionTrailsPass` + `missionTrail` shaders; `lib::trailOcclusion` shared with orbit trails.
- [ ] Voyager exhibit with a `timeline` section; `SceneSnapshot.time`.
- [ ] Voyager hyperbola rows, `probe.ts` (and dead hyperbola code) deleted.

**Smoke** (server :5176, orbit trails on):
- [ ] Titan flyby — V1 mesh skims Titan, trail bends through the encounter:
      `http://localhost:5176/#focus=body-voyager1&t=1980-11-12T05:41:00Z`
- [ ] Saturn closest approach, V1: `http://localhost:5176/#focus=body-voyager1&t=1980-11-12T23:46:00Z`
- [ ] Neptune, V2 — trail drawn from 1977 through four planets:
      `http://localhost:5176/#focus=body-voyager2&t=1989-08-25T03:56:00Z`
- [ ] Before launch — no craft, no label, no trail, no throw:
      `http://localhost:5176/#focus=body-voyager1&t=1977-01-01T00:00:00Z`
- [ ] Exhibit — ticks jump the clock, camera stays; exit restores the clock:
      `http://localhost:5176/#exhibit=voyager`
- [ ] Scrub backwards through a flyby: trail shrinks, head stays on the mesh.

**Out of scope:** other spacecraft, trail fade or time window, camera following the timeline,
a heliopause surface, New Horizons.
