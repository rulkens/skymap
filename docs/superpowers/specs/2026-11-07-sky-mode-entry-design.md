# Sky mode: entry, HUD and search while standing — design spec

> **Status.** Drafted 2026-11-07 from the grill session
> [`docs/grill-sessions/sky-mode-entry-ux-2026-11-07.md`](../../grill-sessions/sky-mode-entry-ux-2026-11-07.md)
> (Q1–Q15, all the owner's rulings) and the refactor-ground checkpoint the same day (signed off).
> **Builds on** the shipped sky arm: clip-only stand (#1032), look-around and the lift exit (#1059, #1077,
> [`completed/2026-11-06-sky-look-around-design.md`](completed/2026-11-06-sky-look-around-design.md)).
> **Supersedes** §4.2 (entry) and §6 (UI) of the 2026-10-28 draft spec on the stale `sky-mode` branch;
> that branch is archived as tag `archive/sky-mode` (§3.3, P4). What the draft held beyond this spec
> (sky grids, the `sky=` URL row, the lens on the pose codec and recorder, perf at a narrow lens) stays in
> the backlog item "Sky mode, the rest".
> **Scope.** Two PRs: the prep PR (§3.3) first, then the feature PR (§4–§9).

## 1. What this is

Today an ordinary user cannot stand on the ground and look up: only clips and a hand-made `#pose=k,…`
link reach the sky arm. This spec gives sky mode a way in that people find without being told, makes the
mode unmistakable while it is on, gives it one way out, and makes search mean "where do I look?" while
standing.

## 2. Rulings

The owner's (grill Q-numbers in brackets) and those carried from the 2026-10-28 draft.

| #   | Ruling |
| --- | ------ |
| R1  | Entry is a **"Look up from here" button** at the bottom centre, plus the `s` key and palette rows. [Q1, Q5] |
| R2  | **R6 of the draft is amended**: a fresh wheel-in (or pinch-in) that the surface floor eats whole enters sky mode, guarded like the exit (`SKY_EXIT_PAUSE_MS`, 250 ms of quiet). Zooming in through open air never enters. [Q2] |
| R3  | **Where you stand**: the push uses the point under the cursor (the wheel's existing anchor); the button, `s` and "Sky from here" use the point under the view centre. [Q3] |
| R4  | The button shows only **below 20 km**, with terrain of a terrain host (Earth, Mars) under the view centre. [Q4] |
| R5  | **Desktop preview**: hovering or focusing the button shows a ring at the view centre with the place and coordinates beside it. **Phone**: the place goes in the button label, no ring. [Q5, Q6] |
| R6  | **Place names**: the nearest `EARTH_PLACES` entry within 25 km, else coordinates. [Q7] |
| R7  | **Sky HUD**: a horizon compass at the bottom centre (place title, cardinal ribbon, caret, heading and altitude below), a readout in the scale bar's slot, the Navigation panel listing the sky gestures. [Q8] |
| R8  | **One exit button, Leave (Esc)**, under the compass readout; lift-off stays the wheel-out gesture. [Q9] |
| R9  | **Search while standing** turns the view to face the result and frames it by angular size; stars zoom in a little and keep context. [Q10, Q11] |
| R10 | **By day** the HUD offers "Skip to tonight". [Q12] |
| R11 | **Esc** closes an open card first; the next Esc leaves sky mode. [Q13] |
| R12 | **Below the horizon**: face where it rises and offer "Skip to when it rises"; something that never rises from here says so and offers nothing. [Q14] |
| R13 | Ground and horizon are the real terrain and atmosphere; eye height 1.7 m; perspective lens 0.5°–120°. (Draft R1, R3, R7.) |
| R14 | Sky mode is a **takeover**, a fourth `TakeoverSource` kind. (Draft R5.) |
| R15 | Leave restores **the camera only**: time, toggles and settings changed while standing stay. (Draft D2.) |

### Decisions made in this spec (not rulings — challenge freely)

- **D1.** `s` follows the button's gate; "Sky from <place>" and typed coordinates work at any altitude.
- **D2.** On a phone, pinch-in at the floor is the push (it reaches the arm as the same `zoom` step).
- **D3.** Arrival keeps the heading and the lens and looks 15° up (draft §4.2).
- **D4.** A star search sets the lens to half the current one, never below 10° and never wider than now.
- **D5.** The phone label reads "Look up from near Copenhagen" for a name from a nearby entry, else
  "Look up from 55.67° N 12.52° E". Mars shows coordinates.
- **D6.** "Skip to tonight" shows while the sun's altitude at the spot is above 0°. It jumps to the next
  moment the sun is 18° below the horizon; where that never happens that night (summer at high latitude) it
  jumps to the sun's lowest point instead.
- **D7.** A target below the horizon: face its rise azimuth at 10° altitude, keep the lens.
- **D8.** "Never rises": for things fixed on the sky (stars, galaxies, structures) by declination against
  latitude; for solar-system bodies, no rise in the next 48 h ("doesn't rise in the next two days").
- **D9.** **The camera frame says whether you are standing**, nothing else: the HUD, the compass, the
  `requestView` branch and the `selectSkyEntry` exclusion all read the sky-view readout row (non-null while
  the frame is `sky`). The takeover holds only what the frame cannot: the camera to restore. It has no phase.
- **D10.** Typed coordinates in the palette ("52.37, 4.89") give "Sky from 52.37° N 4.89° E" on the current
  terrain host, else Earth; this gives the salvaged `parseLatLonQuery` its consumer.
- **D11.** `restore` holds the entry camera **and the entry focus**. Entering focuses the spot's body (the
  sky arm releases unless focus is in its body's subtree, `skyCameraArm.ts:103`), so Leave must put focus back
  or the restored pose sits under the wrong focus. Time and settings still stay (R15).
- **D12.** Arrival is a camera clip whose last leg is in the `{ sky: spot }` frame, so the engine resolves the
  live ground at play time (clips already do: `clipKeyframeFrames.test.ts`, "a sky → body leg starts at the
  standing eye"). No saga needs terrain; `SagaContext` does not grow.
- **D13.** Only Esc and Leave restore. A link, Back, the hash or the remote ending the takeover behave like
  preemption: the incoming view wins.

## 3. Ground preparation

### 3.1 Ideal shape

- **Arms report, sagas decide.** A camera arm's step says only that a zoom limit was pushed
  (`pushed: 'in' | 'out'`); one saga maps (body, in) to entering sky mode at the cursor point and (sky, out)
  to the lift-off and the end of the takeover. Arms never know about modes or takeovers.
- **Engine readouts are rows.** The engine publishes per-frame UI facts through one table of readout rows;
  sky mode adds two rows (entry availability with the centre spot, and the live sky view).
- **A palette pick requests a view.** One saga decides what "show me this" means for the current mode:
  a focus (fly) in orbit, a head turn while standing. Focus itself does not change while standing.
- **Sky mode is a takeover variant** with its own body saga, beside tour, exhibit and clip.

### 3.2 Verdicts

| Touchpoint | Verdict | Joint |
| --- | --- | --- |
| Floor push enters | bolt-on today | P1 (pushed signal) |
| Lift-off ends the takeover | bolt-on today | P1 |
| Entry availability + centre spot to the UI | bolt-on today (a third hand-written readout) | P2 |
| Live heading/altitude/lens to the compass | bolt-on today (a fourth) | P2 |
| Search turns the head | bolt-on today (focus is hard-wired; it would release the sky arm) | P3 |
| `TakeoverSource` `sky` variant + body saga | growth | — |
| Entry button, sky HUD, phone label | growth (new components) | — |
| Navigation rows by mode | growth (the first mode-dependent rows) | — |
| Esc peels the card first | growth (a state-aware `run`, like the tour keys) | — |
| Alt/az, sun altitude, next dark, next rise | growth (new `src/utils/` files) | — |
| Place name lookup | growth (`nearestEarthPlace`) | — |
| Framing by angular size | growth (every selection row has `radiusMpc`) | — |
| Typed coordinates row | growth (salvaged parser, P4) | — |

The greenfield cross-check agreed on the pushed signal and the readout rows. It proposed focus as a
per-arm method and a takeover descriptor registry; both were rejected at the checkpoint (focus fans out to
six reactors; sky is the first takeover with its own HUD, a registry pays at the second).

### 3.3 Prep (PR 1, before the feature)

Each is its own commit, behaviour-preserving, with its test.

- **P1. Arms report a pushed zoom limit; freshness is decided once.** The step result's `clip?: ClipData`
  becomes `pushed?: ZoomLimitPush`, a value without an `arm` tag: `{ edge: 'out', lift }` from the sky arm
  for a fresh wheel-out its widest lens ate (the `skyExitLift` clip built by the arm, which alone has the
  engine ctx), `{ edge: 'in', body, pointLocalM }` from the body arm for a fresh zoom-in that starts at the
  floor (definition: §4.2), the cursor anchor in body-fixed metres. `replayInput` only reports it
  (`zoomLimitPushed`); `watchZoomLimitSaga` plays the lift on `out` and ignores `in` until the feature,
  which derives the sky spot from `body` + `pointLocalM` where it needs it. A zoom `InputStep` carries
  `fresh: boolean`, stamped once by the `input` slice: each source keeps its own `lastWheelMs`
  (`Motion.eventMs` is the SOURCE's clock) and a notch is fresh after `FRESH_WHEEL_PAUSE_MS`
  (`src/data/input/freshWheelPauseMs.ts`) of that source's wheel quiet, a folded run judged by its first
  event. No arm or runtime keeps a wheel clock. Tests: the lift still plays from a fresh wheel-out at the
  widest lens; a trackpad tail does not.
- **P2. Frame readouts become rows.** The two hand-written blocks in `runFrame` (`engineScaleChanged`,
  `runFrame.ts:160`; `engineBodyDistanceReported`, `runFrame.ts:220`) become rows of one table walked once a
  frame. Store keys, reducers and their dedup/throttle stay; no reader changes. Mind the frame-file purity
  ratchet (`tests/services/engine/frame/frameFilePurity.test.ts`).
- **P3. A palette pick requests a view.** `actionsForPaletteAction`'s `focus` case returns
  `[requestSelect(id), requestView({ id })]`; `watchRequestViewSaga` puts
  `requestFocus({ id, transition: 'fly' })`. The InfoCard's Focus button and `F` keep `requestFocus`.
- **P4. Salvage and archive.** Bring over from `origin/sky-mode` commit `976f7a650`:
  `src/utils/geo/parseLatLonQuery.ts`, `parseCompassDegrees.ts`, the `parseLonLatInput.ts` refactor onto it,
  `src/@types/scene/CompassDegrees.d.ts` and their two tests; plus the HiPS survey backlog file and its index
  line. Then push tag `archive/sky-mode` at `origin/sky-mode`, point the "Sky mode, the rest" detail file at
  it for the grid utils (`sphericalGridLines`, `meridianLine`, `parallelLine`, `hostEquatorialFrame`) and the
  draft spec, and delete the remote branch.

## 4. Entry

### 4.1 The availability readout

A readout row publishes `skyEntryFacts: { spot: SkySpot | null; altitudeM: number }`: the view-centre
ground hit on the engaged body (the terrain raycast the body arm already uses, `raycastTerrain`,
`cursorRayBodyLocal` at the viewport centre), null on a miss or a host without terrain. One selector,
`selectSkyEntry`, applies the rest of the gate: `spot !== null && altitudeM < SKY_ENTRY_MAX_ALT_M (20 000)
&& skyView === null` (not standing, D9) and no tour, exhibit or clip running. The button, `s` and
"Sky from here" all read it. The spot is published only when it moves by more than about a metre, so a still
view dispatches nothing.

### 4.2 The ways in

| Way | Gate | Spot |
| --- | --- | --- |
| "Look up from here" button | `selectSkyEntry` | the readout's centre spot |
| `s` | `selectSkyEntry` (returns `null` otherwise) | the centre spot |
| Palette "Sky from here" | row listed only while `selectSkyEntry` holds | the centre spot |
| Palette "Sky from <place>" | any altitude, beside each `EARTH_PLACES` match | the place's lon/lat on Earth |
| Palette typed "lat, lon" | any altitude (`parseLatLonQuery`) | that point on the current terrain host, else Earth |
| Wheel/pinch push at the floor | (body, in) from P1 | the cursor anchor (`anchorLocalM`) as lon/lat |

All of them dispatch `enterSky({ spot })`. The palette gets a `sky` `PaletteAction` kind and matching
`ScoredRow` rows; `remoteCommands` parses the same.

**The push** (owner ruling, 2026-11-07): a fresh zoom-in notch whose eye **starts** at the floor height
(`surfaceFloorM` at the eye, within a small tolerance) reports (body, in), whether or not the notch still
slides the eye toward the cursor anchor. At the floor the view is usually oblique, so a notch is rarely eaten
whole; waiting for that would make the push almost never fire. The arrival then glides to the cursor point
and stands (§4.3), which finishes the zoom the person was aiming.

### 4.3 Arrival

`watchTakeoverSaga` builds the source once: `restore = outgoing sky takeover's restore ?? { camera.base,
focus }` (D11). The sky body saga focuses the spot's body and plays the arrival as a camera-level clip
(`clipStarted`, never `startClip`, which would preempt the takeover): legs that keep the heading down to the
floor above the spot, then a zero-length leg in the `{ sky: spot }` frame at that heading, 15° up, keeping
the lens (D3, D12). From another body or deep space the first leg is the flight to the spot's body that
`flyToLonLat` already makes. A push from the floor plays only the short glide to the cursor point and the
sky leg. `enterSky` while standing goes through the normal supersede path: the running sky takeover is
cancelled (a cancelled run puts no `takeoverEnded`, so nothing flashes) and the new one inherits its
`restore`.

### 4.4 The button

Bottom centre: desktop mounts it beside `ScaleBarContainer` in `App.tsx`'s desktop branch; the phone mounts
it as a `BottomStack` slot offset by `--bottom-stack-height` and `--sheet-lift`, like `ScaleBracket`, and it
must not overlap the scale bracket (the 400 px mockups showed that collision). Label "Look up from here" with
the `S` key printed dim on it (ui-ux Interaction 6). Desktop hover and focus show the preview ring at the view
centre with the place line; the phone label carries the place (D5). Fade in and out on the gate, 200 ms,
with a reduced-motion branch.

## 5. The sky takeover

- **Variant**: `{ kind: 'sky'; spot: SkySpot; restore: SkyRestore }` in `TakeoverSource`, with
  `SkyRestore = { base: FramedCameraPose; focus: FocusRef | null }` (D11). It has no `id`:
  `watchHashReadSaga.ts:92` (`names(takeover.kind, takeover.id)`) must treat sky as named by no hash, so a
  hash change while standing ends it like preemption.
- **Body saga**, beside `clipBodySaga`, skipping `withSceneSnapshotSaga` like clips (R15), in this order:
  the arrival clip (§4.3); then `race({ leave: take(exitTakeover with restore), left: take(a camera commit
  whose frame is not sky) })`; then, only if `leave` won, a tween back to `restore.base` and focus back to
  `restore.focus`. The `left` arm covers lift-off, the card's Focus or `F` flying away and any clip; no
  separate rule for each.
- **`exitTakeover({ restore?: true })`**: Esc and Leave pass `restore: true`; `navigateSaga`,
  `watchHashReadSaga` and the remote do not (D13). Tours and exhibits ignore the flag.
- **Esc** (`keyboardShortcuts.ts:57`): `run: (s) => selection open ? clearSelection() :
  exitTakeover({ restore: true })` (R11). The exhibit key claim (`watchKeyboardEventsSaga.ts:45`) is unchanged.
  Tours and exhibits get the same order.
- **Lift-off**: (sky, out) → the `skyExitLift` clip; its body-frame end commit is the `left` arm.
- **Standing with no takeover** (a `#pose=k` link, a sky clip's end): the HUD still shows (D9), and Leave or
  Esc lifts off, the same as a wheel-out past 120° (owner ruling, 2026-11-07). The saga from P1 that starts
  the lift also takes `exitTakeover({ restore: true })` while standing with no takeover running.
- **Preemption**: a tour, exhibit or clip start cancels it through `watchTakeoverSaga`; the new taker's pose
  wins, no restore.

## 6. HUD

Mounted while the sky-view readout is non-null (D9) and no tour, exhibit or clip is running, desktop and
phone. Mockups: grill Q8 (variant B2), shot in the real UI; rebuild them with the `mockup` skill
(`npm run mock`, PR #1085 — the HUD tasks wait for it on main) before building, at 1728 and 400 wide.

- **Compass** (bottom centre): the place title (display face) with a small "Sky" tag; a ribbon about 120°
  wide with ticks every 5°, numbers every 15°, cardinal and intercardinal letters, faded at both ends; an
  accent caret under the centre; below it the readout "180° · 34° up". It reads the sky view readout row
  (`{ azimuthRad, altitudeRad, fovYRad } | null`, rounded to 0.5°) so it follows a drag live.
- **Leave** under the readout: "Leave" with `Esc` printed dim. With **Skip to tonight** (D6) and **Skip to
  when it rises** (§7) beside it when they apply; each jumps the clock with `manualPausedAtActions` and is
  undone by the Time bar's "Now".
- **Readout in the scale bar's slot**: field of view and the spot's coordinates (desktop `ScaleBar`, phone
  `ScaleBracket`).
- **Navigation panel**: rows keyed by mode; sky rows are Drag "look around", Wheel "field of view",
  "Wheel out at 120°" "lift off", Esc "close card, then leave".
- **Phone**: a narrower ribbon (fits 400 px with the side gutters), the same Leave row, inside the safe-area
  insets; nothing overlaps the Dock or the sheet.

## 7. Search while standing

`watchRequestViewSaga` (P3) branches on the camera frame (D9): standing → a sky look; otherwise the focus it
puts today.

- **Direction**: the selection row's `positionMpc` seen from the standing eye, turned into azimuth and altitude
  in the spot's east-north-up frame at the current sim time (a new `altAzFromSpot` helper; the conversion
  already exists for a view's forward vector in `skyPoseFromBodyArm.ts:17`).
- **Lens**: angular diameter `2·atan(radiusMpc / distance)`; lens = `clamp(3 × diameter, LENS_MIN_DEG,
  current lens)`, so a search never widens the view. Star rows (`starCatalog`) use D4.
- **Motion**: a short tween of yaw, pitch and lens in the sky frame. If the camera tween cannot target a
  sky-frame pose, use a camera-level clip (`clipStarted`, never `startClip`, which would preempt the sky
  takeover) with the sky arm's channels (clips already drive the sky arm with `frame: { sky }`, see
  `clipKeyframeFrames.test.ts`).
- **Below the horizon** (R12, D7, D8): face the rise azimuth at 10°, keep the lens, and show "Skip to when it
  rises" (jumps the clock to `nextRiseAt`). Never rises: the card says "Never rises from here" (fixed objects)
  or "Doesn't rise in the next two days" (bodies), and no skip button.
- The result is selected (`requestSelect`) as today, so its card opens; Esc closes it first (R11).

## 8. Place names

`nearestEarthPlace(lonDeg, latDeg): EarthPlace | null` — great-circle distance to each `EARTH_PLACES`
entry, nearest within 25 km. One `placeLabel(spot)` turns a spot into the display string ("Søndermarken,
Copenhagen" style names stay as the entry's first name; otherwise "55.67° N 12.52° E"), used by the preview,
the phone label and the compass title. Mars returns coordinates. A gazetteer (GeoNames, IAU) is backlog.

## 9. Tests (acceptance)

Per `docs/superpowers/conventions/testing.md`: each one fails on a real bug nothing else catches.

- Prep: P1 the lift still fires from a fresh wheel-out and not from a tail, and a fresh notch that starts at
  the floor reports (body, in) while one that starts above it does not; P2 scale and body distance still
  dispatch with their dedup; P3 a pick still flies outside sky mode.
- Leave with no takeover (a `#pose=k` link) lifts off.
- `selectSkyEntry`: false above 20 km, on a miss, on a host without terrain, while standing.
- Entry: each way in reaches `enterSky` with the spot its row names (centre vs cursor anchor); a push within
  250 ms of the last notch does not enter; re-entry while standing keeps the first `restore`.
- Takeover: Leave restores the entry camera and focus; lift-off and a frame change end it without restoring;
  a tour start and a hash change end it without restoring.
- Esc: with a card open, the first Esc clears the selection and keeps the takeover; the second exits.
- Search: a pick while standing leaves focus unchanged and the camera in the sky frame; the framed lens for
  a sized row is `3 × diameter` clamped; a star follows D4; a target below the horizon faces its rise azimuth.
- Astronomy helpers: sun altitude at a known place and time against a reference value; next dark and next
  rise against reference times (one each, Copenhagen); never-rises by declination.
- `nearestEarthPlace`: inside and outside 25 km.
- UI: interaction tests per ui-ux.md for the button gate, hover preview, Leave and the skip buttons.

## 10. Eye checks

On this worktree's dev server; before/after pairs per the `dev` skill; mockups per the `mockup` skill.

- Night at Søndermarken, HUD on:
  `#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,0.6&t=2026-11-07T22:00:00Z`
- Day at the same spot ("Skip to tonight" visible): same pose with `t=2026-11-07T12:00:00Z`.
- The entry button and hover ring at about 15 km over Copenhagen (copy a pose with the Debug panel's camera
  "copy URL" after flying there), desktop and `--phone`.
- Search Saturn by day from the night pose's spot (below the horizon → rise azimuth and skip offer).

## 11. Left to the builder

- Exact compass tick density on a phone, tween durations (within ui-ux Motion limits), the ring's look.
- Where the readout row table lives (respecting the frame-file purity ratchet).
- Rounding thresholds for the readouts.
- Copy beyond what is quoted here, per the ui-ux Copy rules.
