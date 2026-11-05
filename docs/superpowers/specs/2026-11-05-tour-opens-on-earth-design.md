# The Long Way Out opens on Earth — design

- **Date:** 2026-11-05
- **Status:** draft, for the owner's review
- **Source:** grill `docs/grill-sessions/tour-opens-on-earth-2026-11-03.md` (Q1–Q11), refactor-ground
  checkpoint 2026-11-05 (rulings below)
- **Depends on:** #1032 (sky arm, merged), #1052 (cold-load gate, prep)

## Intent

The grand tour opens far out on the Milky Way today. It should start where the viewer stands: a person
in Søndermarken park at noon, the title fading up over the view, looking up as the sky turns to night.
The tour then rises out of the park and climbs through Earth, the Earth–Moon system, the Solar System
and the stellar neighbourhood before handing over to the existing Milky Way → edge beats. Home again
lands on Earth.

**Success:** a first-time viewer feels the scale ladder start from their own feet. **Anti-goals:** a
half-built park on a cold load; a camera that slides off the park while the clock runs; a skip or Prev
that lands a beat on the wrong date.

## Storyboard

| #   | Beat                      | Notes                                                       |
| --- | ------------------------- | ----------------------------------------------------------- |
| 00  | The Long Way Out          | park, noon → night, look up; title over the park            |
| 01  | You are here              | rise out of the park to the whole Earth, Copenhagen in view |
| 02  | Earth and Moon            |                                                             |
| 03  | The Solar System          |                                                             |
| 04  | Our stellar neighbourhood |                                                             |
| 05  | The Milky Way             | today's beat 01 "You are here", retitled                    |
| 06+ | existing beats from M31   | unchanged; Home again ends on Earth                         |

`openingTitle` (the Milky Way cold open) is deleted; its scene strip (`hide([...])`,
`scene(setLabelsFocusedOnly(true))`) moves into beat 00.

## Decisions

### The clock

- **Frozen for the whole tour.** `tourBodySaga` puts `pause({ nowMs })` once, inside the takeover
  bracket. The bracket (`withSceneSnapshotSaga` → `restoreSceneSaga`) already captures the viewer's
  clock on start and restores it on exit, mid-tour exits included, so there is no new restore code.
- **A beat moves it with the existing `scene()` cue.** A `clockTo({ simDays, overSec })` action joins
  the `SettingsAction` union (`src/compositions/@types/SettingsAction.d.ts`, "widen it as a tour beat
  needs a new knob"). `applySceneEffect` dispatches it verbatim; `watchClockToSaga` turns it into a
  two-sample `ClockProfile` anchored at dispatch time (`startClockProfile`, the mission mechanism).
  `overSec: 0` snaps. No new `SceneEffect` kind.
- **Each date-dependent beat owns its date.** Beats 00–04 open with
  `scene(clockTo({ simDays, overSec: 0 }))`, so a skip or Prev into any of them lands on its date with
  no fold machinery. `computeSceneEntering` is unchanged (its settings reducer ignores the action).
  A test pins that every Earth beat sets its date on entry.
- **The date is fixed and authored**: a dark, moonless evening (candidate: a new-Moon October date,
  Milky Way high), picked and eye-checked during the build. Two constants, `TOUR_NOON` and
  `TOUR_NIGHT` (Julian days).

### The camera

- **Beat 00 stands on the sky arm.** Frame-tagged `tween`s with `frame: { sky: SONDERMARKEN_SPOT }`
  (`SkySpot { body: 'earth', lonRad, latRad }`), yaw = azimuth, pitch = altitude. Not
  `linkedPoseToWorld`: a sky link folds at datum, inside the hill.
- **The rise** hands over legs `{sky}` → `{body: 'earth'}` → world inside beat 01 (`evaluateClip`
  splits clip time into legs per frame tag). Only `tween` and `setVec` take `frame`; no frame-tagged
  base writer may overlap a composite window on the same channel (`validateCompositeExclusivity`),
  so beat 00's dwell is authored tweens, not `dwellDrift`.
- **Home again** lands in a `{ body: 'earth' }` leg, so the clock snapping back to the viewer's now
  on exit cannot strand the camera where Earth was on the tour date.

### The cold load

- Beat 00's enter clip opens black with the existing `fade` cue and snaps to the park. The first
  visited beat then waits for `sceneSettled()` (prep #1052) before its caption and dwell; the dwell
  fades up under the title.

### Captions

- "You are here" moves to the Earth beat; the Milky Way beat becomes "The Milky Way". All six new or
  changed captions are drafted in one pass per `docs/tour/writing-style.md`, figures checked, and the
  owner edits them before any beat is tuned.

## Ground preparation

Refactor-ground checkpoint, 2026-11-05.

- **Prep (separate PR #1052):** `SagaContext.sceneSettled()` (no slot loading or committing, no
  planner voting `settling`, no fade); the body surface-tile planner votes `settling` while fetching;
  the tour's first visited beat waits for it after its enter clip, 8 s timeout. Missing joint it
  creates: nothing could tell a saga that the park mesh and its terrain had arrived.
- **Growth (this PR):** the `clockTo` action + saga; one `pause` in `tourBodySaga`; beats 00–04 and
  their storyboard rows; `ClipId` + clip-registry entries for the debugger wrappers; Home again's
  `{body: 'earth'}` leg; `openingTitle` deleted; `frameLadder.test.ts` expectations updated.
- **Rejected at the checkpoint:** folding the clock (or the pole, or the camera) into
  `computeSceneEntering` — a second way to set what cues already set; a new `clockTo` `SceneEffect`
  kind — the `scene()` cue is the growth point; a clock channel on the clip — the clock lives in the
  store, the channels in the engine.
- **Backlogged, not fixed here:** `computeSceneEntering` carries the pole live, so a skip or Prev
  across a `frameTo` boundary runs beats under the wrong pole (by reading; unreproduced);
  `clipBodySaga` hand-rolls the clock restore `restoreSceneSaga` already owns.

## Left to the builder

- Per-beat choreography, dwell lengths and orbits: the `/tour` live-tuning loop, one beat at a time,
  each landing after the owner's visual pass.
- The exact date constants (eye-checked); the pole each Earth beat runs under (`frameLadder.test.ts`).

## Known limits

- Earth's noon sky renders dark navy at ground level (backlog
  `docs/backlog/2026-11-04-earth-noon-sky-dark-at-ground.md`): until fixed, noon → night reads as
  dusk → night.
- A sky pose ignores drag and wheel until focus changes: the viewer can't look around during beat 00.

## Eye checks (DoD)

1. The park at noon, title over it, from a cold load: no half-built mesh or terrain.
2. Look up, noon → night: sky darkens, stars appear, the eye stays on the spot.
3. The rise: park → Copenhagen → whole Earth with no jump at the leg handovers.
4. Earth and Moon, Solar System, neighbourhood: framed subjects on the tour date.
5. Prev from beat 01 to 00 restores noon; skip to beat 03 lands on the tour date.
6. Home again lands on Earth; exiting restores the viewer's clock.
