# Voyager flyby ride-along — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development under the
> lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** stepping to a flyby chapter in the Voyager exhibit rides along. The camera follows the craft from the side through the encounter, and the clock runs a precomputed profile, slowest at closest approach.

**Architecture:** two behaviour-neutral prep refactors land first: one `stepToMissionEvent` action for every chapter step, and a `followsMovingTarget` flag on camera driver rows. The feature then adds:
- `MissionEvent.targetId`;
- a wall→sim `RideProfile` on `TimeState`, interpolated by `deriveSimDays` and cleared by every existing time action;
- a `ride` camera driver row reading `camera.ride`;
- an `exhibitBodySaga` hold loop that starts and ends rides on steps.

**Tech stack:** TypeScript, Redux Toolkit + redux-saga, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-voyager-flyby-ride-along-design.md` (with the UX doc's Revisions 1–2).

## Global constraints

- **Ride window:** closest − 2 d → closest + 2 d (`RIDE_HALF_WINDOW_DAYS = 2`). Wall length `RIDE_WALL_MS = 25_000`. Samples `RIDE_SAMPLES = 512`. All constants live in `src/data/exhibits/ride/`.
- **Speed law:** sim speed ∝ `max(sep, closestKm) / |vRel|`, where sep and vRel are craft − target.
- **Visitor wins:** every existing time reducer (`setRate`, `pause`, `resume`, `setSimDays`, `setDirection`, and any other reducer that re-anchors) sets `profile = null` *after* re-anchoring at the current derived instant. Only `startRide` sets a profile. `captureScene` and URL parse never carry one.
- **Free scrub never starts a ride.** Only `stepToMissionEvent` does, and only for `kind === 'flyby'`.
- **Normal:** fixed per event, `normalize(rRel × vRel)` at the closest instant.
- **Camera framing:** aim at the midpoint of craft and target; distance = `sphereFitDistance(sep / 2 × RIDE_FRAME_MARGIN)`, floored at `3 × closestKm`.
- **Conventions:**
  - one symbol per file in `utils/` and `@types/`; `type`, never `interface`;
  - frame/pass files export only their own symbol;
  - comments explain why, module header ≤ 10 lines;
  - stage explicit paths, never `git add -A`;
  - no Co-Authored-By trailer;
  - format with `npx prettier --write <files>`.

## Review focus

1. **Visitor pause mid-ride:** the clock must freeze at the *current* interpolated instant, not jump to the profile start or end. Pinned in Task 4.
2. **Exit mid-ride:** the restored clock carries no profile, and `camera.ride` is null after exit. Pinned in Task 6.
3. **Stepping from one flyby straight to the next** (V1 Titan → Saturn): the second ride replaces the first, with no stale `delay` firing a `pause` into the new ride. Pinned in Task 6.
4. **A `t=` deep link while riding:** it is a scrub and clears the profile. Pinned in Task 4.
5. **Craft tab switch mid-ride** ends the ride and flies back to the exhibit pose. Pinned in Task 6.

---

## Dispatch A — prep (two commits)

### Task 1: P1 — one step action

**Files:**
- Create: `src/state/exhibits/stepToMissionEvent.ts` (action creator)
- Create: `src/utils/exhibits/timeline/adjacentEventId.ts`
- Modify:
  - `ExhibitTimeline.tsx`, `TimelineChapterBar.tsx`, `TimelineTrack.tsx` (PageUp/PageDown; the dots become `<button>`s that step);
  - `stepTimelineEvent.ts` (now returns `stepToMissionEvent`) and `keyboardShortcuts.ts`;
  - `ExhibitTimelineContainer.tsx`;
  - the time slice, which gets an extraReducer setting the clock to the event's instant.

**Contract:**
```ts
export const stepToMissionEvent = createAction<{ eventId: string }>('exhibits/stepToMissionEvent');
// timeSlice extraReducer: look the event up in MISSION_EVENTS; re-anchor exactly as setSimDays does
export function adjacentEventId(events: readonly MissionEvent[], simMs: number, dir: -1 | 1): string | null;
```
`onSeek` / `onSeekMs` stay for the free drag only.

- [ ] Write the failing tests:
  - each step site (Prev, Next, chapter segment, dot, `,`/`.`, PageUp/PageDown) dispatches `stepToMissionEvent` with the right id;
  - a track drag dispatches `setSimDays` only;
  - the reducer lands the clock on the event instant.
- [ ] Implement; delete the three duplicated next-event computations.
- [ ] Check that no behaviour changes: the existing timeline tests stay green.
- [ ] Run typecheck and the full suite, then commit: `Prep P1: one stepToMissionEvent action for every chapter step`.

### Task 2: P2 — follow flag on camera driver rows

**Files:**
- Modify: `src/services/engine/camera/cameraDrivers.ts` (row flag)
- Modify: the `CameraDriver` row type
- Modify: `replayInput.ts:212`, `commitOnEdge.ts:41`, `shouldKeepTicking.ts:26`
- Delete: `src/utils/camera/isFollowDriverId.ts` and its test

**Contract:**
```ts
type CameraDriverRow = { …; readonly followsMovingTarget: boolean }; // true for followApproach, followHold
```
Readers use the winning row's flag in place of the id list.

- [ ] Update tests to assert via the flag; the existing follow tests stay green unchanged.
- [ ] Run typecheck and the full suite, then commit: `Prep P2: followsMovingTarget flag replaces the follow-id list`.

## Dispatch B — ride data and clock

### Task 3: target ids and relative state

**Files:**
- Modify: `MissionEvent.d.ts` (+ `targetId?: BodyId`)
- Modify: `tools/bodies/buildSpacecraftTracks.ts`, so it emits `targetId` for every flyby from the encounter table
- Regenerate: `src/data/missions/missionEvents.generated.ts`. Edit the generated rows directly only if regeneration needs network; say so in the report.
- Create: `src/utils/orbit/hermiteTrackVelAt.ts`
- Create: `src/utils/exhibits/ride/flybyRelativeState.ts`
- Create: `src/utils/exhibits/ride/flybyNormal.ts`

**Contract:**
```ts
export function hermiteTrackVelAt(track: SampledTrack, tDays: number): Vec3;  // km/s, Hermite derivative
export function flybyRelativeState(event: MissionEvent, simDays: number): { rKm: Vec3; vKmS: Vec3 } | null;
// target: the same POSITION_DRIVERS dispatch deriveBodyStates uses, for one body; target velocity by
// central difference (±60 s). Null when the track is not loaded.
export function flybyNormal(event: MissionEvent): Vec3 | null;  // normalize(r × v) at the event instant
```

- [ ] Tests:
  - `hermiteTrackVelAt` matches the sampled `velKmS` at the nodes, to 1e-6 relative;
  - Voyager 2 at Neptune: |r| at the event instant ≈ `closestKm` within 1%;
  - the normal is a unit vector perpendicular to r and v.
- [ ] Implement, then commit.

### Task 4: ride profile in the clock

**Files:**
- Create: `src/@types/time/RideProfile.d.ts`
- Create: `src/utils/exhibits/ride/buildRideProfile.ts`
- Create: `src/data/exhibits/ride/*.ts` (constants)
- Modify: `TimeState.d.ts` (+ `profile: RideProfile | null`), `initialState`
- Modify: `deriveSimDays.ts`
- Modify: `timeSlice.ts` (+ `startRide`, `pause`, `resume`, `setRate`, `setSimDays`, `setDirection`, … all clear the profile)
- Modify: `captureScene.ts` (strip the profile)

**Contract:**
```ts
export type RideProfile = { readonly startWallMs: number; readonly wallMs: Float64Array; readonly simDays: Float64Array };
export function buildRideProfile(event: MissionEvent, startWallMs: number): RideProfile | null;
startRide: PayloadAction<{ profile: RideProfile }>   // also un-pauses
// deriveSimDays(time, nowMs): profile ? lerp over (nowMs - startWallMs), clamped to the last sample : today's path
```

- [ ] Tests:
  - `buildRideProfile`:
    - both columns are monotone;
    - total wall time is `RIDE_WALL_MS` ± 1 ms;
    - the slowest sim speed is within one sample of closest approach;
    - the endpoints are closest ∓ 2 d.
  - `deriveSimDays`: interpolates, and clamps after the end.
  - Review focus 1: `pause` mid-profile freezes at the interpolated instant.
  - Every listed reducer clears the profile.
  - Review focus 4: a URL `t=` restore clears the profile.
  - `captureScene` output has `profile: null`.
- [ ] Implement, then commit.

## Dispatch C — camera, saga, UI

### Task 5: ride camera driver

**Files:**
- Create: `src/@types/camera/CameraRide.d.ts`
- Create: `src/services/engine/camera/ridePose.ts`
- Modify: the camera slice (+ `ride: CameraRide | null`, `setRide`, `clearRide`, `setRideOffsets`)
- Modify: `DriverId.d.ts` (+ `'ride'`)
- Modify: `cameraDrivers.ts` (+ row: priority 60, `followsMovingTarget: true`)

**Contract:**
```ts
export type CameraRide = { readonly eventId: string; readonly craftId: string; readonly targetId: BodyId; readonly normal: Vec3;
  readonly offsets: { readonly yaw: number; readonly pitch: number; readonly zoom: number } };
// ridePose: aim = midpoint(craft, target) from ctx.bodies; eye on the normal rotated by offsets;
// distance = max(sphereFitDistance(sep/2 × RIDE_FRAME_MARGIN), 3 × closestKm) × zoom
```
Releasing a visitor orbit or zoom over a ride writes `setRideOffsets`, mirroring how follow memory works.

- [ ] Tests:
  - at zero offsets the eye lies on the normal axis;
  - for Voyager 2 at Neptune, the target and the craft are both inside the frustum at closest and at ±2 d;
  - the orbit release updates the offsets.
- [ ] Implement, then commit.

### Task 6: exhibit saga loop and UI

**Files:**
- Modify: `src/state/exhibits/exhibitBodySaga.ts` (the hold becomes a loop)
- Create: `src/state/exhibits/rideSaga.ts` (one ride: `startRide` + `setRide`, `delay` to the end, then `pause`)
- Create: `showWholeMission` action
- Modify: `ExhibitTimeline.tsx` / container: the `Whole mission` header control while riding; the riding card line "Riding along with Voyager 1 past Saturn"; the live distance at 4 Hz from `flybyRelativeState`.

**Contract:**
```ts
// hold loop: race({ exit: take(exitTakeover), step: take(stepToMissionEvent), whole: take(showWholeMission), tab: take(setMissionEmphasis) })
//   flyby step → fork(rideSaga, event) (cancel any running ride first)
//   other      → cancel ride; clearRide; flyToPoseClip(exhibit pose)
//   exit       → break
// finally → cancel ride; clearRide
```

- [ ] Tests:
  - flyby step → profile set and ride set;
  - non-flyby step → `flyToPoseClip`;
  - Review focus 2: exit mid-ride → profile null and ride null;
  - Review focus 3: Titan → Saturn, the first ride's `pause` never fires into the second;
  - Review focus 5: a tab switch mid-ride → ride cleared and fly-back;
  - a visitor `pause` mid-ride → profile null, ride kept;
  - the end of a ride → paused at closest + 2 d, ride kept.
- [ ] Implement.
- [ ] Shoot `#exhibit=voyager` and step to the Neptune chapter, mid-approach and at closest; attach the shots to the report.
- [ ] Commit.

---

## Definition of Done

**Deliverables**
- [ ] P1 and P2 prep commits, each behaviour-neutral, ahead of the feature commits.
- [ ] `MissionEvent.targetId` on every flyby; `RideProfile` in `TimeState`; the `ride` camera driver row; the hold loop in `exhibitBodySaga`.
- [ ] Timeline: the `Whole mission` control, the riding card line, the live distance.
- [ ] Backlog: a general `BodyState.velocity` item (index line + detail file).

**Smoke** (server :5176):
- [ ] Ride Neptune with Voyager 2: open `http://localhost:5176/#exhibit=voyager`, pick the Voyager 2 tab, step to Neptune. The bend is visible, the ride is slowest at closest, and it pauses at +2 d.
- [ ] Ride Titan, then Saturn, with Voyager 1: two separate rides, neither interfering with the other.
- [ ] Pause mid-ride: the clock freezes where it was and the camera keeps following.
- [ ] Step to Pale Blue Dot: the camera flies back to the whole mission.
- [ ] Exit mid-ride: the clock and focus are restored, and no ride is left behind.

**Out of scope:** general body velocity, rides for non-flyby events, authored per-flyby cameras.
