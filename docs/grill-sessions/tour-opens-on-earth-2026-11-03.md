# Grill Session: "The Long Way Out" opens on Earth — 2026-11-03

Source: chat brainstorm + `/grill-me` in worktree `tour-start-earth-ui-rework`.

The grand tour opens far out on the Milky Way today. Extend it to start at Søndermarken — a person
standing in the park at noon, looking up as the sky turns to night — and climb through Earth, the
Earth–Moon system, the Solar System and the stellar neighbourhood before handing over to the existing
beats. The caption layout rework (centred, subtitle-like) is a separate piece, brainstormed after.

Ruled before the grill (chat): the four new captioned stops are **Earth, Earth–Moon, Solar System,
local stellar neighbourhood**; the title card fades up **over the park**; **Home again ends at
Earth**, not the Milky Way.

---

## Q1: Does the sim clock run during the tour?

**The question:** `tourBodySaga`/`visitBeatSaga` never touch the clock; each beat resolves its cues at
the live `deriveSimDays(...)`. At Mpc scale that is invisible, but Earth moves ~30 km/s: a
world-fixed target at the park is 300 km behind after a 10 s dwell.

**Considerations:**

- **Option A (freeze for the whole tour):** `tourBodySaga` takes `clipBodySaga`'s `pause({ nowMs })`
  + `finally` restore. One instant for every beat; deterministic playback (`goal.md`). Planets and
  Moon stand still.
- **Option B (freeze per beat):** still lets bodies jump between beats.
- **Option C (a camera that follows Earth):** far more code, and must let go at the Solar-System beat.

**Decision:** A. Amended by Q7–Q8: the frozen clock moves only through authored `clockTo` cues.

## Q2: How does the opening beat land on the park pose?

**The question:** `BeatData` clips are static `ClipData`; the park pose (`SONDERMARKEN_POSE`, a
17-field body-fixed `#pose=` link) only becomes a world pose at a given `simDays`.

**Considerations:**

- **Option A (`ClipData.start` takes `{ link }`):** one resolve arm in `resolveClipFoci`; tour types
  untouched.
- **Option B (a `snapToLink` effect):** a new `Effect` kind for the same result; the readable site
  form `s,soendermarken,heading,elevation,rangeM` was shown as the nicer link.
- **Option C (tour becomes a `(simDays) => Tour` factory):** widest ripple (registry, takeover saga,
  debugger wrappers).

**Decision:** neither — the user asked for the focus effect instead (Q3).

## Q3: Can the focus effect open the beat?

**The question:** `body-soendermarken` is a focus id (`earthSceneSelectionRow`), so
`focusOnId(PARK, 0)` sets target + distance at `simDays`. But `focusFraming` carries no orientation:
the pre-tour yaw/pitch survives and can look up through the Earth.

**Considerations:**

- **Overhead via `lookAtId(EARTH, { from: PARK })`:** static data, Powers-of-Ten straight-down shot;
  needs `lookAtId` to take an origin id (today it bakes from the pre-clip `from.target`). North not up.
- **Oblique view:** needs a surface-relative aim.
- **Keep the pre-tour aim:** arbitrary, can face underground.

**Decision:** the user wants **surface-relative aim actions**, animatable — brainstormed in Q4.

## Q4: How do we describe a surface-relative aim?

**The question:** what vocabulary reads naturally and animates correctly?

**Considerations:**

- **Where the eye sits (orbit):** heading + elevation of the eye from the subject (the site
  turntable's `SitePose`), or lat/lon of the sub-eye point for a whole planet. A drone shot.
- **Where the eye looks (look-around):** the eye stays put, the view turns in heading/altitude —
  needed for "looking around the sky".
- Either must interpolate in **local** angles each sample (a north→south pan is a different curve in
  galactic yaw/pitch), and level the horizon via `roll`.

**Decision:** "**as if we're a person standing in the park**" — eye planted at standing height, the
view described as compass heading + altitude. Animated.

## Q5: The opening shot

**Decision (user, confirmed playback):** stand in the park at **local noon**; the title fades up over
the view; **look up at the sky**; the clock runs **noon → night** (sky darkens, stars come out —
the atmosphere's sky adaptation already fades stars by day); then the zoom out rises away from the
park, through Copenhagen, to the whole Earth.

## Q6: Where does the standing-eye camera come from?

**The question:** recon found frame-tagged camera writes (`frame?: PoseFrame`, #647) already exist and
stay pinned to the ground under a running clock (`evaluateClip.ts` legs, folded per frame against the
live clock; `engagedArmClock.test.ts`). But the `{ site }` rung is a turntable (≥ ~250 m, always
looking at the site) and `lookOffset` is not a clip channel. The planned **`{ sky }` rung** of the
sky-mode spec (`docs/superpowers/specs/2026-10-28-sky-mode-design.md` on branch `sky-mode`:
`SkyPose { lonRad, latRad, azimuthRad, altitudeRad }`, eye at `SKY_EYE_HEIGHT_M = 1.7`, clip channels
`target: [lon, lat, 0]`, `yaw: az`, `pitch: alt`) is exactly this vocabulary. It is not built.

**Considerations:**

- **Option A:** land the sky rung first as a slice of sky mode (rung + clip channels, clip-entry
  only); the tour builds on it.
- **Option B:** wait for the whole sky-mode feature (entry UI, drag, grids).
- **Option C:** open on the site turntable now; add the sky look later.

**Decision:** A. The rung is the shared joint; entry command, drag, grids and palette stay with sky
mode. With it the opening is plain frame-tagged tweens (`tween('pitch', { to, over, frame: SKY })`) —
no new aim effects.

## Q7: Which day does noon → night play on?

**Considerations:**

- **Fixed authored date:** plain Julian-date constants, identical runs, a sky chosen for the shot.
  Copenhagen (55.7° N) has no astronomical night May–July, and a full Moon washes out the Milky Way.
- **Today's date:** needs a local-solar-time helper (none exists); the sky varies run to run.

**Decision:** a **fixed authored date — dark and moonless** (candidate: a new-Moon October evening,
Milky Way high overhead; picked and eye-checked during the build).

## Q8: The clock cue (assistant's calls, stated and not objected to)

- **`clockTo(simDays, over)` is a new `SceneEffect` arm**, played as a `ClockProfile`
  (`startClockProfile`, the `missionPlaySaga` pattern) — not a `SettingsAction`; the clock is not a
  setting.
- **It joins `computeSceneEntering`'s fold**, so stepping back to beat 0 re-establishes noon (the
  "scene at beat K is a pure function of K" invariant).
- **The tour restores the viewer's clock on exit** (`clipBodySaga`'s `finally`), and **Home again
  lands in a `{ body: 'earth' }` leg**, so the clock snapping back to now can't strand the camera
  where Earth was on the tour date.

## Q9: Storyboard and "You are here"

**Considerations:** "You are here" on the Earth beat (the literal reading), kept on the Milky Way,
or on the park opening.

**Decision:** the beat list below; **"You are here" moves to the Earth beat**, and the Milky Way beat
becomes **"The Milky Way"**. Today's `openingTitle` cold open (Milky Way materialising from black) is
deleted; its scene strip (`hide([...])`, `setLabelsFocusedOnly`) moves into the park opening.

| #   | Beat                      | Notes                                        |
| --- | ------------------------- | -------------------------------------------- |
| 00  | The Long Way Out          | park, noon → night, look up; title           |
| 01  | You are here              | rise to the whole Earth, Copenhagen in view  |
| 02  | Earth and Moon            |                                              |
| 03  | The Solar System          |                                              |
| 04  | Our stellar neighbourhood |                                              |
| 05  | The Milky Way             | was beat 01 "You are here"                   |
| 06+ | existing beats from M31   | unchanged; Home again now lands on Earth     |

## Q10: Packaging

**Considerations:** #952 lands, sky-rung PR off main, one tour PR; or everything stacked on
`sky-mode`; or three PRs (sky rung, tour machinery, tour beats).

**Decision:** `main ← #952 (prep) ← sky-rung PR ← one tour PR (machinery + beats)`. The tour
machinery (`clockTo`, clock freeze/restore, fold) has no other caller, so it rides the beats. #949
(lens) is independent. **#952's P4 (the 1.7 m surface check) moves out** — it becomes the sky-rung
slice's first eye check — so #952 can leave draft (merge only on the user's explicit word).

## Q11: Caption copy

**Decision:** the assistant **drafts all six bodies in one pass** (per `docs/tour/writing-style.md`,
figures checked), the user edits before any beat is tuned.

---

## Left to the builder

- Per-beat choreography (frame legs sky → body → absolute on the rise, dwell lengths, orbits) — the
  live-tuning loop, beat by beat (`/tour`).
- The exact date/time constants (Q7), eye-checked.
- A cold-load gate: beat 0 waits for the park mesh, terrain and atmosphere to be resident.
- Separate, next: the caption layout → centred subtitles.
