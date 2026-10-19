# Relativistic voyage — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development under the
> lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** an exhibit rides a 1 g ship from the Sun to Proxima, Sgr A\*, M31 or M87 and draws the scene as the
ship's frame measures it: Lorentz contraction along the line of flight folded into every slab's view-projection,
Doppler hue and a headlight gain in the three light-emitting renderers, and a ship clock beside Earth's own.

**Architecture:** closed-form hyperbolic motion in Earth time (`src/utils/relativity/`); a per-frame `FrameBoost`
contributed by a Layer's optional `boost` member and folded by `deriveSlabs` as `vp · C` per slab; a `voyage` Layer
owning the Intent (destination, launch instant, toggles, speed), four exhibit rows, a hold saga that plays a
`ClockProfile` in ship time, a camera row at the ship, and the overlay; a shared `lib/boost.wesl` whose
`BoostUniforms` block appends to the star, galaxy and Milky Way uniform tails.

**Tech stack:** TypeScript, Redux Toolkit + redux-saga, WebGPU/WESL, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-18-relativistic-voyage-design.md`.

## Global constraints

- **Units:** years, light-years, `c = 1`. `A_LY_PER_YR2 = g · yr / c = 1.03227` (derived from `9.80665`, the Julian
  year and `c`, in `src/data/relativity/properAccelLyPerYr2.ts`). Scene conversions through `SCALE_UNITS`
  (`LY_TO_MPC`), never a hand-typed factor.
- **Motion, Earth time `t` since launch, accelerating half:** `γ = √(1 + (A t)²)`, `β = A t / γ`,
  `x = (γ − 1) / A`, `τ = asinh(A t) / A`. The decelerating half mirrors about the midpoint of a trip of length
  `d = |positionMpc| / LY_TO_MPC − standoffLy`. `γ_max = 1 + A d / 2`, `τ_total = 2 acosh(γ_max) / A`,
  `t_total = 2 √(γ_max² − 1) / A`. Past arrival the ship rests at `d` with `γ = 1`.
- **Contraction:** `C = T(s) · (I − (1 − 1/γ) n nᵀ) · T(−s)`, `s` the ship, `n` the unit direction of travel. Folded
  on the right of every slab `vp`, in that slab's frame (§4.3 table of the spec).
- **Doppler:** `D = 1 / (γ (1 − β cos θ))`, `cos θ = dot(normalize(p − s), n)`.
- **Headlight:** `gain = h / (1 + h / HEADLIGHT_CEIL)`, `h = pow(D, k)`; `k = 0` is exactly 1. `HEADLIGHT_CEIL = 64`
  in `src/data/voyage/headlightCeil.ts`.
- **Galaxy hue:** `ci' = ci − K_CI · log2(D)`, clamped to the ramp's `[0, 2]`; `K_CI` in `src/data/voyage/`.
  Star hue: `boostedBpRp(bpRp, D)` via the tint ramp's own anchors as blackbody temperatures (Task 9).
- **Destinations** (`src/data/voyage/voyageDestinations.ts`): proxima (`standoffLy 0.01`), sgrAStar (`1`), m31 (`0`),
  m87 (`0`). Positions in Mpc from the same numbers as the famous seed / star data; a test pins m31 and m87 to
  `data/seeds/famous_galaxies.seed.json`.
- **Clock:** the sim clock is Earth time. The ship state is a pure function of `(destination, simDays − launchDays)`.
  Ship-time scrubs convert through `earthYrOfTau`. `VOYAGE_WALL_MS = 60_000` for a whole trip at speed 1.
- **Reference numbers** (three figures, the test fixtures): Proxima 3.54 / 5.87 yr, γ 3.19; Sgr A\* 19.8 yr /
  26.7 kyr, γ 1.38 × 10⁴; M31 28.6 yr / 2.54 Myr, γ 1.31 × 10⁶; M87 34.6 yr / 54.7 Myr, γ 2.83 × 10⁷. Turnaround
  whole line `d / γ_max → 1.94 ly`, the half ahead `0.97 ly`. Doppler ahead `γ(1 + β)`, behind `γ(1 − β)`.
- **Conventions:** one symbol per file in `utils/`, `@types/` and `data/`; `type`, never `interface`; frame files
  export only their own symbol; comments explain why, module header ≤ 10 lines; UI per
  `docs/superpowers/conventions/ui-ux.md`; copy per `docs/tour/writing-style.md`; stage explicit paths; format with
  `npx prettier --write <files>`.

## Review focus

1. **The fold is per slab frame.** NEAR0 is origin-relative, body rows are eye-relative metres; a `C` built in
   the wrong frame squashes about the wrong point and the layers come apart. Pinned in Task 3.
2. **Nothing changes with no boost.** Every slab `vp` is bitwise what it was when `boost` is null, and every
   renderer's new uniform tail reads as identity (`doppler = 0`, `contraction = 0`, `headlight = 0`). Pinned in
   Tasks 3 and 9–12.
3. **Earth time never meets `Date`.** The readouts format from years; the `t=` writer returns null out of range.
   Pinned in Tasks 7 and 8.
4. **Exit restores the rest frame.** The takeover bracket restores `voyage.destination` to null, so the boost is
   null on the first frame after exit, and no clock profile survives. Pinned in Task 5.
5. **Two Layers answering `boost`** fail at boot, not per frame. Pinned in Task 2.

---

## Dispatch A — physics, boost, fold, debug drive

### Task 1: Relativity helpers

**Files:**
- Create: `src/data/relativity/properAccelLyPerYr2.ts`
- Create: `src/@types/relativity/ShipState.ts`, `src/@types/relativity/TripSummary.ts`
- Create: `src/utils/relativity/tripOf.ts`, `shipStateAt.ts`, `earthYrOfTau.ts`, `dopplerFactor.ts`,
  `contractionMat4.ts`
- Create: `tests/utils/relativity/*.test.ts` (one per function)

**Contract:**

```ts
export type ShipState = {
  readonly tauYr: number;
  readonly xLy: number; // along the line of flight from the launch point
  readonly beta: number;
  readonly gamma: number;
  readonly phase: 'accelerating' | 'decelerating' | 'arrived';
};
export type TripSummary = { readonly tauTotalYr: number; readonly tEarthTotalYr: number; readonly gammaMax: number };

export function tripOf(distanceLy: number): TripSummary;
export function shipStateAt(distanceLy: number, earthYr: number): ShipState; // earthYr < 0 ⇒ launch state
export function earthYrOfTau(distanceLy: number, tauYr: number): number; // inverse of shipStateAt(…).tauYr
export function dopplerFactor(cosTheta: number, beta: number, gamma: number): number;
export function contractionMat4(shipRel: Vec3, dir: Vec3, gamma: number): Float64Array; // column-major, wgpu-matrix order
```

- [ ] Tests, named by behaviour:
  - `tripOf matches the four reference trips to three figures` (the Global constraints table);
  - `tripOf: remaining distance at turnaround tends to 2/A` — `d / gammaMax` within 1 % of 1.94 ly for M31 and M87;
  - `shipStateAt is continuous through the midpoint` — `xLy`, `beta`, `gamma`, `tauYr` agree across
    `tEarthTotalYr / 2 ± 1e−6`;
  - `shipStateAt past arrival is arrived at rest` — `phase 'arrived'`, `gamma 1`, `xLy = d`;
  - `earthYrOfTau inverts shipStateAt` — round trip at ten τ samples including both halves;
  - `dopplerFactor is γ(1+β) ahead and γ(1−β) behind`;
  - `contractionMat4 is identity at gamma 1`, `… fixes the ship`, `… leaves a perpendicular offset`,
    `… scales an offset along dir by 1/gamma`.
- [ ] Implement. `contractionMat4` composes through `wgpu-matrix`'s `mat4d` (see `slabs.ts` for the f64 pattern).
- [ ] `npm test -- relativity` green. Commit.

### Task 2: `FrameBoost` and the Layer hook

**Files:**
- Create: `src/@types/engine/frame/FrameBoost.ts`
- Modify: `src/@types/engine/layer/Layer.d.ts`, `src/@types/engine/layer/LayerInstance.d.ts`,
  `src/services/engine/layer/instantiateLayer.ts`, `src/@types/engine/frame/FrameContextInput.d.ts`,
  `src/@types/engine/frame/ReadyFrameContext.d.ts`, `src/services/engine/frame/frameContextInputOf.ts`,
  `src/services/engine/frame/frameContext.ts:52-154`
- Create: `src/utils/engine/composeLayerBoost.ts`, `tests/utils/engine/composeLayerBoost.test.ts`

**Contract:**

```ts
export type FrameBoost = {
  readonly shipMpc: Vec3; // the fixed point of the contraction
  readonly dir: Vec3; // unit, Earth-frame direction of travel
  readonly beta: number;
  readonly gamma: number;
  readonly contraction: boolean;
  readonly doppler: boolean;
  readonly headlight: number; // the exponent k; 0 is off
};
// Layer.d.ts (static contribution, beside `slabs`)
readonly boost?: (state: RootState, simDays: number) => FrameBoost | null;
// LayerInstance carries it through; FrameContextInput and ReadyFrameContext gain `readonly boost: FrameBoost | null`
export function composeLayerBoost(
  layers: readonly LayerInstance[],
  state: RootState,
  simDays: number,
): FrameBoost | null;
```

`frameContextInputOf` calls `composeLayerBoost` with the engine's layer instances and threads the result through
`frameContext.ts` beside `simDays`. Two instances with a `boost` member is a composition error thrown by
`instantiateLayer`'s caller at boot (the place that assembles the instance list), with both Layer names in the
message.

- [ ] Tests: `composeLayerBoost returns the one answering Layer's boost`, `… returns null when none answers`,
      `… ignores Layers whose boost returns null`. The boot-time duplicate check: `two Layers declaring boost fail
      at boot naming both` in the composition test beside the existing instance-list test (find it under
      `tests/services/engine/layer/`).
- [ ] Implement. No per-frame arbitration: `composeLayerBoost` may assume at most one member exists.
- [ ] Commit.

### Task 3: The fold

**Files:**
- Modify: `src/services/engine/frame/slabs.ts` (`deriveSlabs` signature and body, :238-330),
  `src/services/engine/frame/deriveView.ts:43-141` (`FrameView.vp` is the folded COSMO vp)
- Create: `src/utils/camera/foldBoostIntoSlab.ts`
- Modify: `tests/services/engine/frame/slabs.test.ts`, `tests/services/engine/frame/deriveView.test.ts`

**review: yes** (camera maths)

**Contract:**

```ts
/** `slab` with `vp · C`, C built in the slab's own frame; the slab itself when `boost` is null or contraction is off. */
export function foldBoostIntoSlab(slab: Slab, boost: FrameBoost | null, eyeMpc: Readonly<Vec3>): Slab;
```

Ship in slab coordinates: `world-mpc` with `originRelative: false` → `shipMpc`; `originRelative: true` →
`shipMpc − RENDER_ORIGIN_MPC`; `body-m` → `(shipMpc − eyeMpc) · MPC_TO_M`. `deriveSlabs` takes
`boost: FrameBoost | null` and maps every slab through the fold after the table is built and sorted, so slab
indices are untouched. `deriveView` passes `ctx.snapshot.boost` and uses the folded COSMO `vp` for `FrameView.vp`.

- [ ] Tests:
  - `deriveSlabs with no boost is bitwise unchanged` — every slab's `vp` equals the pre-change table (capture it
    in the test from a `null` run, then assert the folded run with `contraction: false` matches);
  - `a world point on the line of flight projects at its contracted position` — on COSMO, NEAR0 and one body row:
    project `s + n·L` through the folded `vp` and `s + n·L/γ` through the unfolded one; same clip position within
    1e−6 relative;
  - `a perpendicular point projects where it did`;
  - `deriveView.vp is the folded COSMO vp`.
- [ ] Implement. The fold multiplies in f64 (`mat4d.multiply`), narrowing stays where it is (`slabViewOf`).
- [ ] Commit.

### Task 4: The `voyage` Layer skeleton and the debug drive

**Files:**
- Create: `src/layers/voyage/layer.ts`, `create.ts`, `destroy.ts`
- Create: `src/layers/voyage/state/slices.ts`, `state/voyage/slice.ts`, `initialState.ts`, `selectors.ts`
- Create: `src/layers/voyage/@types/VoyageSettings.ts`, `VoyageDestination.ts`, `VoyageDestinationId.ts`
- Create: `src/data/voyage/voyageDestinations.ts`, `src/data/voyage/voyageWallMs.ts`,
  `src/data/voyage/headlightCeil.ts`, `src/data/voyage/galaxyHueSlope.ts`
- Create: `src/layers/voyage/ui/VoyageTuningSection.tsx`, `VoyageTuningSectionContainer.tsx`,
  `voyageSliderFields.ts`
- Modify: `src/compositions/app.ts`, `src/compositions/appSettingsSlices.ts`
- Create: `tests/layers/voyage/state/selectors.test.ts`, `tests/data/voyage/voyageDestinations.test.ts`

**Contract:**

```ts
export type VoyageDestinationId = 'proxima' | 'sgrAStar' | 'm31' | 'm87';
export type VoyageDestination = {
  readonly id: VoyageDestinationId;
  readonly label: string;
  readonly positionMpc: Vec3;
  readonly focusId: string | null; // 'm31' | 'm87' | null
  readonly standoffLy: number;
};
export type VoyageSettings = {
  readonly destination: VoyageDestinationId | null; // null ⇒ rest frame
  readonly launchDays: number | null;
  readonly contraction: boolean;
  readonly doppler: boolean;
  readonly headlight: number; // k ∈ [0, 4]; the overlay toggle sets 0 or restores the last non-zero
  readonly speed: number; // a MISSION_SPEEDS factor
};
// slice reducers: setVoyageDestination, setVoyageLaunchDays, setVoyageContraction, setVoyageDoppler,
//                 setVoyageHeadlight, stepVoyageSpeed({ step })
export function selectShipState(state: RootState, simDays: number): ShipState | null;
export function selectFrameBoost(state: RootState, simDays: number): FrameBoost | null;
export const voyageLayer = defineLayer({ name: 'voyage', settings, boost: selectFrameBoost, ui: [{ slot: 'debug', … }], … });
```

The debug section drives the real Intent, not a fake knob: a destination select (plus "off"), an "Earth years
since launch" slider in log space over the trip (writes `launchDays = simDays − years · 365.25`), and sliders for
`headlight` (`[0, 4]`, step 0.1) and the toggles. Pattern: `BlackHoleLensingTuningSectionContainer` and
`blackHoleLensingSliderFields.ts`. `create` returns an empty runtime; `passes` returns `[]`.

- [ ] Tests:
  - `voyageDestinations: m31 and m87 match the famous seed` (ra/dec/distance → Mpc through
    `raDecDistToCartesian`, 1e−6 relative);
  - `selectFrameBoost is null without a destination`;
  - `selectFrameBoost places the ship along dir at the ship state's xLy` for M31 at 10 Earth-years;
  - `selectFrameBoost reflects the toggles and headlight`.
- [ ] Implement. Register the Layer in `app.ts` and its slices in `appSettingsSlices.ts` (that puts the cluster in
      `SettingsSnapshot` through `LayerSettingsClusterKey`).
- [ ] Visual check: set M31 and 14 Earth-years in the debug section, `npm run shot` the link; the Milky Way behind
      and M31 ahead both flatten along the line of flight; send the shot and link to the user as a dash check.
- [ ] Commit.

---

## Dispatch B — the exhibit

### Task 5: Profile, play and hold sagas

**Files:**
- Create: `src/utils/voyage/buildVoyageProfile.ts`, `src/layers/voyage/sagas/voyagePlaySaga.ts`,
  `src/layers/voyage/sagas/voyageHoldSaga.ts`, `src/layers/voyage/exhibits/playVoyage.ts` (action)
- Create: `tests/utils/voyage/buildVoyageProfile.test.ts`, `tests/layers/voyage/sagas/voyageHoldSaga.test.ts`

**review: yes** (sagas)

**Contract:**

```ts
/** wall ∝ ship time at `speed`; sim = launchDays + earthYrOfTau(τ) · 365.25, from `fromDays` to arrival. */
export function buildVoyageProfile(
  destination: VoyageDestination,
  fromDays: number,
  launchDays: number,
  speed: number,
  nowMs: number,
): ClockProfile;
export const playVoyage = createAction('voyage/play');
export function* voyageHoldSaga(data: VoyageSection, entry: Transition, atLinkedTime: boolean): Generator;
```

Hold behaviour, modelled on `missionHoldSaga.ts:44-131`: at open, `setVoyageLaunchDays(simDays now)`,
`setSimDays` to it, `pause`, `aimCamera({ ease: false })`, fly in unless `entry === 'cut'`; then loop on
`exitTakeover` / `playVoyage` / `resume` / `setSimDays` (scrub, settle 150 ms) / `stepVoyageSpeed` /
`setVoyageDestination` (a tab: re-launch at the current instant, re-aim). `atLinkedTime` is ignored (spec §4.7).
Play forks `voyagePlaySaga` (as `missionPlaySaga`): build the profile from the current instant, `startClockProfile`,
`pause` at its end if still on the clock; run within a day of arrival replays from launch.

- [ ] Tests:
  - `buildVoyageProfile is monotone in both columns`, `… starts at fromDays and ends at arrival`,
    `… halves its wall length at speed 2`, `… samples ship time uniformly` (wall column equally spaced);
  - hold (pattern `tests/layers/missions/sagas/exhibitMissionLoop.test.ts`): `opening launches now, paused`;
    `play starts a profile ending at arrival`; `a scrub while playing rebuilds from the scrubbed instant`;
    `a destination tab re-launches at the current instant`; `exit cancels the play task`.
- [ ] Implement. Commit.

### Task 6: Camera row, section kind, exhibit rows

**Files:**
- Create: `src/layers/voyage/exhibits/voyagePose.ts`, `voyageKind.ts`, `voyageExhibits.ts`
- Create: `src/layers/voyage/@types/VoyageSection.ts`, `VoyageCameraMemory.ts`
- Modify: `src/@types/exhibits/ExhibitId.d.ts` (four ids `voyage-proxima` … `voyage-m87`),
  `src/compositions/appExhibits.ts`, `src/layers/voyage/layer.ts` (`exhibits`)
- Create: `tests/layers/voyage/exhibits/voyagePose.test.ts`

**review: yes** (camera maths)

**Contract:**

```ts
export type VoyageSection = { readonly heading: string }; // destination tabs come from VOYAGE_DESTINATIONS
export function voyagePose(ctx: DriverCtx, mem: FollowMemory | null, own: VoyageCameraMemory | null, data: VoyageSection): DriverOutput<VoyageCameraMemory>;
export const voyageKind: ExhibitSectionKind<VoyageSection>; // Component (Task 7), hold (Task 5), shortcuts (Task 7),
                                                            // cameraDriver { id: 'voyage', priority: 58, epoch: 'aim', commitsOnEdge: 'displayed', ridesWheelTarget: true, pose: voyagePose }
export const voyageExhibits: readonly Exhibit[]; // one per destination; settings turn on star catalog, Milky Way,
                                                 // galaxy layers and set voyage { destination, contraction: true, doppler: true, headlight: 1 }
```

`voyagePose`: eye at `shipMpc` (`absoluteArm`, `target = ship + dir`, `distance` tiny as `missionPose` does for a
cruise), yaw/pitch from `orbitAnglesLookingAlong(dir, …)` turned by the visitor's offsets (`missionOffsetsOfView`,
`missionViewDirection`, reset on a re-aim), easing over `MISSION_EASE_MS` of wall time on a view change exactly as
`missionPose.ts` does. Past arrival with a `focusId`: the destination's framing through `sphereFitDistance`, as
`exhibitBodySaga` frames `fitRadiusMpc`.

- [ ] Tests: `voyagePose sits at the ship looking along dir` (M31, 10 Earth-years: position within 1e−9 Mpc of
      `selectFrameBoost().shipMpc`, forward within 1e−6 of `dir`); `voyagePose frames the galaxy after arrival`;
      `voyagePose keeps a drag offset until the next re-aim`.
- [ ] Implement. Commit.

### Task 7: Overlay, readouts, shortcuts, hash guard

**Files:**
- Create: `src/layers/voyage/ui/Voyage.tsx`, `Voyage.module.css`, `VoyageContainer.tsx`, `VoyageReadouts.tsx`,
  `VoyageTrack.tsx`, `VoyageDestinationTabs.tsx`, `voyageShortcuts.ts`
- Create: `src/utils/voyage/formatYears.ts`, `src/utils/voyage/formatSpeedOfLight.ts`,
  `src/utils/voyage/voyageReadouts.ts`
- Modify: `src/state/url/hashParamSources.ts:199-203` (`timeSource.write` returns null outside the `Date` range)
- Create: `tests/layers/voyage/ui/VoyageContainer.test.tsx`, `tests/utils/voyage/voyageReadouts.test.ts`,
  `tests/utils/voyage/formatYears.test.ts`; modify `tests/state/url/hashParamSources.test.ts` (or the nearest
  existing `timeSource` test)

**review: yes** (Redux state)

**Contract:**

```ts
export type VoyageReadouts = {
  readonly shipClock: string; // "14 yr 110 d"
  readonly earthClock: string; // "1,270,000 yr" — from years, never Date
  readonly speed: string; // "β = 0.9987" below 0.999, else "1 − β = 2.9 × 10⁻¹³"
  readonly gamma: string;
  readonly aheadEarthLy: string;
  readonly aheadShipLy: string;
};
export function voyageReadouts(destination: VoyageDestination, ship: ShipState): VoyageReadouts;
export function formatYears(yr: number): string;
```

Layout, in the notes column: destination tabs (`TimelineCraftTabs` pattern); the scrub track in ship years with
the midpoint ticked (`TimelineTrack` pattern, `setSimDays(launchDays + earthYrOfTau(τ) · 365.25)`); transport
(`TimelineTransport` pattern: run/pause, − / +, the live speed label); the readouts table, re-derived on the 4 Hz
interval `ExhibitTimelineContainer.tsx` uses; three toggle rows (contraction, Doppler shift, headlight) as the
exhibit's own buttons, each dispatching the cluster's setter, with the labels "Earth's clock" and "Ship's clock"
exactly. Shortcuts: `[` / `]` step speed (`missionShortcuts.ts` pattern). Follow `ui-ux.md` tokens and copy rules;
no new colours.

- [ ] Tests:
  - `voyageReadouts at the M31 turnaround` — ship 14 yr, Earth 1.27 Myr, γ 1.31 × 10⁶, ahead 1.27 Mly / 0.97 ly
    (string contains);
  - `formatYears never produces NaN or Infinity` across 0, 0.5, 3.54, 2.54e6, 5.47e7;
  - `a track scrub dispatches setSimDays at launch + earthYrOfTau`; `run dispatches playVoyage`;
    `a tab dispatches setVoyageDestination`; `the headlight toggle restores the last non-zero k`;
  - `timeSource.write returns null past the Date range` — `anchor.simDays` at year 3,000,000 writes null and
    does not throw.
- [ ] Implement. Commit.

### Task 8: Copy

**Files:**
- Modify: `src/layers/voyage/exhibits/voyageExhibits.ts` (prose, facts and sources sections)
- Create: `tests/layers/voyage/exhibits/voyageExhibits.test.ts`

Three prose sections per `docs/tour/writing-style.md`: why the ship clock runs slow and Earth's runs away, with
the one sentence on simultaneity (in the ship's own "now" Earth's clock stays under 0.97 years for the whole
accelerating half, then leaps: nothing from more than 0.97 light-years behind can catch an accelerating ship); the
1.94 light-year invariant; Map versus Window (a photograph would show aberration, not contraction). Facts: trip
numbers from `tripOf` at build time, not hand-typed. Sources: Rindler, *Relativity: Special, General and
Cosmological*; the "relativistic rocket" FAQ (Baez/Gibbs); Terrell 1959 and Penrose 1959 for the Window remark.

- [ ] Test: `voyageExhibits facts are tripOf's numbers` — the M31 row's ship-time fact string contains "28.6".
- [ ] Write the copy. Commit.

---

## Dispatch C — colour

### Task 9: `lib/boost.wesl`, the packer and the TS twins

**Files:**
- Create: `src/services/gpu/shaders/lib/boost.wesl`
- Create: `src/services/gpu/lib/boostUniforms.ts` (`BOOST_UNIFORM_BYTES = 32`, `writeBoostUniforms`)
- Create: `src/utils/relativity/boostedBpRp.ts`, `src/utils/relativity/headlightGain.ts`
- Create: `tests/utils/relativity/boostedBpRp.test.ts`, `tests/utils/relativity/headlightGain.test.ts`,
  `tests/services/gpu/lib/boostUniforms.test.ts`

**review: yes** (TS↔WGSL contract)

**Contract (WGSL, uniform layout):**

| offset | field | type |
| --- | --- | --- |
| 0 | `dir` | `vec3<f32>` (unit; in the renderer's own space, Task 12) |
| 12 | `beta` | `f32` |
| 16 | `gamma` | `f32` |
| 20 | `doppler` | `f32` (0 / 1) |
| 24 | `contraction` | `f32` (0 / 1) |
| 28 | `headlight` | `f32` (k) |

```wgsl
struct BoostUniforms { dir: vec3<f32>, beta: f32, gamma: f32, doppler: f32, contraction: f32, headlight: f32 }
fn dopplerFactor(toSource: vec3<f32>, b: BoostUniforms) -> f32;   // 1.0 when b.doppler == 0.0
fn contractAbout(p: vec3<f32>, ship: vec3<f32>, b: BoostUniforms) -> vec3<f32>; // p when b.contraction == 0.0
fn boostedBpRp(bpRp: f32, d: f32) -> f32;
fn headlightGain(d: f32, b: BoostUniforms) -> f32;                // 1.0 when b.headlight == 0.0
```

```ts
export function writeBoostUniforms(target: Float32Array, floatIndex: number, boost: FrameBoost | null, dir?: Vec3): void; // null ⇒ identity block
export function boostedBpRp(bpRp: number, d: number): number;
export function headlightGain(d: number, k: number, ceil: number): number;
```

`boostedBpRp`: the star tint ramp's anchors (`starCatalog/tint.wesl:50-56`, their BP−RP positions) paired with
blackbody temperatures (O/B 30 000 K, A/F 7 500, G 5 800, K 4 500, M 3 500); `log T` piecewise-linear in BP−RP,
inverted by the same table; `T' = D · T`, clamped to the table's ends. State the approximation in the module
header. WESL and TS share the anchor table through a `constants.parity.test.ts`-style scrape.

- [ ] Tests: `boostedBpRp is identity at D 1`, `… is monotone in D`, `an M star at D 2 lands in the K–G range`,
      `… clamps at the table ends`; `headlightGain is 1 at k 0`, `… is bounded by the ceiling`,
      `… is pow(D, k) well below it`; `writeBoostUniforms writes the identity block for null`,
      `… lays out the six fields at the table's offsets`; the anchor parity scrape.
- [ ] Implement. Commit.

### Task 10: Stars

**Files:**
- Modify: `src/services/gpu/shaders/starCatalog/io.wesl:27-40` (`boost: BoostUniforms` appended),
  `src/services/gpu/shaders/starCatalog/vertex.wesl:321-322` (tint) and the radiance site (gain),
  `src/layers/starCatalog/render/starCatalogLayout.ts` (`STAR_UNIFORM_BYTES`, the boost float index),
  `src/layers/starCatalog/render/starCatalogRenderer.ts:247-255` (`writeBoostUniforms`),
  `src/layers/starCatalog/render/starPointRenderer.ts` (same tail), the star passes handing `ctx.snapshot.boost`
- Modify: the star layout / uniform tests under `tests/layers/starCatalog/render/`

**review: yes** (shader contract)

`d2` (brightness attenuation) stays Earth-frame. Direction to the star is `normalize(worldRelCam)`
(`vertex.wesl:210`); `u.cam` is camera-relative, so the camera is the ship and `contractAbout` is not needed here.

- [ ] Tests: extend the star layout parity test for the appended block; `star uniforms with a null boost are the
      identity block`.
- [ ] Implement; `npm run perf` before and after on the NEAR0 scenarios (perf skill), numbers in the commit body.
- [ ] Commit.

### Task 11: Galaxies

**Files:**
- Modify: `src/services/gpu/shaders/galaxyCatalog/points/io.wesl:100-140` (append `boost`),
  `points/vertex.wesl:159-167` (distance from `contractAbout(p.position, u.camPosWorld, u.boost)`),
  `points/vertex.wesl:306-312` / `points/colorFragment.wesl:101-103` (hue shift, gain),
  `src/layers/galaxyCatalog/render/packGalaxyPointUniforms.ts` and `galaxyPointRenderer.ts` (`UNIFORM_BYTES`
  192 → 224, the block at float 48),
  `proceduralDisks/io.wesl:60-72` + `proceduralDiskRenderer.ts:350`, `texturedDisks/io.wesl:45-49` +
  `instancedQuadRenderer.ts:103` (same append), the three passes handing `ctx.snapshot.boost`
- Modify: the points uniform layout test under `tests/layers/galaxyCatalog/render/`

**review: yes** (shader contract)

The hue shift is `ci' = clamp(ci − K_CI · log2(D), 0, 2)` applied before `rampRadial`; a highlighted instance
(`ci < 0`, `vertex.wesl:311`) is left alone. Gain multiplies the instance intensity.

- [ ] Tests: the points layout parity for the appended block; `galaxy point uniforms with a null boost are the
      identity block`.
- [ ] Implement; `npm run perf` before and after (the point vertex path is the hot one). Commit.

### Task 12: Milky Way

**Files:**
- Modify: `src/services/gpu/shaders/milkyWay/field/io.wesl` (append `boost` after `params1`),
  the field splat / present shaders that compute emission (tint by `dopplerFactor` of the splat's direction from
  `camPosModel`, times `headlightGain`),
  `src/layers/milkyWay/render/milkyWayCloudRenderer.ts:170-196` (write the block at float 52 with `dir` rotated
  into model space: `transpose(R_model) · dir`), the Milky Way pass handing `ctx.snapshot.boost`
- Modify: `tests/services/gpu/shaders/milkyWayPickUniformParity.test.ts`'s sibling for the cloud uniforms (create
  it if only the pick one exists)

**review: yes** (shader contract)

Verify first, as a plan step: the dust and bubble presents (`field/dustPresent/`, `field/bubblePresent/`) sample
no world position; if one does, it takes the inverse warp on its sample point (`×γ` along `dir` about the ship)
and the task says so in the commit.

- [ ] Tests: cloud uniform parity for the appended block; `milky way uniforms with a null boost are the identity
      block`; `dir is rotated into model space` (a unit `dir` along model +x after a 90° model rotation).
- [ ] Implement; `npm run perf` before and after. Commit.

---

## Dispatch D — eye check and close

### Task 13: Shots and the standing audits

- [ ] `npm run shot` on `#exhibit=voyage-m31` scrubbed to τ = 0, 3, 7.4 and 14.3 years (set through the debug
      section's launch slider until the exhibit's own track exists; then through the track), and on
      `#exhibit=voyage-proxima` at turnaround. Send each shot and its link to the user as a dash check.
- [ ] `/comment-audit` over the branch; `deletion-audit` per `leanness.md`.
- [ ] Update `docs/RENDERER.md`'s quick map with one line for the boost fold and one for `lib/boost.wesl`;
      `docs/science.md` gets a "Relativistic voyage" paragraph under The rendering (Map picture, what is and is
      not modelled, per the spec).
- [ ] `/feature-done`.

## Definition of Done

**Deliverables**

- `src/utils/relativity/` (seven helpers) and `src/@types/relativity/`; `FrameBoost`; `Layer.boost`;
  `foldBoostIntoSlab`; the `voyage` Layer with its slice, four exhibit rows, hold/play sagas, camera row, overlay
  and debug tuning section; `lib/boost.wesl` with `boostUniforms.ts`; boost tails in the star, galaxy point,
  procedural disk, textured disk and Milky Way uniforms.
- Docs: the RENDERER.md and science.md lines above.

**Observable behaviours**

- Palette → "Voyage to Andromeda" opens the exhibit at launch, paused, camera at the Sun looking at M31.
- Run plays the whole trip in about a minute at 1×; the ship clock ends at 28.6 yr and the Earth clock at
  2.54 Myr; − / + and `[` / `]` change the pace.
- Scrubbing to the midpoint shows γ ≈ 1.3 million, "ahead 0.97 ly", the Milky Way flattened and red behind, M31
  flattened, blue and large ahead; each of the three toggles removes exactly its effect.
- Proxima's trip never passes γ 3.2 and the near stars visibly shear.
- Destination tabs re-launch at the current instant; Esc / exit restores the rest frame, the previous scene and
  the live clock.
- A reload of the exhibit link reopens at launch; the URL never carries an invalid date.

**Deferral boundary**

- Aberration, the starbow, a third-person ship, a ship-time hash param, disk/thumbnail promotion on the
  contracted distance, the render origin following the ship, the ship-judged Earth clock as a readout, a tour
  beat.
