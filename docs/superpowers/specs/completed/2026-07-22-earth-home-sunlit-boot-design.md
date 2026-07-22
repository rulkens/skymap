# Earth home — sunlit arrival + boot-as-home

**Status:** approved design, spec'd 2026-07-22. Rides PR #483 (`feat/home-to-earth`), which already retargeted the Home pill + `h` key from the Milky Way to Earth with an orientation-preserving focus tween. This spec finishes the feature: a canonical sunlit home pose, one `goHome` intent behind every home entry point, and the app booting into that same state.

## Problem

Three gaps after the #483 retarget:

1. **Arrival side is accidental.** The focus tween preserves the user's yaw/pitch, so flying home can land on Earth's night side — a dark, unreadable globe as the "home" payoff shot.
2. **Boot ≠ home.** The app boots to a Milky Way framing (`cameraFraming.ts` constants); pressing Home immediately after boot flies somewhere else. The default pose should *be* the home pose.
3. **Three near-duplicate Earth paths.** The `h` key writes only the focus slot (no pinned InfoCard, unlike the palette path); the `'e'` debug key is a *second* fly-to-Earth saga (`watchFlyToEarthKeySaga`) with a *second* Earth-distance constant (`earthSurfaceFraming`'s `SURFACE_RADII = 2.5`); boot is a third framing. Left alone, this feature would add a fourth.

## Decisions (from brainstorm)

- **Sunlit arrival is home-only.** Every other focus (palette body focus included) keeps the orientation-preserving invariant. Home is the one deliberate exception.
- **Boot is the full home state**: pose *and* select/focus = Earth. The sim clock boots live, so Earth moves from frame one; focus makes `applyFocusedBodyPivot` track it, and the pinned Earth InfoCard doubles as "you are here" onboarding.
- **`'e'` folds into `goHome`** as an alias of `h`. `watchFlyToEarthKeySaga` and `earthSurfaceFraming` are deleted.
- **Home distance = the body-framing distance** (`bodyLikeFraming`/`bodyFocusDistance`). This is forced by the follow mechanics, not just taste: `followElapsed` (`cameraClock.ts`) nulls `followDistanceTarget` on every focus-row change and the driver re-seeds it to the framing distance, so any other landing distance would be glided away from right after the tween. Ending the tween at the framing distance makes the tween→follow handoff seamless. (`earthSurfaceFraming`'s `2.5`-radii constant is obsolete for the same reason — once `'e'` sets focus, follow overrides it.) The genuinely free tuning lever is the terminator offset; a per-body fill would be a `bodyFocusDistance` concern, an existing seam.

## Ground preparation

Ideal-diff pass run 2026-07-22 (this section records its checkpoint, approved by the user).

- **Growth** (existing seams, no prep): reducer-less command pattern (`requestFocus.ts`) for `goHome`; rootSaga watcher list; `startCameraTween` already accepts full `to` poses; the focus saga's followed-body no-op means a body focus write never plants a competing tween; `wireInput` already dispatches bootstrap seeds (`commitCameraPose`).
- **Bolt-on averted**: a second fly-to-Earth saga. Resolved by the `'e'` fold above — the feature *deletes* a parallel path rather than adding one.
- **P1 prep (own commit, first):** rename `BOOT_YAW_RAD`/`BOOT_PITCH_RAD` → `GALACTIC_DISC_YAW_RAD`/`GALACTIC_DISC_PITCH_RAD` (values unchanged). Once boot aims at Earth these constants are only the galactic-disc bearing the tour beats aim at (`openingTitle.ts`, `homeAgain.ts`); the current name would lie. Via `npm run refactor -- rename`.
- **Adjacent, not this diff:** retuning the grand tour's opening choreography for an Earth start → backlog detail file.

## Design

### `earthHomePose` — the one home definition

`src/services/engine/camera/earthHomePose.ts`, pure:

```ts
export function earthHomePose(simDays: number, fovYRad: number): CameraPose
```

- **Target**: Earth's live position from `deriveBodyStates(simDays)` (memoized; same source as `liveBodyPosition`).
- **Distance**: `bodyLikeFraming(earthPos, 6371 km, fovYRad)` — the same screen-fill framing every body focus and the follow driver's re-seed use (see Decisions for why no separate constant survives the follow handoff).
- **Orientation**: the Sun is the render origin, so the sunward-at-Earth aim is Earth's own position vector. Rotate it by `HOME_TERMINATOR_OFFSET_RAD` (seed ~25°) about world Y so the terminator gives the globe depth, then `orbitAnglesLookingAlong` converts it to yaw/pitch. Both constants are eye-tuned over HMR.

### `goHome` intent + saga

- `src/state/selection/goHome.ts` — `createAction('selection/goHome')`, reducer-less command mirroring `requestFocus.ts`.
- `src/state/selection/watchGoHomeSaga.ts` — on each `goHome`: read live pose + simDays + FOV from the saga context (same `getContext` pattern as `watchFlyToEarthKeySaga` used; bail on null runtime pre-bootstrap), then

  1. `put(updateSelectionSelect(EARTH_REF))` — pins the InfoCard (closes the gap where `h` focused without pinning),
  2. `put(updateSelectionFocus(EARTH_REF))` — follow-pivot + URL hash,
  3. `put(startCameraTween({ from: live, to: earthHomePose(simDays, fov), durationMs: FOCUS_TWEEN_MS, easing: 'easeOutCubic' }))`.

  No competing tween exists: `watchFocusTweenSaga` deliberately no-ops for bodies the follow driver handles (`watchFocusTweenSaga.ts:85-97` — "followed, not tweened"), so goHome's tween is the only camera authority during the flight. The tween driver opts out of the pivot-pin (fixed endpoints); Earth moves ≤ ~30 km during `FOCUS_TWEEN_MS`, invisible at the framing distance. On tween end the follow driver activates, captures the tween's end pose as its `from`, and re-seeds its distance target to the same framing distance the pose already has — a seamless handoff.
- `EARTH_REF = { type: 'body', id: 'earth' }` — shared const (single home, imported by saga + boot seed).
- Registered in `rootSaga.ts`; `watchFlyToEarthKeySaga` deregistered + deleted.

### Dispatch sites

`useKeyboardShortcuts.ts`: `h` and `e` both dispatch `goHome()`. `App.tsx`: the Home pill callback becomes `() => dispatch(goHome())`. The saga is the only place that knows what home means.

### Boot

- `computeInitialCamera({ fovYRad, simDays })` returns the `earthHomePose` framing (target/distance/yaw/pitch) plus the existing near/far/fov envelope. Still pure — the caller supplies boot time; no loaded-data dependency (ephemeris is analytic).
- `wireInput.ts` passes `simDays` derived at bootstrap and, after the existing `commitCameraPose` seed, dispatches `updateSelectionSelect(EARTH_REF)` + `updateSelectionFocus(EARTH_REF)`. The focus seed plants no tween (same followed-body no-op), and the follow driver's first activation captures the boot pose and re-seeds to the identical framing distance — the boot frame is already at rest.
- **Deep links unchanged**: the hash restore already overwrites the boot pose today; it overwrites the boot focus/select the same way and in the same order. Bare URLs get the home state.

## Testing

- `earthHomePose`: eye lands sun-side (positive dot of eye offset with Earth's position); offset from the sun axis equals `HOME_TERMINATOR_OFFSET_RAD`; target/distance equal `bodyLikeFraming`'s for Earth.
- `watchGoHomeSaga`: puts select + focus + a tween whose `to` equals the helper's pose (fake context, same harness as the deleted `watchFlyToEarthKeySaga.test.ts`).
- `computeInitialCamera`: pose agrees with `earthHomePose` at a fixed `simDays`.
- Keyboard test: `e` and `h` both dispatch `goHome`.
- Deleted with their subjects: `watchFlyToEarthKeySaga.test.ts`, `earthSurfaceFraming` tests.

## Out of scope

- Tour opening retune for the Earth start (backlog).
- Sunlit framing for other bodies (decided against — home-only).
- iOS visual pass (deferred with the standing WebKit-WebGPU check).

## Visual verification (dev server, before merge)

Boot on a bare URL → sunlit Earth with visible terminator, InfoCard pinned, follow camera holding as the clock runs; `h`/`e`/pill from deep space → same arrival; a hash deep-link still wins over the boot state; scale-fade bands behave while catalogs load behind the splash at Earth scale.
