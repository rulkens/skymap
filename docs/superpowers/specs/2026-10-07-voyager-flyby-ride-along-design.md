# Voyager flyby ride-along — design

**Status:** design approved 2026-10-07 (UX doc Revision 2; refactor-ground checkpoint ask ss3a). Rides on PR #854 (`mission-trails`): prep commits first, then the feature.
**Parent:** [`2026-10-05-voyager-mission-ux-design.md`](2026-10-05-voyager-mission-ux-design.md), Revisions 1–2.

## Goal

At the whole-mission framing a flyby's bend is sub-pixel. Stepping to a flyby chapter now rides along: the camera follows the craft from the side through the encounter while the clock runs fast on approach, slowest at closest pass, and fast again on departure.

## Behaviour

- **Entry is a chapter step.** Previous / Next, the chapter bar, the scrubber's event dots, `,` / `.` and PageUp / PageDown on the scrubber all step. Stepping to a `flyby` event starts a ride; free scrubbing never does.
- **Clock.** The ride sets the clock to closest − 2 d and plays a precomputed profile: sim speed ∝ separation / relative speed, so the craft crosses the frame at a roughly steady on-screen speed. The whole window lasts `RIDE_WALL_MS` = 25 s of wall time. At closest + 2 d the clock pauses there.
- **Visitor wins.** Any time action — pause, resume, rate change, direction change, scrub, a `t=` link — ends the profile at the current instant. The camera keeps following.
- **Camera.** The camera holds a side view of the encounter. It looks along the flyby-plane normal, fixed per event, and aims at the midpoint of craft and target. Its distance fits both bodies, so the target, the craft and the bend in the trail stay in frame. The visitor's orbit and zoom are offsets inside the ride frame. They reset on every step.
- **Ending.** A finished ride holds: clock paused, camera still following. Stepping to a non-flyby event, choosing `Whole mission` in the timeline header, or switching the craft tab clears the ride and flies back to the exhibit pose.
- **Exit.** Leaving the exhibit clears the ride. The takeover restore puts back the clock and focus. The camera pose comes back by approaching the restored focus, as it does today; the takeover capture holds no camera pose.
- **Card copy while riding.** "Riding along with Voyager 1 past Saturn", plus the live distance from the target's centre, refreshed at 4 Hz.
- **Titan and Saturn** (Voyager 1, 18 h apart) are two rides on their own targets. Titan's window runs past Saturn's closest pass, and that is fine.

## Ground preparation

The refactor-ground pass ran 2026-10-07 and found two missing joints. Each lands as its own commit before the feature.

- **P1 — one step action.** Today every step collapses into an anonymous `setSimDays`, which the free scrub also sends:
  - the merge point is `ExhibitTimeline.tsx:70-71` (`onSeekMs`);
  - the keys are `stepTimelineEvent.ts:21`;
  - PageUp / PageDown are `TimelineTrack.tsx:82-87`;
  - "next event" is computed three times (`stepTimelineEvent.ts:20`, `ExhibitTimeline.tsx:67-68`, `TimelineTrack.tsx:84`).

  The fix is a `stepToMissionEvent({ eventId })` action that every step site dispatches. A reducer-side listener sets the clock to the event instant, so P1 changes no behaviour. `onSeek` becomes scrub-only. Adjacent-event lookup becomes one helper. The scrubber dots become buttons that step.
- **P2 — follow flag on camera rows.** `isFollowDriverId.ts:7` is a hand-kept list of the two follow rows. Three places read it: wheel zoom (`replayInput.ts:212`), the commit edge (`commitOnEdge.ts:41`) and keep-ticking (`shouldKeepTicking.ts:26`). The fix adds `followsMovingTarget: boolean` on each `CAMERA_DRIVERS` row and has the readers use it. There is no behaviour change; the ride becomes a row with the flag, not a third id in a list.

**Greenfield cross-check.** It agreed on: one step action, a fixed per-event normal, offsets inside the ride frame, and exhibit-scoped ride state. It diverged on who owns the rate, proposing a rate as a function of sim time evaluated in the clock integrator. That was rejected because `deriveSimDays` is a pure function of wall time, and a wall→sim table keeps it pure. The re-anchor that a table needs on visitor input already happens in every time action.

## Data delta

```ts
// MissionEvent (+ targetId, written by tools/bodies/buildSpacecraftTracks.ts from the encounter table)
type MissionEvent = { …; targetId?: BodyId };          // present on every 'flyby'

// TimeState (+ profile)
type RideProfile = { startWallMs: number; wallMs: Float64Array; simDays: Float64Array };
type TimeState = { …; profile: RideProfile | null };
// deriveSimDays: profile ? interpolate(profile, nowMs - startWallMs), clamped to the last sample : today's path
// every existing time reducer sets profile = null after re-anchoring; only startRide sets it
// captureScene strips it; URL parse never sets it

// camera (+ ride)
type CameraRide = { craftId: string; targetId: BodyId; normal: Vec3; offsets: { yaw: number; pitch: number; zoom: number } };
camera.ride: CameraRide | null
CAMERA_DRIVERS += { id: 'ride', priority: 60, followsMovingTarget: true, isActive: s => s.camera.ride !== null, pose: ridePose }

// exhibit actions
stepToMissionEvent({ eventId }) · showWholeMission()
```

## Units

| Unit | Kind | Job |
| --- | --- | --- |
| `hermiteTrackVelAt(track, tDays)` | utils/orbit | the Hermite derivative, km/s |
| `flybyRelativeState(event, simDays)` | utils/exhibits/ride | craft − target position and velocity. The target comes from the same position-driver dispatch `deriveBodyStates` uses, evaluated for one body, with a central difference for its velocity (no cache thrash). |
| `buildRideProfile(event, startWallMs)` | utils/exhibits/ride | samples the ±2 d window (`RIDE_SAMPLES` = 512), sim speed ∝ max(sep, closestKm) / \|vRel\|, scaled to `RIDE_WALL_MS`, returns a monotone table |
| `flybyNormal(event)` | utils/exhibits/ride | normalize(rRel × vRel) at the closest instant |
| `ridePose(ctx, ride)` | engine camera | aim = midpoint of craft and target; eye along the offset-rotated normal; distance = `sphereFitDistance(sep / 2 × RIDE_FRAME_MARGIN)`, floored at `3 × closestKm` |
| `startRide` / `endRide` | time + camera reducers | set or clear the profile and `camera.ride` |
| `exhibitBodySaga` hold | saga | a loop over `race(exitTakeover, stepToMissionEvent, showWholeMission, setMissionEmphasis)`: flyby → `startRide` then `delay` to the end → `pause` at the end instant; other → `endRide` + `flyToPoseClip(exhibit pose)`; `finally` → `endRide` |
| Timeline UI | components | the `Whole mission` header control while riding, the riding card line and the live distance |

Constants live in `src/data/exhibits/ride/`.

## Testing

- `buildRideProfile`: monotone in both columns; total wall time = `RIDE_WALL_MS` ± 1 ms; slowest sim speed within one sample of closest approach; ends at closest + 2 d.
- `deriveSimDays` with a profile: interpolates; clamps after the end.
- Each time reducer clears the profile; `captureScene` strips it.
- P1: each step site dispatches `stepToMissionEvent`; the free scrub dispatches `setSimDays` only; the dots step.
- P2: the existing follow behaviour is unchanged (replayInput, commitOnEdge, shouldKeepTicking tests stay green); the flag is read, not the id list.
- Saga: flyby step → ride started; non-flyby step → `flyToPoseClip`; exit mid-ride → ride cleared; a visitor `pause` mid-ride → profile cleared and the ride camera kept.
- `ridePose`: the eye lies on the normal axis at zero offsets; target and craft both fall inside the frustum at closest approach and at ±2 d for Voyager 2 at Neptune.
- Visual check (dash): Neptune and Titan rides, mid-approach and at closest pass.

## Out of scope

- A general `BodyState.velocity` (backlogged; the ride derives it locally).
- Rides for non-flyby events, authored per-flyby cameras, and rides outside the Voyager exhibit.
