# Voyager mission trails — design spec

The goal of the brainstorm that began 2026-09-28: show the whole Voyager 1 and 2 missions —
each craft at its true position from launch to 2100, a trail that grows behind it with the sim
clock, and a Voyager exhibit whose timeline jumps the clock to launch, each flyby and the
heliopause crossings. Its two prerequisites have shipped: accurate planets (#834/#835) and
accurate moons (#843/#846) put every flyby target within 1,000 km of JPL over 1900–2100, so the
flybys read correctly against them. Starship was dropped.

## 1. What this is

- **Sampled trajectories.** Voyager 1 and 2 (`voyager1`, `voyager2`) take their positions from
  JPL Horizons state vectors (NAIF −31/−32), relative to the Sun's centre, in the equatorial
  frame, on UT. A new `sampled` position-driver kind evaluates them as cubic Hermite in f64. The
  craft's mesh, its trail head, its label and picking all read the one snapshot state. The
  hyperbolic element rows and the `probe` maker are deleted.
- **Adaptive samples, a fetched asset.** Fetched densely (1 min within ±2 d of each closest
  approach, 1 h within ±60 d, 1 d elsewhere) and decimated at build time, keeping a sample only
  where Hermite from its neighbours misses by more than 1 km. Estimate ~2,000 samples for both
  craft, ~88 kB raw (unmeasured; the tool reports it). It ships as
  `public/data/spacecraftTracks.bin` through the data manifest and R2, loaded after first paint.
  Nothing is bundled.
- **Presence.** A craft is shown only once its track has loaded and the clock is at or after
  its first sample. While not present its state still exists — it sits at Earth's position — so
  no lookup ever misses; one predicate hides it from drawing, picking, labels and the trail.
  After the last sample (2100) it holds there.
- **Trail.** A new `missionTrails` pass with its own shader draws each track from launch up to
  now. The vertex buffer is built once per load (Hermite tessellated until the chord sags less
  than 10 km), stored as hi/lo f32 pairs and drawn camera-relative against a hi/lo camera
  uniform; each frame draws the vertices before `now` (binary search) plus one head vertex at
  the snapshot position, so the trail meets the mesh exactly and scrubbing back only shrinks the
  draw range. Quads come from `lib::segmentQuad`; per-pixel occlusion from `lib::trailOcclusion`,
  shared with the orbit trails. HDR target, constant pixel width, the craft's palette colour.
- **Voyager exhibit.** A new exhibit with a `timeline` section: a scrubbable 1977 → today
  track with event ticks — launch, each flyby's closest approach, the heliopause crossings.
  Dragging sets the sim day; clicking a tick jumps the clock to it, keeping the current rate
  and play state. The camera does not move. Leaving the exhibit restores the clock as it was
  on entry, through the generic takeover capture.

**Rulings** (2026-10-03 brainstorm, re-checked 2026-10-05 in asks YNA7 and the follow-up):
absent until loaded, no bundled seed · adaptive position+velocity samples · static hi/lo trail
buffer plus a live head vertex · clock restore through the takeover capture · a fallback
position (Earth) rather than a missing state, to keep the change small · one prep PR, then the
feature PR.

**Out of scope:** other spacecraft (each would be one more fetch row, track and body; no
per-craft code), a trail fade or time-window, the camera following the timeline, a heliopause
surface (the heliosphere effort owns that), New Horizons (no public-domain mesh).

## 2. Ground preparation

Refactor-ground ran 2026-10-03 and again 2026-10-05 against main `ae76753a4`: a joint re-check
of the old prep list on current code, a greenfield cross-check from the requirements alone, and
a scoping pass over every body-state lookup. The user signed off the shape (ask YNA7).

| Touchpoint | Verdict | Seam / blocker |
|---|---|---|
| Region membership (`bodyRegions.ts:36-58`) | **bolt-on → P1** | walks `ORBITAL_ELEMENTS` (+ a sites special case); a body with no element row joins no region and `regionOfBody` returns null (`regionOfBody.ts:13`). Unbound test is phrased `orbit && e>1` (`:77-80`) |
| Snapshot cache (`deriveBodyStates.ts:44-49`) | **bolt-on → P2** | memo keyed on `simDays` alone; a track arriving while paused would never show |
| Trail occlusion (`orbitTrail/fragment.wesl:43-52,94-114`, `orbitTrailRenderer.ts:65-109,208-218`) | **bolt-on → P3** | inline in the one trail shader and renderer; a second trail would copy both |
| Exhibit sections (`ExhibitNoteSection.tsx:25-129`, `ExhibitOverlay.tsx:64`) | **bolt-on → P4** | if-chain whose fallback renders `sources`; a `timeline` kind would render as a sources list with no compile error |
| Takeover capture (`captureScene.ts:35-41`, `restoreSceneSaga.ts:58-62`) | **bolt-on → P5** | the snapshot holds settings, orientation and focus, not time |
| Horizons fetch (`fetchHorizons.ts:21,65,105`, `buildEphemerisCorrections.ts:89,158`) | **bolt-on → P6** | fixed 1900–2100 chunks (no −31 data before 1977), positions only, and the fit loop calls `elementsById` on every row |
| Snapshot phases (`deriveBodyStates.ts:57-123`) | growth | one phase per driver table (anchors, elements, sites); `sampled` is a fourth table and phase, after elements so Earth is resolved |
| `PositionDriver` + `bodyHostId` (`positionDrivers.ts:16-55`) | growth | exhaustive switch; tsc points at the new arm |
| Presence (`sceneBodyPartition.ts`, `sceneBodyLabels.ts:109`) | growth | the partition already feeds glints, mesh draw and pick draw; labels are the one other list |
| Data asset (`buildDataManifest.ts`, `allowDataFile.ts:22-40`, `dataUrl`) | growth | `constellations.json` precedent; one allow-list row |
| Trail quads (`lib/segmentQuad.wesl`) | growth | already shared by three shaders |

**Prep (one PR, one commit each, no behaviour change):**

- **P1 — regions from the drivers.** Membership follows `bodyHostId` over `POSITION_DRIVERS`
  to the root, so every driver kind joins a region; the sites special case goes. The extent
  test becomes one predicate on the driver ("unbound": a hyperbolic orbit today, `sampled`
  later).
- **P2 — trajectory registry.** A module owning loaded tracks by id with a version counter
  (empty in prep); `deriveBodyStates` memoizes on `(simDays, tracksVersion)`.
- **P3 — `lib::trailOcclusion`.** The occluder-sphere and depth test move to a WESL lib module
  plus one TS packer for its uniform block; the orbit-trail shader and renderer use them; the
  layout parity test follows.
- **P4 — exhaustive section dispatch.** `ExhibitNoteSection` switches on `kind` with a `never`
  default; `ExhibitOverlay.tsx:64` goes through it.
- **P5 — time in the takeover capture.** `SceneSnapshot` gains the time state; restore
  re-anchors it to `nowMs`. Every takeover (exhibits, tours, clips) now restores the clock it
  found. `watchClipSaga`'s own clock restore becomes redundant — deleted here if it is a pure
  duplicate, else backlogged.
- **P6 — Horizons fetch rows.** Fetch rows carry their own span and vector kind (positions, or
  positions + velocities, Horizons `VEC_TABLE 2`); the parser and CSV widen to optional
  velocity columns; the correction fit runs over its own list of fitted ids instead of every
  fetch row. Planet and moon outputs are byte-identical.

**Adjacent, backlogged:** the `scaleFadeBands.ts:166` comment assumes "a Voyager for two
centuries"; `narrowMat4` per-frame allocation; atmosphere shell depth-sampling duplication.

## 3. Data shapes

```ts
// src/@types/scene/PositionDriver.d.ts — new arm
| { kind: 'sampled'; id: string; focusId: 'sun' }

// src/@types/scene/SampledTrack.d.ts
export type SampledTrack = {
  id: string;
  tDays: Float64Array;   // UT Julian date (the unit of deriveBodyStates' simDays), ascending
  posKm: Float64Array;   // 3n, Sun-centred, equatorial
  velKmS: Float32Array;  // 3n
};

// src/data/missions/spacecraftBodies.ts — the sampled-driver table
export const SAMPLED_BODIES = [{ id: 'voyager1' }, { id: 'voyager2' }] as const;

// src/@types/exhibits/ExhibitSection.d.ts — new arm
| { kind: 'timeline'; fromIso: string; events: readonly MissionEvent[] }

// src/@types/missions/MissionEvent.d.ts
export type MissionEvent = { bodyId: string; kind: 'launch' | 'flyby' | 'heliopause'; iso: string; label: string };
```

**`spacecraftTracks.bin`** (little-endian): magic `SCTK`, `u32` version, `u32` track count;
per track a `u32` id length + UTF-8 id (padded to 4) + `u32` sample count; then per track the
columns `tDays` f64[n], `posKm` f64[3n], `velKmS` f32[3n] (f64 columns 8-aligned). Position is
f64 because f32 at 160 AU resolves ~1,400 km; velocity f32 costs ~0.1 mm over a 60 s step.

**Events** — `src/data/missions/missionEvents.generated.ts`: flyby times are closest approach
found by the build tool on the dense fetch (minimum craft–target distance, to the minute);
launch dates and heliopause crossings (V1 2012-08-25, V2 2018-11-05) are cited literals in the
tool source.

## 4. Runtime

- **`deriveBodyStates`** — a fourth phase after elements: for each `SAMPLED_BODIES` row, if the
  registry holds its track and `simDays ≥ tDays[0]`, binary-search the segment, Hermite in f64,
  clamp past the end, km → Mpc, add the Sun's position. Otherwise the state is Earth's position.
  No `orbit` is set (the orbit-trail pass never sees these ids).
- **Presence** — `spacecraftPresent(id, simDays)` (registry has the track, `simDays ≥ t0`); one
  filter on the mesh-body input of `sceneBodyPartition` (covers glints, mesh draw, pick draw —
  the pick table itself stays unfiltered so pick ids don't shift) and on the mesh-body list in
  `sceneBodyLabels.ts:109`. Focusing an absent craft frames Earth; allowed.
- **Loading** — a load saga fetches `spacecraftTracks.bin` via `dataUrl` after first paint,
  parses it, registers each track (bumping the version). A failed fetch leaves the craft absent.
- **`missionTrailsPass`** — in the HDR / NEAR0 step beside orbit trails; one draw per present
  track; vertex buffer rebuilt only when the tracks version changes; per frame: `k` by binary
  search on `simDays`, the head vertex written from the snapshot, camera hi/lo uniform.
- **Exhibit** — `voyager` row in `exhibitRegistry.ts` with notes and the `timeline` section;
  the timeline component reads `simDays` for its thumb and dispatches `setSimDays` (drag, tick).
- **Deleted** — `voyager1/2` rows in `orbitalElements.ts:795-823`, `makers/probe.ts`,
  `hyperbolicPositionMpc` and the e>1 branch of `keplerianPositionMpc` if nothing else uses
  them, and the hyperbola half of P1's unbound predicate.

## 5. Tools

- Two `HORIZONS_BODIES` fetch rows: `{ id: 'voyager1', target: '-31', centre: '500@10', span:
  [launch, 2100-01-01], vectors: 'state' }`, likewise −32. The dense windows centre on cited
  encounter dates (V1: Jupiter 1979-03-05, Saturn 1980-11-12; V2: Jupiter 1979-07-09, Saturn
  1981-08-26, Uranus 1986-01-24, Neptune 1989-08-25). Raw CSVs under
  `data/raw/horizons/500@10/` through `rawDataRegistry`.
- `npm run build-spacecraft-tracks` (`tools/bodies/buildSpacecraftTracks.ts`): reads the raw
  CSVs, decimates to the 1 km tolerance, finds closest approaches against the target bodies'
  Horizons vectors, writes the `.bin`, the events file, and a report (samples, bytes, worst
  Hermite error per track). `allowDataFile.ts` gains the basename; `docs/DATA.md` gains the
  refresh order.

## 6. Docs and backlog

`docs/DATA.md` (refresh order, asset), the `data/raw/horizons/README.md` rows, the three
adjacent backlog items. No backlog item covers this feature.

## 7. Tests

- Hermite evaluator: reproduces a sample exactly; between samples matches an analytic arc;
  clamps past the end.
- Decimator: worst reconstruction error ≤ tolerance on a fixture with a synthetic flyby.
- Track parser: round-trips the writer; rejects a wrong magic/version.
- `deriveBodyStates`: Voyager 1 at Titan closest approach within 1,000 km of the Horizons
  fixture point; Earth's position before load and before launch; held after 2100; the
  version bump invalidates the cache at a fixed `simDays`.
- Presence: absent craft are not in the partition's glints/meshes and have no label; present
  ones are.
- Trail: draw count `k` at a time between samples; the head vertex equals the snapshot
  position; hi/lo split reconstructs within 1 km at 160 AU.
- Timeline: tick click dispatches the event's sim day without pausing; exhibit exit restores
  the clock (P5's test).
- Prep: P1 regions unchanged for all current bodies; P6 planet/moon raw CSVs and generated
  corrections byte-identical.

## 8. PR sequence

1. **Prep PR** (`mission-trails-prep`, off main): P1–P6, one commit each; GitHub CI is the gate.
2. **Feature PR** (`mission-trails`, stacked): fetch + build tool and asset, registry loading,
   sampled phase + presence, trail pass, exhibit + timeline, deletions. Stacked PRs get no
   GitHub CI — local gate (typecheck + full suite). R2 sync of the asset before merge.

**Smoke** (worktree server :5176; flip orbit trails on in the UI):
- Titan flyby: `http://localhost:5176/#focus=body-voyager1&t=1980-11-12T05:41:00Z`
- Saturn, V1: `http://localhost:5176/#focus=body-voyager1&t=1980-11-12T23:46:00Z`
- Neptune, V2: `http://localhost:5176/#focus=body-voyager2&t=1989-08-25T03:56:00Z`
- Before launch (absent): `http://localhost:5176/#focus=body-voyager1&t=1977-01-01T00:00:00Z`
- Exhibit: `http://localhost:5176/#exhibit=voyager`
