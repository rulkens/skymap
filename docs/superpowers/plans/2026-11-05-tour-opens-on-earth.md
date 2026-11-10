# The Long Way Out opens on Earth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended here, see
> the handoff) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the grand tour opens standing in Søndermarken at noon, runs the clock to night while
looking up, then climbs Earth → Earth–Moon → Solar System → stellar neighbourhood before the existing
Milky Way → edge beats; Home again lands on Earth.

**Architecture:** the clock moves only through a `clockTo` action on the existing `scene()` cue,
played as a `ClockProfile` by a small saga; the tour pauses the clock once and the takeover bracket
restores it. Each Earth beat snaps its own date on entry. The opening stands on the sky arm with
frame-tagged tweens; the cold-load gate (#1052, merged) holds beat 00 until the park is loaded.

**Tech Stack:** TS, RTK + typed-redux-saga, the clip/tour engine (`effectHelpers.ts`,
`evaluateClip.ts`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-tour-opens-on-earth-design.md`

## Global Constraints

- The clock action's type must NOT start with `time/`: `timeSlice.ts:160-165` clears a running
  profile on any `time/*` action except `startClockProfile`. Use `tour/clockTo`.
- No new `SceneEffect` kind; `computeSceneEntering` stays unchanged.
- Beat 00 opens on a `{ sky }` frame tag, never through `linkedPoseToWorld` (a sky link folds at datum).
- Only `tween` and `setVec` take `frame`; no frame-tagged base writer may overlap a composite window
  on the same channel (`validateCompositeExclusivity.ts:40`).
- Beats are authored one at a time in the `/tour` loop; each lands after the owner's visual pass, and
  the next is never started unprompted.
- Captions follow `docs/tour/writing-style.md`; the owner edits them before any beat is tuned.

## Review Focus

1. Prev from beat 01 back to 00 while the noon → night profile runs: 00's entry snap must replace the
   running profile, landing at noon (Task 1 test).
2. Exit mid-beat-00 with the profile running: the viewer's clock comes back, not the tour date
   (Task 2 test).
3. A windowed take starting at beat 03: it must land on the tour date with no earlier beat played
   (Task 5's `beatDates` test pins that every Earth beat snaps its own date).
4. A playing live clock before the tour: the tour must not drift it during the run (Task 2 test).
5. Exiting from Home again: the camera stays on Earth while the clock snaps back (eye check, Task 10).

---

### Task 1: `clockTo` action and its saga

review: yes

**Files:**
- Create: `src/state/tour/clockTo.ts`, `src/state/tour/watchClockToSaga.ts`,
  `tests/state/tour/watchClockToSaga.test.ts`
- Modify: `src/compositions/@types/SettingsAction.d.ts` (add `ReturnType<typeof clockTo>`),
  `src/store/rootSaga.ts` (fork the watcher beside `watchFocusTweenSaga`)

**Interfaces:**
- Produces: `clockTo = createAction<{ simDays: number; overSec: number }>('tour/clockTo')`;
  `watchClockToSaga(): Generator`.
- Behaviour: `overSec === 0` → `put(setSimDays(...))` at the target, clock stays paused; otherwise
  `put(startClockProfile({ profile }))` with two samples: (now, live sim instant) → (now + overSec·1000,
  `simDays`). `interpolateClockProfile` holds the last sample past the end.

- [ ] Write `watchClockToSaga.test.ts` over a real store + saga middleware, fake timers:
  - `'overSec 0 snaps the clock to simDays and leaves it paused'`: after `pause`, dispatch
    `clockTo({ simDays: 2_460_000, overSec: 0 })`; `deriveSimDays(state.time, now)` equals 2_460_000
    and `state.time.paused` is true.
  - `'a timed clockTo runs from the live instant to simDays over overSec, then holds'`: from
    2_460_000 paused, `clockTo({ simDays: 2_460_000.5, overSec: 10 })`; at +5 s the derived instant
    is strictly between; at +10 s and +20 s it equals 2_460_000.5.
  - `'a snap during a running profile replaces it'` (Review Focus 1): start a 10 s run, at +3 s
    dispatch a 0 s snap to 2_460_000; at +3 s and +8 s the instant is 2_460_000.
  - `'the action sits outside the time route'`: `expect(clockTo.type.startsWith('time/')).toBe(false)`.
- [ ] Run `npx vitest run tests/state/tour/watchClockToSaga.test.ts` → FAIL (module missing).
- [ ] Implement the action, the saga, the union entry and the root-saga fork.
- [ ] Run the test → PASS; `npm run typecheck:fast` clean.
- [ ] Commit (`feat(tour): clockTo moves the sim clock from a scene() cue`).

### Task 2: The tour freezes the clock for its whole run

review: yes

**Files:** Modify `src/state/tour/tourBodySaga.ts` (one `put(pause({ nowMs: performance.now() }))`
at the top of the body, inside the `withSceneSnapshotSaga` bracket, after its capture); Test
`tests/state/tour/tourBodySaga.test.ts`.

- [ ] Add tests:
  - `'the tour holds a playing clock still for its whole run'` (Review Focus 4): live clock playing
    before `startTour`; after two beats the derived instant equals the instant at start (±1 ms).
  - `'exit mid-beat restores the viewer's clock, even over a running clockTo'` (Review Focus 2): a
    beat whose dwell dispatches `scene(clockTo({ simDays: X, overSec: 30 }))`; `exitTakeover` at
    +5 s; `state.time.profile` is null and a previously live clock is live again.
- [ ] Run → FAIL; add the `pause`; run → PASS.
- [ ] Commit (`feat(tour): a tour holds the clock still; beats move it`).

### Task 3: The tour's date and the park's spot

**Files:** Create `src/data/animation/tours/grandTour/tourNoonSimDays.ts`,
`tourNightSimDays.ts`, `sondermarkenSpot.ts`.

- `TOUR_NOON_SIM_DAYS`, `TOUR_NIGHT_SIM_DAYS`: Julian days (UTC) of local solar noon and of full
  astronomical night on one dark, moonless date (candidate: a new-Moon October evening, Milky Way
  high). Header states the date, the Moon phase source and why.
- `SONDERMARKEN_SPOT: SkySpot` = `{ body: 'earth', lonRad, latRad }` derived from
  `SOENDERMARKEN.position.site` (`src/layers/earthScenes/bodies/soendermarken.ts`) degrees → radians,
  not copied numbers.
- No test (constants). Eye check instead: shoot `#pose=k,earth,<lon>,<lat>,π,1.05&t=<noon ISO>` and
  the same at night with `npm run shot -- '<link>' --url <server>`; send both to the owner as dash
  checks before Task 5. Note the noon sky renders dark (backlog
  `2026-11-04-earth-noon-sky-dark-at-ground.md`).
- [ ] Commit (`feat(tour): the tour's date and Søndermarken's standing spot`).

### Task 4: Captions and stage docs

**Files:** Create `docs/tour/stages/00-the-long-way-out.md`, `01-you-are-here.md` (rewrite),
`02-earth-and-moon.md`, `03-the-solar-system.md`, `04-stellar-neighbourhood.md`; rename the existing
stage docs 01–13 up by four with `git mv` (docs may use `git mv`), delete `00-opening-title.*`.

- [ ] Draft all six bodies (beats 00–05, 05 = "The Milky Way") in one pass per
  `docs/tour/writing-style.md`, figures checked against sources; each stage doc carries intent,
  camera, narration and on-screen state like its siblings.
- [ ] Send the six captions to the owner as one dash ask; apply their edits. No code.
- [ ] Commit (`docs(tour): Earth-opening stage docs and captions`).

### Task 5: Beat 00 — The Long Way Out (park, noon → night)

review: yes

Run the `/tour` skill's add-a-beat checklist. **Files:** Create
`src/data/animation/tours/grandTour/parkOpening.ts` (`parkOpening` enter, `parkOpeningDwell`),
`tests/data/animation/tours/grandTour/beatDates.test.ts`; Modify `grandTour.ts`, `ClipId.d.ts`,
`grandTourBeats.ts`, `clipRegistry.ts`, `tests/data/animation/clips/clipRegistry.test.ts`,
`tests/data/animation/tours/grandTour/frameLadder.test.ts`; Delete `openingTitle.ts`, its
`tourOpeningTitle` wrapper, registry entry and `ClipId` member (a deliberate retirement, which
`TourId`'s append-only rule allows: the id is a clip-debugger handle, and a `#clip=tourOpeningTitle`
link would replay a beat the tour no longer has).

- Enter: `fade` to black at 0; `scene(clockTo({ simDays: TOUR_NOON_SIM_DAYS, overSec: 0 }))`;
  `openingTitle`'s strip (`hide([...], 0)`, `scene(setLabelsFocusedOnly(true))`) moved here;
  `tween('yaw' | 'pitch', { over: 0, frame: { sky: SONDERMARKEN_SPOT } })` to a southward horizon
  view. The cold-load gate then waits; the dwell fades up under the title.
- Dwell: `scene(clockTo({ simDays: TOUR_NIGHT_SIM_DAYS, overSec }))` beside a sky-framed `pitch`
  tween up toward the zenith; authored tweens, not `dwellDrift`.
- `beatDates.test.ts`: `'every Earth beat snaps its own date on entry'` — for beats 00–04 the
  first `clockTo` in the enter clip has `overSec: 0` (beats 01–04 join the list as they land).
- `frameLadder.test.ts`: the new index ranges; the pole the Earth beats run under is decided here.
- [ ] Test first (`beatDates`, registry keys), then author, then typecheck + full `npm test`.
- [ ] Owner's visual pass (spec eye checks 1–2) with a cold-load deep link `#tour=grandTour`.
- [ ] Commit (`feat(tour): beat 00 — The Long Way Out`); stop until the owner says next.

### Task 6: Beat 01 — You are here (the rise)

review: yes

**Files:** Create `grandTour/youAreHereEarth.ts` (enter + dwell); Modify `grandTour.ts`,
`ClipId.d.ts`, `grandTourBeats.ts`, `clipRegistry.ts`, the registry and `beatDates` tests.

- Enter snaps `TOUR_NIGHT_SIM_DAYS` (`overSec: 0`), then rises in legs `{sky}` → `{body: 'earth'}`
  → world; Copenhagen in view mid-rise, the whole Earth at the end. This is the eye check carried from
  #1032 ("film the rise").
- [ ] Author, test, visual pass (eye check 3), commit; stop.

### Task 7: Beat 02 — Earth and Moon

**Files:** `grandTour/earthAndMoon.ts` + the same four wiring files and tests as Task 6.
- Enter snaps `TOUR_NIGHT_SIM_DAYS`; framing on the tour date's Earth–Moon geometry.
- [ ] Author, test, visual pass (eye check 4), commit; stop.

### Task 8: Beat 03 — The Solar System

**Files:** `grandTour/solarSystem.ts` + wiring + tests. Enter snaps `TOUR_NIGHT_SIM_DAYS`.
- [ ] Author, test, visual pass, commit; stop.

### Task 9: Beat 04 — Our stellar neighbourhood

**Files:** `grandTour/stellarNeighbourhood.ts` + wiring + tests. Enter snaps `TOUR_NIGHT_SIM_DAYS`;
hands over to beat 05's existing `youAreHere` approach.
- [ ] Author, test, visual pass, commit; stop.

### Task 10: Beat 05 retitled; Home again lands on Earth

review: yes

**Files:** Modify `grandTour.ts` (beat 05 title "The Milky Way", caption from Task 4),
`grandTour/homeAgain.ts` (end in a `{ body: 'earth' }` leg), `frameLadder.test.ts`.
- [ ] Author, visual pass (eye checks 5–6: Prev 01 → 00 restores noon; skip to 03 lands on the
  date; Home again on Earth; exit restores the viewer's clock), commit.
- [ ] Add an implementation-notes entry (`docs/tour/implementation-notes.md`) for the clock and
  sky-arm lessons; run `/feature-done`.

## Definition of Done

**Deliverables**
- [ ] `clockTo` action (`tour/clockTo`) in `SettingsAction`, played by `watchClockToSaga`.
- [ ] `tourBodySaga` pauses the clock once per run.
- [ ] `TOUR_NOON_SIM_DAYS`, `TOUR_NIGHT_SIM_DAYS`, `SONDERMARKEN_SPOT`.
- [ ] Beats 00–04 authored; beat 05 retitled; `openingTitle` gone; Home again on `{ body: 'earth' }`.
- [ ] `beatDates.test.ts`; `frameLadder.test.ts` updated; stage docs 00–04 and the renumbered rest.

**Smoke (owner, each a dash check with its deep link)**
- [ ] Cold load of `#tour=grandTour`: black, then the park at noon with the title; no half-built mesh.
- [ ] Look up, noon → night: sky darkens, stars appear, the eye stays put.
- [ ] The rise: park → Copenhagen → whole Earth, no jump at a leg handover.
- [ ] Earth and Moon, Solar System, neighbourhood framed on the tour date.
- [ ] Prev 01 → 00 restores noon; skipping to 03 lands on the tour date.
- [ ] Home again lands on Earth; exit restores the viewer's clock.

**Out of scope**
- The dark noon sky at ground level (backlogged); drag/wheel on a sky pose; the skip/Prev pole gap
  and the clip clock-restore duplicate (backlogged 2026-11-05); the caption layout.
