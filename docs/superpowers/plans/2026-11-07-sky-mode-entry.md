# Sky mode entry and HUD — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean
> protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** a person finds sky mode without being told, enters it (button, `s`, palette, floor push), knows
they are in it (compass HUD), leaves it one way (Leave/Esc), and search while standing turns the head.

**Architecture:** prep PR first (arms report a pushed zoom limit; frame readouts as rows; a palette pick
requests a view; salvage + archive), then the feature PR on top (readout rows, `sky` takeover saga, search
look, palette rows, entry button, HUD).

**Spec:** `docs/superpowers/specs/2026-11-07-sky-mode-entry-design.md` (rulings R1–R15, decisions D1–D13).
Grill transcript: `docs/grill-sessions/sky-mode-entry-ux-2026-11-07.md`.

## Global constraints

- `type` aliases only; one symbol per file in `utils/` and `@types/`; frame files export one symbol
  (`tests/services/engine/frame/frameFilePurity.test.ts`); comment budget per
  `docs/superpowers/conventions/comments.md`.
- Moves and renames go through `npm run move-files -- <from> <to>` and `npm run refactor -- rename …`,
  never `git mv` + hand-edited imports.
- UI work follows `docs/superpowers/conventions/ui-ux.md` (tokens only, keys printed on controls, 1728 and
  400 px shots, reduced-motion branch). Copy is literal and sentence case: "Look up from here",
  "Look up from near Copenhagen", "Leave", "Skip to tonight", "Skip to when it rises",
  "Never rises from here", "Doesn't rise in the next two days".
- Constants: `SKY_ENTRY_MAX_ALT_M = 20_000`; place radius 25 km; lens `LENS_MIN_DEG` 0.5 to `LENS_MAX_DEG`
  120; fresh wheel pause 250 ms; arrival looks 15° up; below-horizon look 10° up; star lens = half the
  current, min 10°, never wider; framed lens = `3 × angular diameter`; night = sun 18° below the horizon.
- Esc and Leave restore; links, Back, the hash and the remote end sky mode without restoring (D13).

## Review focus

1. **Searching the body you stand on** ("Earth" while standing on Earth): expect a normal focus fly (it
   leaves sky mode), never a look straight down at the planet's centre. Test in Task 9.
2. **A spot near a pole** (lat 89.9°): expect finite azimuths and a usable entry, no NaN pose. Test in
   Task 5.
3. **Mars**: entry, sun altitude and "Skip to tonight" work on Mars's sun and rotation; the place label is
   coordinates. Tests in Tasks 5 and 6.
4. **Re-entry chain** (Sky from Paris while standing in Amsterdam, then Leave): expect the camera from
   before the first entry, not Amsterdam. Test in Task 8.
5. **Live clock while standing**: "Skip to tonight" from live mode lands the clock in manual, paused, at the
   target; the Time bar's "Now" returns to live. Test in Task 11.

---

## PR 1 — prep (branch `worktree-enter-sky-mode`, this worktree)

### Task 1: Freshness is decided once, in the drain

review: yes

**Files:** `src/@types/camera/input/InputStep.d.ts`, `src/utils/input/pendingToInputSteps.ts`,
`src/services/engine/camera/input/replayInput.ts`, `src/services/engine/camera/arms/sky/skyCameraArm.ts`,
`src/@types/camera/arms/MemOf.d.ts`, `src/@types/camera/arms/SkyWheelMemory.d.ts` (delete),
`src/services/engine/camera/arms/sky/data/emptySkyWheelMemory.ts` (delete),
`src/services/engine/camera/arms/sky/data/skyExitPauseMs.ts` → `src/data/input/freshWheelPauseMs.ts`,
the arms that construct zoom steps (`absoluteCameraArm.ts:59`, `site/utils/nudgedSitePose.ts:24`), tests
under `tests/services/engine/camera/`.

**Contract:**

```ts
// InputStep zoom member
| { kind: 'zoom'; factor: number; duringGesture: boolean; cursorPx: Vec2 | null; fresh: boolean }
// src/data/input/freshWheelPauseMs.ts
export const FRESH_WHEEL_PAUSE_MS = 250;
```

`fresh` is true for a wheel notch that comes at least `FRESH_WHEEL_PAUSE_MS` after the previous wheel notch;
one wheel clock lives where the drain runs (the camera runtime), never in an arm's memory. Nudge-built zoom
steps are `fresh: false`. `MemOf['sky']` becomes `null`.

- [x] Move the constant: `npm run move-files -- src/services/engine/camera/arms/sky/data/skyExitPauseMs.ts src/data/input/freshWheelPauseMs.ts` (in `data/input/`: `data/camera/` is at the 15-file folder cap),
      then `npm run refactor -- rename SKY_EXIT_PAUSE_MS FRESH_WHEEL_PAUSE_MS` (check the refactor skill for
      the exact syntax).
- [x] Test `a wheel notch after 250 ms of quiet is fresh; one inside it is not` (drain level).
- [x] Sky arm reads `input.fresh` instead of `memory.lastWheelMs`; delete `SkyWheelMemory` and its empty value.
- [x] Existing sky exit tests stay green: the lift fires from a fresh wheel-out at 120°, not from a tail.
- [x] Commit.

### Task 2: Arms report a pushed zoom limit

review: yes

**Files:** `src/services/engine/camera/arms/@types/CameraArmRow.d.ts`, `src/@types/camera/arms/ZoomLimitPush.d.ts`
(new), `src/services/engine/camera/arms/sky/skyCameraArm.ts`, `src/services/engine/camera/arms/body/bodyCameraArm.ts`
(+ `gesture/surfaceStep.ts` / `utils/surfaceZoomStep.ts` as needed), `src/services/engine/camera/input/replayInput.ts`,
`src/state/camera/zoomLimitPushed.ts` (new action), `src/state/camera/watchZoomLimitSaga.ts` (new),
the root saga registration, tests.

**Contract:**

```ts
export type ZoomLimitPush =
  | { readonly edge: 'out'; readonly lift: ClipData } // sky arm: a fresh notch the widest lens ate
  | { readonly edge: 'in'; readonly spot: SkySpot; readonly pointLocalM: Vec3 }; // body arm, see below
// CameraArmRow.step result: `clip?: ClipData` is replaced by
readonly pushed?: ZoomLimitPush;
// replayInput emits
zoomLimitPushed(push: ZoomLimitPush) // reducer-less action
```

Controller ruling (2026-11-07): `skyExitLift` needs engine-only context (`hostOrThrow`, `groundRadiusAtM`,
`foldToWorld`), so the arm builds the lift as a value inside the push and the saga decides whether to play it.
The body arm reports `edge: 'in'` for a fresh zoom-in notch whose eye **starts** at the floor height
(`surfaceFloorM` at the eye, within 1 cm), whether or not the notch still slides the eye; `spot` and
`pointLocalM` are the cursor anchor (the terrain pick the zoom already makes) as a sky spot and a body-local
point. `watchZoomLimitSaga`: on `edge: 'out'` put `clipStarted({ data: lift, frame: <orientation> })`
(what `replayInput.ts:118` did); on `edge: 'in'` do nothing yet (Task 8 wires it).

- [x] Test `a fresh wheel-out at the widest lens reports edge out with a lift clip; the saga plays it`.
- [x] Test `a fresh zoom-in that starts at the floor reports edge in at the cursor anchor`.
- [x] Test `a zoom-in that starts above the floor reports nothing`; `a non-fresh notch at the floor reports nothing`.
- [x] Commit.

### Task 3: Frame readouts become rows

**Files:** `src/services/engine/frame/runFrame.ts:160-167` and `:220-229`, a new row type in
`src/@types/engine/frame/FrameReadoutRow.d.ts`, the rows and their table (placement must satisfy the frame-file
purity ratchet), tests only if a row's gating logic moves (`publishBodyDistanceGate` keeps its behaviour).

**Contract:** `type FrameReadoutRow = { readonly publish: (frame: FrameReadoutCtx, dispatch: AppDispatch) => void }`
where `FrameReadoutCtx` carries what the two current blocks read. `runFrame` walks the table once per booted
frame. `engineScaleChanged` and `engineBodyDistanceReported` and their reducers are unchanged.

- [x] Move both blocks into rows; no new test (routing change; the existing scale/body-distance tests pin it).
- [x] Commit.

### Task 4: A palette pick requests a view; salvage and archive

review: yes

**Files:** `src/utils/palette/actionsForPaletteAction.ts`, `src/state/selection/requestView.ts` (new),
`src/state/selection/watchRequestViewSaga.ts` (new), root saga registration,
`tests/utils/palette/actionsForPaletteAction.test.ts` (if it exists) ; salvage paths below.

**Contract:** `requestView = createAction<{ id: string }>('selection/requestView')`. The `focus` case returns
`[requestSelect(id), requestView({ id })]`; `watchRequestViewSaga` puts `requestFocus({ id, transition: 'fly' })`.
InfoCard Focus and `F` keep `requestFocus`.

- [x] Test `a palette pick still selects and flies` (through the saga).
- [x] Commit.
- [x] Salvage from `origin/sky-mode` commit `976f7a650`:
      `git checkout origin/sky-mode -- src/utils/geo/parseLatLonQuery.ts src/utils/geo/parseCompassDegrees.ts src/utils/geo/parseLonLatInput.ts src/@types/scene/CompassDegrees.d.ts tests/utils/geo/parseLatLonQuery.test.ts tests/utils/geo/parseCompassDegrees.test.ts`
      plus `docs/backlog/2026-10-28-survey-sky-overlays-hips.md` and its `docs/BACKLOG.md` line (from the
      branch's `docs/BACKLOG.md`). Run their tests. Commit ("salvage lat/lon parsers from the sky-mode draft").
- [ ] Archive (controller only): `git push origin origin/sky-mode:refs/tags/archive/sky-mode`, then
      `git push origin --delete sky-mode`.

**Prep PR:** push, open "Sky mode prep: pushed zoom limits, readout rows, view requests", watch CI.

---

## PR 2 — feature (branch `feat/sky-mode-entry`, stacked on the prep branch)

### Task 5: Sky astronomy helpers

**Files (new, one function each):** `src/utils/sky/altAzFromSpot.ts`, `src/utils/sky/sunAltitudeAt.ts`,
`src/utils/sky/nextSunBelowAt.ts`, `src/utils/sky/nextRiseAt.ts`, `src/utils/sky/neverRises.ts`, tests in
`tests/utils/sky/`.

**Signatures:**

```ts
altAzFromSpot(spot: SkySpot, targetWorldMpc: Vec3, simDays: number): { azimuthRad: number; altitudeRad: number }
sunAltitudeAt(spot: SkySpot, simDays: number): number // radians
nextSunBelowAt(spot: SkySpot, simDays: number, altitudeRad: number): number | null // simDays; null = not within 24 h
nextRiseAt(spot: SkySpot, simDays: number, targetAt: (simDays: number) => Vec3, horizonDays: number): number | null
neverRises(declinationRad: number, latitudeRad: number): boolean
```

Build alt/az from the spot's ENU frame and the body's orientation the way `skyPoseFromBodyArm.ts:17-27` and
`sunDirLocal` do; sample then bisect for the two searches.

- [x] Test `sun altitude at Copenhagen matches a reference` — two instants (noon and 22:00 UTC, 2026-11-07),
      reference values taken from the NOAA solar calculator, cited in the test, tolerance 0.3°.
- [x] Test `next astronomical dark at Copenhagen matches a reference` (same source, tolerance 2 min) and
      `returns null for a white night` (Copenhagen, 2026-06-21, −18°).
- [x] Test `neverRises` for the Southern Cross from 55.7° N (true) and Vega from 55.7° N (false).
- [x] Test `altAzFromSpot at lat 89.9° returns finite values` (Review focus 2).
- [x] Test `sun altitude on Mars uses Mars's rotation` — one Mars instant against a value derived in the test
      from the IAU rotation elements already in `orientationForBody`.
- [x] Commit.

### Task 6: Place names

**Files (new):** `src/utils/places/nearestEarthPlace.ts`, `src/utils/places/placeLabel.ts`, tests.

**Signatures:** `nearestEarthPlace(lonDeg: number, latDeg: number): EarthPlace | null` (great circle, within
25 km); `placeLabel(spot: SkySpot): { text: string; near: boolean }` — Earth: the entry's first name, `near: true`;
otherwise and on Mars: `"55.67° N 12.52° E"` (2 decimals, hemisphere letters), `near: false`.

- [x] Tests: `inside 25 km of Søndermarken names it`, `40 km out gives coordinates`, `Mars gives coordinates`.
- [x] Commit.

### Task 7: Sky readout rows and selectors

review: yes

**Files:** two rows in the Task 3 table (`skyEntryFacts`, `skyView`), `src/state/engine/engineSlice.ts`
(two fields + reducers with dedup), `src/@types/store/CoreEngineSliceState.d.ts`, `src/@types/engine/SkyEntryFacts.d.ts`,
`src/@types/engine/SkyView.d.ts`, `src/state/sky/selectSkyEntry.ts`, tests.

**Contract:**

```ts
type SkyEntryFacts = { readonly spot: SkySpot | null; readonly pointLocalM: Vec3 | null; readonly altitudeM: number };
type SkyView = { readonly spot: SkySpot; readonly azimuthRad: number; readonly altitudeRad: number; readonly fovYRad: number } | null;
selectSkyEntry(state: RootState): SkyEntryFacts['spot'] // non-null only when the gate holds
```

`skyEntryFacts`: the view-centre terrain pick on the engaged body (`raycastTerrain` + `cursorRayBodyLocal` at the
viewport centre), null on a miss or a host without terrain; republished only when the spot moves > 1 m or the
altitude crosses 20 km. `skyView`: non-null while the camera frame is `sky`, rounded to 0.5°. The gate:
`spot !== null && altitudeM < 20_000 && skyView === null && no tour, exhibit or clip running`.

- [x] Tests: `selectSkyEntry` false above 20 km, on a miss, on a host without terrain, while standing, during a tour.
- [x] Commit.

### Task 8: The sky takeover

review: yes

**Files:** `src/@types/takeover/TakeoverSource.d.ts`, `src/@types/takeover/SkyRestore.d.ts` (new),
`src/state/takeover/watchTakeoverSaga.ts`, `src/state/sky/enterSky.ts` (new action),
`src/state/sky/skyBodySaga.ts` (new), `src/state/sky/arrivalClip.ts` (new pure builder),
`src/state/camera/watchZoomLimitSaga.ts` (wire edge in), `exitTakeover` (payload), `src/state/url/watchHashReadSaga.ts:92`,
`InputStep` (`liftOff` member) + `pendingToInputSteps` + the input slice + `skyCameraArm.ts`,
`src/state/input/keyboardShortcuts.ts:57`, `src/components/NavigationPanel/NavigationPanel.tsx` (Esc row copy), tests.

**Contract:**

```ts
| { kind: 'sky'; spot: SkySpot; restore: SkyRestore } // TakeoverSource member
type SkyRestore = { readonly base: FramedCameraPose; readonly focus: FocusRef | null };
enterSky = createAction<{ spot: SkySpot; pointLocalM: Vec3 | null }>('sky/enter');
exitTakeover = createAction<{ restore?: true } | undefined>(…) // Esc and Leave pass { restore: true }
arrivalClip(start: WorldPose, spot: SkySpot, pointLocalM: Vec3 | null, headingRad: number, fovYRad: number): ClipData
```

Behaviour (spec §4.3, §5): `watchTakeoverSaga` builds `restore = outgoing sky restore ?? { camera.base, focus }`.
The body saga focuses the spot's body, plays `arrivalClip` with `clipStarted` (never `startClip`): legs down to the
floor above the spot keeping the heading (target `pointLocalM` when known, else the datum point), then a
zero-length leg in `{ sky: spot }` at the heading, 15° up, the current lens. Then
`race({ leave: take(exitTakeover with restore), left: take(commit whose frame is not sky) })`; restore
(tween to `restore.base`, focus to `restore.focus`) only if `leave` won. `watchZoomLimitSaga` maps `edge: 'in'`
to `enterSky`, and `exitTakeover({ restore: true })` while standing with no takeover to queuing a new input
step `{ kind: 'liftOff' }` through the existing pending-input channel (`pendingToInputSteps`); the sky arm answers
it with the same `pushed: { edge: 'out', lift }` as a widest-lens wheel-out, so the lift is still built only in
the engine (Task 2's ruling). Esc: `selection open ? clearSelection() : exitTakeover({ restore: true })`. Hash: sky
is named by no hash.

- [x] Tests: `Leave restores the entry camera and focus`; `lift-off ends it without restoring`;
      `a tour start ends it without restoring`; `a hash change ends it without restoring`;
      `re-entry keeps the first restore` (Review focus 4); `Esc with a card open clears the selection and keeps the takeover`;
      `a push at the floor enters at the cursor anchor`; `a push within 250 ms does not enter`;
      `Leave while standing with no takeover lifts off`.
- [x] Commit.

### Task 9: Search while standing

review: yes

**Files:** `src/state/selection/watchRequestViewSaga.ts`, `src/state/sky/skyLookFor.ts` (new pure),
`src/utils/sky/framedLensRad.ts` (new), tests.

**Contract:**

```ts
framedLensRad(radiusMpc: number, distanceMpc: number, currentLensRad: number, isStar: boolean): number
skyLookFor(row: PlacedRow, spot: SkySpot, simDays: number, currentLensRad: number):
  | { kind: 'look'; azimuthRad: number; altitudeRad: number; fovYRad: number }
  | { kind: 'belowHorizon'; azimuthRad: number; riseAt: number | null; neverRises: boolean }
```

Standing (sky view non-null): `look` → a short sky-frame tween (or camera-level clip, never `startClip`) of
yaw, pitch, lens; `belowHorizon` → face the rise azimuth at 10°, keep the lens, expose `riseAt`/`neverRises`
to the HUD (store field on the sky takeover or a small slice; builder's choice, one writer). Lens: sized rows
`clamp(3 × 2·atan(r/d), 0.5°, current)`; star rows (`starCatalog`) half the current, min 10°, never wider.
**The body you stand on, or the Sun-system body hosting the spot, falls back to `requestFocus` (fly).**

- [x] Tests: `a pick while standing keeps focus and the sky frame`; `M31 frames at about 3 × its diameter`;
      `a star halves the lens down to 10°`; `a target below the horizon faces its rise azimuth`;
      `searching the host body flies` (Review focus 1).
- [x] Commit.

### Task 10: Palette rows

**Files:** `src/@types/palette/PaletteAction.d.ts`, the `ScoredRow` type, `src/utils/palette/rankPaletteMatches.ts`,
`src/utils/palette/actionForRow.ts`, `src/utils/palette/paletteRowLabel.ts`, `src/utils/palette/actionsForPaletteAction.ts`,
`src/state/remote/remoteCommands.ts`, tests.

**Contract:** `| { kind: 'sky'; spot: SkySpot | 'here' }` in `PaletteAction`. Rows: "Sky from here" while
`selectSkyEntry` holds; "Sky from <place>" beside each `EARTH_PLACES` match; a `parseLatLonQuery` hit gives
"Sky from 52.37° N 4.89° E" on the current terrain host, else Earth. All map to `enterSky`.

- [ ] Tests: `a typed lat, lon yields a sky row`; `a place match yields its sky row beside the fly-to`;
      `Sky from here is listed only when entry is available`.
- [ ] Commit.

### Task 11: Entry button, `s`, and the sky HUD

**Files:** new components per the `create-component` skill under `src/components/SkyEntryButton/`,
`src/components/SkyHud/` (compass, readout, Leave, skip buttons), their containers, `src/components/App/App.tsx`
(desktop mount), `src/components/PhoneHudContainer/…` + `BottomStack` slot (phone), `ScaleBar`/`ScaleBracket`
slot swap, `src/components/NavigationPanel/NavigationPanel.tsx` (rows by mode), `src/state/input/keyboardShortcuts.ts`
(`s`), interaction tests per ui-ux.md.

Design source: the grill mockups (Q5 hover ring `g1`, Q6 phone label `p4`, Q8 HUD `B2`) — re-shoot each state
with `npm run shot` at 1728×1000 and 400×850 and compare. Behaviour per spec §4.4 and §6: the button shows on
`selectSkyEntry`, `S` printed dim; desktop hover/focus shows the centre ring + place line; phone label carries
`placeLabel` ("Look up from near Copenhagen" / coordinates); the HUD mounts while the sky view is non-null and no
tour, exhibit or clip runs; compass ribbon ~120°, ticks 5°, numbers 15°, letters, caret, readout
"180° · 34° up"; Leave with `Esc`; "Skip to tonight" while the sun is above 0° (to `nextSunBelowAt(−18°)`, else
the sun's lowest point that night); "Skip to when it rises" from Task 9; both via `manualPausedAtActions`.
Navigation sky rows: Drag "look around", Wheel "field of view", "Wheel out at 120°" "lift off", Esc
"close card, then leave".

- [ ] Interaction tests: button gate show/hide; hover shows the ring; Leave dispatches `exitTakeover({ restore: true })`;
      `Skip to tonight from live mode lands manual, paused, at the target` (Review focus 5).
- [ ] Shots at both widths for: entry rest, entry hover, phone entry, HUD night, HUD day (skip visible).
- [ ] Commit.

**Feature PR:** push, open "Sky mode: look up from here, compass HUD, search turns your head", stacked on the
prep PR, watch CI. Perf gate (controller ruling): `npm run perf:cpu` at the Søndermarken sky pose and a 15 km
pose over Copenhagen, before (prep head) and after; report the delta in the PR.

## Definition of Done

**Deliverables:** `zoomLimitPushed` + `ZoomLimitPush`; `FrameReadoutRow` table; `requestView`; salvaged
`parseLatLonQuery`; tag `archive/sky-mode` pushed and branch `sky-mode` deleted; `altAzFromSpot`,
`sunAltitudeAt`, `nextSunBelowAt`, `nextRiseAt`, `neverRises`, `nearestEarthPlace`, `placeLabel`;
`skyEntryFacts` and `skyView` readouts; `selectSkyEntry`; `TakeoverSource` `sky` + `skyBodySaga`; sky palette
rows; `SkyEntryButton`, `SkyHud`.

**Smoke (manual, on the dev server):**

- Below 20 km over Copenhagen the "Look up from here" button appears; hovering shows the ring and
  "Søndermarken, Copenhagen"-style place; above 20 km it hides.
- Click → descent → standing at 15° up with the compass HUD; drag turns the compass live.
- Wheel push at the floor enters at the cursor point; wheel-out past 120° lifts off and the HUD goes.
- Esc with a search card open closes the card; the next Esc returns to the entry view.
- Search "Andromeda" at night: the view turns and frames it; search "Saturn" by day: faces its rise
  direction with "Skip to when it rises".
- By day, "Skip to tonight" lands at night; "Now" returns.
- Phone (400 px): the button label carries the place; HUD fits; nothing overlaps the Dock.
- `#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,0.6&t=2026-11-07T22:00:00Z`
  shows the HUD; Leave lifts off.

**Out of scope:** sky grids, the `sky=` URL row, the lens on the pose codec and recorder, perf at a 0.5°
lens, a gazetteer, the body-arm declined-by-reference fix, the pole camera basis.
