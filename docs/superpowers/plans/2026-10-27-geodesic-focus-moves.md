# Geodesic focus moves: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a second focus-move style, Geodesic (van Wijk & Nuij's zoom/pan path), beside today's Eased tween. A persisted Settings toggle picks the style, and a DebugPanel section tunes both styles live.

**Architecture:**
- Two behaviour-preserving prep commits create the joints:
  - a `CompositeTrack` that declares the channels it writes;
  - a tween plan that carries a frozen `motion` record, served by a per-style row table.
- The feature then lands as growth on top:
  - the ported pure geodesic maths;
  - a `geodesic` clip effect;
  - a `geodesic` row;
  - a `focusMoves` settings slice;
  - the UI.

**Tech Stack:** TypeScript, RTK + typed-redux-saga, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-27-geodesic-focus-moves-design.md`

**Port source:** PR #531's branch. Read a file with
`git show origin/worktree-focus-move-interpolation:<path>`.

## Global Constraints

- **Calibration:** `ρ = 0.18`, `V = 20` (arc-length units per second), duration
  `clamp(S / V, 600 ms, 2200 ms)`, ease `easeOutQuint`. `GEODESIC_RHO_MIN = 0.001`.
- **Eased defaults:** `durationMs: 600`, ease `easeOutCubic`.
- **Units:** durations are **ms** everywhere (`durationMs`, `minMs`, `maxMs`). Sliders display
  seconds.
- **Default style:** `DEFAULT_FOCUS_MOVES.style = 'eased'`.
- **Persistence:** only the style persists, under key `skymap.focusMoveStyle.v1`. Tuning resets on
  reload.
- **Ease select:** monotone eases only, `linear` plus the In/Out/InOut variants of Sine, Quad,
  Cubic, Quart, Quint, Expo and Circ. Never `*Back`, `*Elastic` or `*Bounce`.
- **Always eased, regardless of the toggle:** Home, `flyToLonLat` (which keeps its own
  `FLY_TO_LON_LAT_TWEEN_MS` or payload override), and the planet follow-approach.
- **Naming:** the option is called "Geodesic" everywhere. "Glide" is #531's name; it must not
  survive the port.
- **Code conventions:**
  - `type` aliases, never `interface`.
  - One symbol per file in `utils/` and `@types/`.
  - Comments within budget (`docs/superpowers/conventions/comments.md`).
- **Moving files:** move or rename only with `npm run move-files -- <from> <to>` or
  `npm run refactor`, never `git mv`.
- **Precision:**
  - Never assert with an absolute `toBeCloseTo` on a quantity that spans decades; use relative
    error (`tests/support/relErr.ts`, ported in Task 3).
  - If a value can be clamped, assert that it isn't before comparing it.

## Review Focus

- **Re-focus of the already-focused subject under Geodesic** (Δu = 0, a pure zoom). The pose
  stays finite and lands on `to`; the degenerate branch never yields NaN. Pinned in Task 6.
- **A 19-decade move** (Earth-surface framing → a galaxy, and back). Every sample is finite and
  the target's tail stays within a physical bound of the camera distance. Pinned in Task 3.
- **`minMs > maxMs` from the sliders.** The duration is `minMs` (the lower bound wins); it never
  throws and never goes negative. Pinned in Task 6.
- **FOV slider dragged mid-flight.** The in-flight geodesic uses the frozen `motion.fovYRad`;
  the pose at a given elapsed time is unchanged. Pinned in Task 6.
- **A clip that chains a `flyPath` then a `geodesic`.** Yaw and pitch hold the flyPath's final
  values through the geodesic window; they don't snap back to the clip start. Pinned in Task 4.

---

### Task 1 (prep): `PathTrack` → `CompositeTrack`, which declares its channels

review: yes

**Files:**
- Rename: `src/@types/animation/compiledClip/PathTrack.d.ts` → `CompositeTrack.d.ts`
- Rename: `src/@types/animation/compiledClip/PathSample.d.ts` → `CompositeSample.d.ts`
- Modify:
  - `src/@types/animation/compiledClip/CompiledClip.d.ts:94` (`pathTracks` → `compositeTracks`)
  - `src/services/engine/animation/compileClip.ts` (accumulator `:95`, `flyPath` arm `:197-224`,
    `validatePathExclusivity` `:372-398`)
  - `src/services/engine/animation/buildPathTrack.ts`
  - `src/services/engine/camera/evaluateClip.ts` (`activePathAt` `:460-475`, overlay `:608-628`)
  - comment-only mentions in `pathDefaults.ts`, `rotateVec3ByTightMat3.ts` and
    `causalHermiteNonUniform.ts`
- Test:
  - `tests/services/engine/animation/compileClip.test.ts`
  - `tests/services/engine/camera/evaluateClipPath.test.ts`
  - `tests/services/engine/animation/buildPathTrack.test.ts`
  - `tests/helpers/conventions/inlineTypeFiles.ts:40`

**Interfaces:**
- Produces:
  ```ts
  export type CompositeSample = {
    readonly target?: Vec3; readonly distance?: number; readonly yaw?: number; readonly pitch?: number;
  };
  export type CompositeTrack = {
    readonly startSec: number;
    readonly endSec: number;
    /** The channels `sample` writes, no more and no fewer. */
    readonly channels: readonly Channel[];
    readonly sample: (localSec: number) => CompositeSample;
  };
  // CompiledClip: `readonly compositeTracks: CompositeTrack[];`
  ```

**Behaviour:**
- **Declared channels.** `flyPath` declares `['target', 'distance', 'yaw', 'pitch']`.
- **Validator.** `validatePathExclusivity` becomes `validateCompositeExclusivity`:
  - It loops over each composite's own `channels`, not `ALL_CHANNELS`.
  - It also asserts `Object.keys(track.sample(0))` equals `channels` as a set, throwing on a
    mismatch, so the two can never drift.
- **Evaluator, per channel.** For each channel, the governing composite is the latest-started
  composite (`startSec ≤ t`) that declares that channel. It holds its final value after
  `endSec`, as `activePathAt` does today. The channels no composite governs evaluate from the
  base tracks. Replace the early return at `evaluateClip.ts:614-620` with this overlay; roll
  needs no special case any more.
- **The one behaviour change.** A roll tween inside a `flyPath` window now compiles and
  evaluates instead of throwing.

- [x] Rename the types and symbols, starting with
      `npm run move-files -- --dry src/@types/animation/compiledClip/PathTrack.d.ts src/@types/animation/compiledClip/CompositeTrack.d.ts`.
      Do the same for `PathSample.d.ts`, then run `npm run refactor` (rename) for `PathTrack`,
      `PathSample` and `pathTracks`. Grep afterwards for leftovers, including in comments.
      `buildPathTrack` keeps its name, because it builds a flyPath's composite.
- [x] Test `compileClip > a roll tween inside a flyPath window compiles and evaluates`. Assert
      that evaluated roll at mid-window equals the tween's value there; it threw before this task.
- [x] Test `compileClip > rejects a composite whose sample keys differ from its channels`. Use a
      hand-built track through the exported validator, or through whatever seam the
      implementation exposes.
- [x] Implement the declared channels, the per-channel overlay and the validator.
- [x] Run `npx vitest run tests/services/engine/animation tests/services/engine/camera/evaluateClip` →
      green. Every existing `flyPath` test must pass unchanged.
- [x] Commit: `refactor(animation): a composite track declares the channels it writes`.

### Task 2 (prep): the tween plan carries a `motion`; one row per style

review: yes

**Files:**
- Create:
  - `src/@types/camera/FocusMoveStyle.d.ts`
  - `src/@types/camera/FocusMotion.d.ts`
  - `src/@types/camera/FocusMotionRow.d.ts`
  - `src/services/engine/camera/focusMotions.ts`
  - `src/services/engine/camera/focusMoveClip.ts`
  - `src/services/engine/camera/focusMoveDurationMs.ts`
  - `src/services/engine/camera/focusMoveEase.ts`
- Rename (incumbent): `src/services/engine/camera/tweenToClip.ts` → `easedFocusClip.ts`
  (function `tweenToClip` → `easedFocusClip`)
- Modify:
  - `src/@types/camera/CameraTweenDescriptor.d.ts:20-26`
  - `src/services/engine/camera/cameraDrivers.ts:323` and `:329-339`
  - `src/services/engine/camera/stepCameraRuntime.ts:285`
  - `src/state/camera/focusTweenDescriptor.ts`
  - `src/state/selection/watchGoHomeSaga.ts:82-88`
  - `src/state/camera/watchFlyToLonLatSaga.ts:100-106`
- Test:
  - the 9 fixture files from `grep -rln "easing: 'easeOutCubic'" tests`
  - `tests/state/camera/focusTweenDescriptor.test.ts`
  - `tests/services/engine/camera/cameraDrivers.test.ts:390-406`
  - `tests/services/engine/camera/evaluateClip.test.ts:498`

**Interfaces:**
- Produces:
  ```ts
  export type FocusMoveStyle = 'eased' | 'geodesic';
  // FocusMotion: the eased arm only, in this task (Task 6 adds geodesic)
  export type FocusMotion = { readonly style: 'eased'; readonly durationMs: number; readonly ease: Ease };
  export type CameraTweenDescriptor = { from: CameraPose; to: CameraPose; motion: FocusMotion; frame: OrientationFrameId };
  export type FocusMotionRow<M extends FocusMotion> = {
    readonly clipOf: (d: CameraTweenDescriptor & { motion: M }) => ClipData;
    readonly durationMsOf: (d: CameraTweenDescriptor & { motion: M }) => number;
    readonly easeOf: (d: CameraTweenDescriptor & { motion: M }) => Ease;
  };
  export const FOCUS_MOTIONS: { [S in FocusMotion['style']]: FocusMotionRow<Extract<FocusMotion, { style: S }>> };
  export function focusMoveClip(d: CameraTweenDescriptor): ClipData;      // memoised on d (WeakMap, as tweenToClip is today)
  export function focusMoveDurationMs(d: CameraTweenDescriptor): number;
  export function focusMoveEase(d: CameraTweenDescriptor): Ease;
  export function focusTweenDescriptor(row: SelectionRow, from: CameraPose, fovYRad: number, motion: FocusMotion, frame: OrientationFrameId): CameraTweenDescriptor;
  ```

**Behaviour:**
- **Row table.** The table lives in `services/engine/camera/`, not `src/data/`, so data never
  imports services; the spec's §3.2 path is superseded by this one.
- **Dead field removed.** `durationMs` and the dead `easing` leave the descriptor.
- **The eased clip honours its ease.** `easedFocusClip` applies `d.motion.ease` on all five
  channels in place of the hardcoded `'easeOutCubic'`.
- **Readers switch to the functions.**
  - `stepCameraRuntime.ts:285` compares against `focusMoveDurationMs(tween)`.
  - The lookOffset fade at `cameraDrivers.ts:334` uses
    `EASE[focusMoveEase(tween)](elapsed / focusMoveDurationMs(tween))`.
- **Producers keep today's numbers.** Every producer writes
  `{ style: 'eased', durationMs: <today's value>, ease: 'easeOutCubic' }`:
  - focus and Home use `FOCUS_TWEEN_MS`;
  - `flyToLonLat` uses its own value.
- **Behaviour.** Identical to today.

- [x] `npm run move-files -- src/services/engine/camera/tweenToClip.ts src/services/engine/camera/easedFocusClip.ts`
      (and the `tests/` mirror if one exists), then rename the function with `npm run refactor`.
- [x] Test `easedFocusClip honours motion.ease`. With `ease: 'linear'`, from distance 10 to
      1000 over 1000 ms, assert distance at 500 ms is `505`. This would have failed before: the
      field was ignored.
- [x] Migrate the 9 fixture files and the 3 producer literals to `motion`. These are type-driven
      edits and need no new tests. `focusTweenDescriptor.test.ts:46-52` asserts
      `d.motion === motion`; it no longer restates constants.
- [x] Implement the types, the table, the three lookup functions, and the reader and producer
      changes.
- [x] Run `npm run typecheck:fast`, then
      `npx vitest run tests/services/engine/camera tests/state/camera tests/state/selection tests/services/engine/frame`
      → green.
- [x] Commit: `refactor(camera): the tween plan carries a motion; one row per style`.

### Task 3: port the geodesic maths

review: yes

**Files:**
- Create (ported from #531, renamed):
  - `src/utils/camera/zoomPanGeodesic.ts` (as is)
  - `src/utils/camera/geodesicPath.ts` (from `glidePath.ts`)
  - `src/@types/camera/ZoomPanGeodesic.d.ts`
  - `src/@types/camera/GeodesicPath.d.ts` (from `GlidePath.d.ts`)
  - `src/@types/camera/GeodesicTuning.d.ts` (from `GlideTuning.d.ts`, reshaped)
  - `src/data/camera/focusMoveDefaults.ts`
  - `tests/support/relErr.ts`
- Test (ported):
  - `tests/utils/camera/zoomPanGeodesic.test.ts`
  - `tests/utils/camera/geodesicPath.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GeodesicTuning = { readonly rho: number; readonly velocity: number; readonly minMs: number; readonly maxMs: number; readonly ease: Ease };
  export type GeodesicPath = { readonly durationMs: number; readonly at: (arcFrac: number) => { target: Vec3; distance: number } };
  export function geodesicPath(
    from: { readonly target: Vec3; readonly distance: number },
    to: { readonly target: Vec3; readonly distance: number },
    fovYRad: number,
    tuning: GeodesicTuning,          // the WHOLE record: no Partial, no per-field ?? fallbacks
  ): GeodesicPath;
  // focusMoveDefaults.ts
  export const GEODESIC_RHO_MIN = 0.001;
  export const DEFAULT_GEODESIC_TUNING: GeodesicTuning; // { rho: 0.18, velocity: 20, minMs: 600, maxMs: 2200, ease: 'easeOutQuint' }
  export const GEODESIC_EASES: readonly Ease[];          // the monotone list from Global Constraints
  ```

**Behaviour:**
- **Port verbatim.** Port #531's `zoomPanGeodesic.ts` and `glidePath.ts` with these numerics
  unchanged:
  - `asinh(−b)`;
  - the `sinh(ρs)/cosh(ρs+r₀)` form of u(s);
  - the exact-equality degenerate branch;
  - the reverse geodesic for the second half of the target.
- **What changes in the port:**
  - The tuning parameter becomes the full `GeodesicTuning` record.
  - ρ is floored with `Math.max(GEODESIC_RHO_MIN, tuning.rho)`.
  - The duration is computed in ms as `clamp(length / velocity * 1000, minMs, maxMs)`. When
    `minMs > maxMs`, `minMs` wins.
  - The `glideCalibration.ts` derivation comments move into `focusMoveDefaults.ts` and are
    trimmed to the budget; spec §5 holds the full working.

- [x] Port the test files. Rename glide → geodesic and convert seconds → ms in the
      expectations. Keep these #531 assertions:
  - endpoints exact;
  - the degenerate-limit agreement;
  - finite across Earth-surface (about 2e-16 Mpc) → observable universe;
  - the direction check (ends at `u₁`, not `−u₁`);
  - **the perceived-velocity CV is about 0**;
  - the M31 → Earth target tail within the physical bound;
  - the FOV changes `w`, with inputs asserted to be inside the clamp;
  - ρ = 0 is floored and stays finite.
- [x] Add the test `geodesicPath > minMs above maxMs yields minMs` (Review Focus).
- [x] Port the implementation files and `tests/support/relErr.ts`.
- [x] Run `npx vitest run tests/utils/camera/zoomPanGeodesic tests/utils/camera/geodesicPath` → green.
- [x] Commit: `feat(camera): zoomPanGeodesic and geodesicPath — van Wijk & Nuij's zoom/pan path`.

### Task 4: the `geodesic` effect and `buildGeodesicTrack`

review: yes

**Files:**
- Modify:
  - `src/@types/animation/Effect.d.ts` (variant next to `flyPath`, `:100`)
  - `src/services/engine/animation/compileClip.ts` (new case before the `never` guard at `:291`)
  - `src/services/engine/animation/effectHelpers.ts` (a `geodesic(...)` helper next to `tween`
    and `moveTarget`)
- Create: `src/services/engine/animation/buildGeodesicTrack.ts`
- Test:
  - `tests/services/engine/animation/buildGeodesicTrack.test.ts`
  - `tests/services/engine/camera/evaluateClip.test.ts`

**Interfaces:**
- Consumes: `geodesicPath`, `GeodesicTuning` (Task 3); `CompositeTrack` (Task 1).
- Produces:
  ```ts
  | { readonly kind: 'geodesic'; readonly to: { readonly target: Vec3; readonly distance: number };
      readonly tuning: GeodesicTuning; readonly fovYRad: number; readonly over?: number /* sec; omitted ⇒ arc-length duration */ }
  export function buildGeodesicTrack(p: { start: CameraPose; startSec: number; to: { target: Vec3; distance: number };
    tuning: GeodesicTuning; fovYRad: number; over?: number }): CompositeTrack; // channels: ['target', 'distance']
  export function geodesic(to: { target: Vec3; distance: number }, tuning: GeodesicTuning, fovYRad: number, over?: number): Effect;
  ```

**Behaviour:**
- **Sampling.** `sample(localSec)` returns
  `path.at(EASE[tuning.ease](localSec / durationSec))`. A zero duration samples arc fraction 1.
- **Start pose.** `compileClip` reads the start target and distance the same way the `flyPath`
  arm reads its first knot (`compileClip.ts:197-224`).
- **No other switch changes.** `resolveClipFoci`, `clipFociReady` and `applyPathTuning` pass the
  new kind through their defaults.

- [ ] Test `buildGeodesicTrack > lands exactly on to` (relErr on distance; target bound to the
      camera distance).
- [ ] Test `buildGeodesicTrack > omitted over uses geodesicPath's duration`. Assert it equals
      `geodesicPath(...).durationMs / 1000`, with inputs inside the clamp.
- [ ] Test `evaluateClip > a geodesic window leaves a concurrent yaw tween live`. Assert yaw at
      mid-window equals the tween's own value.
- [ ] Test `evaluateClip > a base distance writer overlapping a geodesic window throws`.
- [ ] Test `evaluateClip > yaw and pitch hold a flyPath's final values through a later geodesic
      window` (Review Focus).
- [ ] Implement.
- [ ] Run `npx vitest run tests/services/engine/animation tests/services/engine/camera/evaluateClip` → green.
- [ ] Commit: `feat(animation): the geodesic effect — one composite writer over target and distance`.

### Task 5: the `focusMoves` settings slice and the persisted style

review: yes

**Files:**
- Create:
  - `src/@types/settings/FocusMoveSettings.d.ts`
  - `src/state/settings/core/focusMovesSlice.ts`
  - `src/utils/storage/parseFocusMoveStyle.ts`
- Modify:
  - `src/data/camera/focusMoveDefaults.ts` (add `DEFAULT_FOCUS_MOVES`)
  - `src/state/settings/coreSettingsSlices.ts`
  - `src/state/settings/selectors.ts`
  - `src/state/persistedValues.ts`
  - the settings fixture (`tests/state/settings/` fixture helper, if it enumerates clusters)
- Test:
  - `tests/state/settings/core/focusMovesSlice.test.ts`
  - `tests/utils/storage/parseFocusMoveStyle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type FocusMoveSettings = { readonly style: FocusMoveStyle; readonly eased: { readonly durationMs: number }; readonly geodesic: GeodesicTuning };
  export const DEFAULT_FOCUS_MOVES: FocusMoveSettings; // { style: 'eased', eased: { durationMs: 600 }, geodesic: DEFAULT_GEODESIC_TUNING }
  // focusMovesSlice: name 'settings/focusMoves', reducerPath 'focusMoves'
  export const { setFocusMoveStyle, setEasedDuration, setGeodesicTuning } // payloads: FocusMoveStyle, number (ms), Partial<GeodesicTuning>
  export const selectFocusMoves: (s: RootState) => FocusMoveSettings;
  export const selectFocusMoveStyle: (s: RootState) => FocusMoveStyle;
  export const FOCUS_MOVE_STYLE: PersistedValue<FocusMoveStyle>; // key 'skymap.focusMoveStyle.v1', select selectFocusMoveStyle
  export function parseFocusMoveStyle(raw: string): FocusMoveStyle | null;
  ```

**Behaviour:**
- **Seeding.** The initial state is `DEFAULT_FOCUS_MOVES` with `style` seeded from
  `readPersisted(FOCUS_MOVE_STYLE)`. This is the `cameraControlsSlice.ts:17` pattern.
- **Parsing.** `parseFocusMoveStyle` validates against a `Record<FocusMoveStyle, true>`, so a
  new style fails to compile until it is accepted. It returns null on garbage, which seeds the
  default.
- **Kept out of tours.** `CORE_SNAPSHOT_CLUSTERS` is not touched; it is an allow-list, so the
  slice stays out of tour snapshots.

- [ ] Test `parseFocusMoveStyle round-trips both styles and rejects garbage`.
- [ ] Test `focusMovesSlice > setGeodesicTuning merges one knob without touching the others`.
- [ ] Implement, and append `FOCUS_MOVE_STYLE` to `PERSISTED_VALUES`.
- [ ] Run `npm run typecheck:fast` and `npx vitest run tests/state/settings tests/utils/storage` → green.
- [ ] Commit: `feat(settings): focusMoves — the style toggle and both styles' tuning`.

### Task 6: the `geodesic` row, `resolveFocusMotion`, and the producers

review: yes

**Files:**
- Modify:
  - `src/@types/camera/FocusMotion.d.ts` (add the geodesic arm)
  - `src/services/engine/camera/focusMotions.ts` (add the `geodesic` row)
  - `src/state/selection/watchFocusTweenSaga.ts:95-97`
  - `src/state/selection/watchGoHomeSaga.ts:82-88`
- Create: `src/utils/camera/resolveFocusMotion.ts`
- Test:
  - `tests/services/engine/camera/focusMotions.test.ts`
  - `tests/utils/camera/resolveFocusMotion.test.ts`
  - `tests/state/selection/watchFocusTweenSaga.test.ts`
  - `tests/state/selection/watchGoHomeSaga.test.ts`

**Interfaces:**
- Consumes:
  - `geodesic(...)` and the effect (Task 4);
  - `geodesicPath` (Task 3);
  - `selectFocusMoves` and `FocusMoveSettings` (Task 5);
  - `FOCUS_MOTIONS` and `focusMove*` (Task 2).
- Produces:
  ```ts
  export type FocusMotion =
    | { readonly style: 'eased'; readonly durationMs: number; readonly ease: Ease }
    | { readonly style: 'geodesic'; readonly tuning: GeodesicTuning; readonly fovYRad: number };
  export function resolveFocusMotion(settings: FocusMoveSettings, fovYRad: number): FocusMotion;
  // eased ⇒ { style: 'eased', durationMs: settings.eased.durationMs, ease: 'easeOutCubic' }
  // geodesic ⇒ { style: 'geodesic', tuning: settings.geodesic, fovYRad }
  ```

**Behaviour:**
- **The geodesic row:**
  - `durationMsOf` is `geodesicPath(from, to, motion.fovYRad, motion.tuning).durationMs`.
  - `clipOf` returns `all([geodesic(to, tuning, fovYRad, durationMsOf(d) / 1000), tween yaw,
    tween pitch, tween roll])`. The yaw, pitch and roll tweens share that duration and
    `tuning.ease`. Passing `over` explicitly is what makes the clip and the end check agree.
  - `easeOf` is `tuning.ease`.
- **Focus saga.** `watchFocusTweenSaga` selects `selectFocusMoves` and passes
  `resolveFocusMotion(settings, runtime.fovYRad)` into `focusTweenDescriptor`.
- **Home saga.** `watchGoHomeSaga` builds the eased arm from `settings.eased.durationMs` and
  **never** the geodesic arm (owner ruling: Home targets moving Earth).

- [ ] Test `focusMotions > the geodesic clip ends exactly at focusMoveDurationMs` (compiled
      `endSec * 1000`).
- [ ] Test `focusMotions > a geodesic re-focus with to.target === from.target is a finite pure
      zoom` (Review Focus).
- [ ] Test `focusMotions > a geodesic move ignores the live FOV`. The pose at a fixed elapsed
      time is identical when evaluated after a projection change; only `motion.fovYRad` counts
      (Review Focus).
- [ ] Test `resolveFocusMotion maps each style to its arm, copying the eased duration and the
      whole geodesic record`.
- [ ] Test `watchFocusTweenSaga dispatches the motion resolved from the store at dispatch`.
- [ ] Test `watchGoHomeSaga stays eased under the geodesic style and follows the eased duration`.
- [ ] Implement.
- [ ] Run `npx vitest run tests/services/engine/camera tests/utils/camera tests/state/selection` → green.
- [ ] Commit: `feat(camera): focus moves fly the geodesic when the style says so`.

### Task 7: the follow-approach takes the Eased duration; `FOCUS_TWEEN_MS` goes

review: yes

**Files:**
- Modify:
  - `src/@types/engine/camera/FollowMemory.d.ts`
  - `src/services/engine/camera/cameraDrivers.ts` (`NO_FOLLOW_MEMORY` `:72-77`, `followPose`
    `:129-187`)
  - every `FOCUS_TWEEN_MS` reader: `focusTweenDescriptor.ts`, `watchGoHomeSaga.ts`, and the
    tests listed by `grep -rln FOCUS_TWEEN_MS tests`
- Delete: `src/services/engine/camera/focusTweenDuration.ts`

**Interfaces:**
- Produces: `FollowMemory.durationMs: number | null`. It is null in `NO_FOLLOW_MEMORY` and
  captured in the same branch that captures `from` (`cameraDrivers.ts:131`).

**Behaviour:**
- **Capture.** `followPose` reads `ctx.state.settings.focusMoves.eased.durationMs` once, at
  capture.
- **Ease.** `t = saturated ? 1 : easeOutCubic(ctx.elapsedMs / memory.durationMs)`.
- **No contract widening.** `DriverCtx` is not widened.
- **Test readers.** Tests that ticked past `FOCUS_TWEEN_MS` read
  `DEFAULT_FOCUS_MOVES.eased.durationMs` instead.

- [ ] Test `followApproach > a duration captured at activation survives a mid-approach settings
      change`.
- [ ] Implement, delete the constant, and migrate its readers.
- [ ] Run `npx vitest run tests/services/engine/camera tests/services/engine/frame` → green.
- [ ] Commit: `feat(camera): the planet approach eases over the tunable Eased duration`.

### Task 8: the UI — the Settings select and the DebugPanel section

**Files:**
- Modify:
  - `src/components/SettingsPanel/CameraControlsSection.tsx`
  - `src/components/containers/CameraControlsSectionContainer.tsx`
  - `src/components/DebugPanel/DebugPanel.tsx:63-79`
- Create:
  - `src/components/DebugPanel/FocusMovesTuningSection/FocusMovesTuningSection.tsx`
  - `src/components/containers/FocusMovesTuningSectionContainer.tsx`
  - `src/data/camera/easedSliderFields.ts`
  - `src/data/camera/geodesicSliderFields.ts`
- Test: `tests/components/DebugPanel/FocusMovesTuningSection.test.tsx`

**Before starting:** read `docs/superpowers/conventions/ui-ux.md` and follow the
`create-component` skill (`.claude/skills/create-component/SKILL.md`).

**Behaviour:**
- **Settings select.** `CameraControlsSection` gains a "Focus moves" `<select>` (`Eased` /
  `Geodesic`), shown under both schemes, with new props `focusMoveStyle` and
  `onFocusMoveStyleChange`. The container dispatches `setFocusMoveStyle`.
- **DebugPanel section.** `FocusMovesTuningSection` renders one `DebugTuningSection` titled
  "Focus moves":
  - The eased duration row is in **seconds** on screen and dispatches ms: 0.1–3 s, step 0.05.
  - The geodesic rows:
    - ρ: 0.001–2, step 0.01.
    - V: 1–100, step 1.
    - Min and max duration: 0.1–5 s, step 0.05.
  - The ease `<select>` lists `GEODESIC_EASES`. The `StarCatalogTuningSection` pattern applies:
    the select is a child of the section.

- [ ] Test `FocusMovesTuningSection > dragging the eased duration dispatches milliseconds`.
      This is the unit seam, and a ×1000 slip would otherwise ship silently.
- [ ] Test `FocusMovesTuningSection > the ease select offers no overshoot or bounce eases`.
- [ ] Implement, and wire the section into `DebugPanel.tsx`.
- [ ] Run `npx vitest run tests/components` → green.
- [ ] Commit: `feat(ui): Focus moves select and DebugPanel tuning board`.

### Task 9: docs and the PR 2 backlog entry

**Files:**
- Modify: `docs/BACKLOG.md`
- Create: `docs/backlog/2026-10-27-geodesic-follow-and-home.md`

**Content:**
- **Backlog index line.** Add `**Follow-approach and Home on the geodesic** \`ready\` — PR 2 of
  geodesic focus moves; the endpoint moves every frame. → [details](...)`.
- **The detail file carries:**
  - the moving-endpoint problem;
  - the duration frozen at activation, because `shouldKeepTicking` and the end check read it;
  - #531's `followBody` notes (re-measure the geodesic per frame, freeze the duration);
  - Home's hand-off to the follow driver (`watchGoHomeSaga.ts` header).
- **No test.**

- [ ] Write both files.
- [ ] Commit: `docs(backlog): follow-approach and Home on the geodesic (PR 2)`.

---

## Definition of Done

**Deliverables:**
- `zoomPanGeodesic`, `geodesicPath`, `resolveFocusMotion` and `parseFocusMoveStyle` (one file each
  in `utils/`).
- `buildGeodesicTrack`, `FOCUS_MOTIONS`, `focusMoveClip`, `focusMoveDurationMs`,
  `focusMoveEase` and `easedFocusClip`.
- `CompositeTrack` and `CompositeSample`.
- The `geodesic` Effect variant.
- The `focusMoves` slice, with `FOCUS_MOVE_STYLE` persisted.
- The "Focus moves" select in Settings → Camera controls.
- The "Focus moves" DebugPanel section.
- The backlog entry for PR 2.
- No `glide`/`Glide` identifier anywhere in `src/` or `tests/`; `FOCUS_TWEEN_MS`, `tweenToClip`,
  `PathTrack` and `PathSample` are gone.

**Observable behaviours (smoke, with deep links to the worktree server):**
- **Eased (the default):** a galaxy → galaxy click looks exactly like main.
- **Switching to Geodesic:**
  - galaxy → galaxy, MW → Virgo and star → Milky Way fly the coupled path at an even pace with
    an easeOutQuint arrival;
  - long moves take up to 2.2 s.
- **Persistence:** the toggle survives a reload; a tour leaves it untouched.
- **Freezing:** flipping the toggle, or dragging a slider, mid-flight leaves the current move
  alone; the next click uses the new value.
- **Eased duration slider:** it changes galaxy clicks, Home and a planet approach alike.
- **Ignoring the toggle:** Home and a planet focus stay eased under Geodesic.
- **Debug ease select:** changing it re-shapes the next Geodesic arrival.

**Deferral boundary (not in this PR):**
- the follow-approach and Home on the geodesic (PR 2, backlogged in Task 9);
- `flyToLonLat` on the geodesic;
- tour clips authoring `geodesic()`;
- a remote-page toggle;
- persisting tuning values.

**After the draft PR opens:** close #531 with a pointer to it (owner ruling).
