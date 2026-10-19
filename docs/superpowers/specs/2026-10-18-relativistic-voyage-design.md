# Relativistic voyage — design

An exhibit that rides a 1 g ship from the Sun to a chosen galaxy and draws the universe as the ship's frame
measures it: the sky ahead squashed by the Lorentz factor, blue ahead and red behind, with the ship clock and the
Earth clock side by side.

Brainstormed 2026-10-18 from `docs/backlog/2026-10-18-relativistic-voyage.md` (retired by this spec). Rulings are
listed in §2; the rest of the document assumes them.

## 1. Intent

- **Who:** a visitor who has heard "you could reach Andromeda in a lifetime at 1 g" and wants to see what that means.
- **Outcome:** open the exhibit, press run, and watch 28.6 ship-years pass in a minute while the Earth clock runs
  through 2.5 million. Scrub to any instant. Everything in the scene (stars, the Milky Way, galaxies, the planets
  left behind) contracts along the line of flight; everything recolours by its direction from the ship.
- **Constraints:** the warp must reach every renderer the same way, or the layers come apart (a squashed star field
  inside an unsquashed Milky Way). No per-renderer geometry work. Nothing changes outside the exhibit.
- **Success:** at the Andromeda turnaround the readouts show 14.3 ship-years, 1.27 million Earth-years,
  γ = 1.3 million and "Andromeda: 0.97 light-years ahead"; the Milky Way behind is a red disc, M31 ahead a blue one;
  `npm run shot` on the exhibit's link at four instants matches the table in §3.1.

## 2. Rulings

| Question | Ruling |
| --- | --- |
| Picture | **Map**: the ship-frame layout at ship-simultaneous instants. Lorentz contraction, not aberration. Aberration is a later Window picture |
| Colour | Doppler by direction from the ship as a hue shift, plus the headlight brightening behind a dial: `pow(D, k)` under a soft ceiling, `k` default 1 (physics is 4). Off/on in the overlay, `k` in the debug tuning section |
| Clock | The sim clock stays Earth time. Ship state is a pure function of (destination, sim instant − launch); the exhibit scrubs and plays in ship time and converts |
| Where contraction lands | One fold per slab: each slab's `vp` becomes `proj · view · C`, with `C` expressed in that slab's frame. No shader learns about contraction for position |
| Galaxy billboard size | From the contracted distance, so M31 grows as it closes. Disk and thumbnail promotion (CPU gates) unchanged |
| Star brightness | Earth-frame distance, unchanged. A point source's brightness is a Window effect |
| How core learns the boost | A Layer contributes it: `Layer.boost?(state, simDays)`. At most one Layer answers; core folds it. The camera driver table is not involved |
| Doppler plumbing | Each recolouring renderer grows its own uniform tail by two `vec4`; a shared `lib/boost.wesl` holds the maths. `CameraUniforms` does not grow (renderers pack behind it by literal offsets) |
| Intent home | A `voyage` Layer with one settings cluster, inside `SettingsSnapshot`, so the takeover bracket restores it (destination `null` ⇒ no boost) |
| Launch point | The Sun, `[0, 0, 0]`. Copy says Earth; 1 au is nothing at these scales |
| Arrival | Each destination has a standoff: the ship comes to rest `standoffLy` short of the catalogue position along the line of flight. 1 ly for Sgr A\* (outside the S-star cluster; coming to rest at a black hole is where general relativity would start to matter), 0.01 ly for Proxima, 0 for the galaxies (you arrive inside a 40 kpc object) |
| Earth clock | Earth's own elapsed time, `t(τ)`. The ship-judged Earth time (which stays under 0.97 years for the whole accelerating half) is a sentence in the copy, not a readout |
| Destinations | Four fixed rows: Proxima Centauri, Sagittarius A\*, Andromeda (M31), M87 (Virgo). One exhibit id per destination |
| Deep link | The exhibit id only; it opens at launch. A ship-time hash param is a follow-up |
| Ground preparation | None needed (§3). One adjacent finding backlogged |

## 3. Ground preparation

Ground check run 2026-10-18 over the nine touchpoints below. None is a special case; every one is growth or an
addition. No prep commits.

| Touchpoint | Verdict | Why |
| --- | --- | --- |
| Slab `vp` composition (`slabs.ts:238` `deriveSlabs`, `bodySlabRow`, `deriveView.ts:43`) | growth | Every slab's `vp` is composed in f64 in one function; a boost is one more multiply at the end of it. `rebaseViewProj` and the body MVP composers multiply on the right afterwards, so they compose with the fold unchanged |
| Frame context (`frameContextInputOf.ts`, `ReadyFrameContext`) | growth | One new field beside `simDays` |
| Layer contract (`Layer.d.ts`) | growth | One optional member; `instantiateLayer` is the one call site |
| Settings cluster | growth | A Layer slice like `missions`, picked into the snapshot by `LayerSettingsClusterKey` |
| Exhibit kind with hold + camera row (`missionTimelineKind.ts`) | growth | The second instance of a pattern built for one; nothing in it is mission-specific |
| Clock profile (`ClockProfile`, `startClockProfile`) | growth | A wall→sim table is exactly a ship-time→Earth-time table |
| Recolouring shaders (stars, galaxy points and disks, Milky Way splats) | growth | Each has its own `Uniforms` tail; the fields append |
| Hash params | growth | `takeoverSource('exhibit')` already carries the id |
| `RENDER_ORIGIN_MPC` | **adjacent finding** | It doubles as the Sun's position in six passes (`sunDirLocal(…, RENDER_ORIGIN_MPC, …)`). Not needed here: star records are camera-relative on the GPU and the fold is f64, so the origin need not move. Backlogged as `docs/backlog/2026-10-18-render-origin-doubles-as-sun.md` |

## 4. Shape

### 4.1 Physics

Units: years, light-years, `c = 1`, `a = g·yr/c = 1.0323 ly/yr²`. Everything is closed-form in Earth time `t`
since launch, so nothing is integrated and no inversion is needed:

```
γ(t) = √(1 + (a t)²)       β(t) = a t / γ(t)       x(t) = (γ(t) − 1) / a       τ(t) = asinh(a t) / a
```

The deceleration half mirrors the acceleration half about the midpoint. A trip of length `d`:
`γ_max = 1 + a d / 2`, `τ_total = 2·acosh(γ_max) / a`, `t_total = 2·√(γ_max² − 1) / a`.

| Destination | d | ship time | Earth time | γ_max |
| --- | --- | --- | --- | --- |
| Proxima Centauri | 4.24 ly | 3.54 yr | 5.87 yr | 3.19 |
| Sagittarius A\* | 26.7 kly | 19.8 yr | 26.7 kyr | 1.38 × 10⁴ |
| Andromeda | 2.54 Mly | 28.6 yr | 2.54 Myr | 1.31 × 10⁶ |
| M87 | 54.7 Mly | 34.6 yr | 54.7 Myr | 2.83 × 10⁷ |

At turnaround the whole Sun-to-destination line measures `d / γ_max → 2 / a = 1.94 ly` in the ship frame, for every
far destination; the half still ahead is `1 / a = 0.97 ly`, the same length as the Rindler horizon behind.

Doppler factor of a source seen at angle θ from the direction of travel: `D = 1 / (γ (1 − β cos θ))`.

```ts
// src/utils/relativity/ — one function per file, each with a test against the tables above
export function shipStateAt(distanceLy: number, earthYr: number): ShipState; // clamps past arrival
export function tripOf(distanceLy: number): TripSummary;
export function contractionMat4(shipRel: Vec3, dir: Vec3, gamma: number): Float64Array; // T(s)·(I − (1 − 1/γ) n nᵀ)·T(−s)

// src/@types/relativity/ShipState.ts
export type ShipState = {
  readonly tauYr: number;
  readonly xLy: number; // along the line of flight from the launch point
  readonly beta: number;
  readonly gamma: number;
  readonly phase: 'accelerating' | 'decelerating' | 'arrived';
};
// src/@types/relativity/TripSummary.ts
export type TripSummary = { readonly tauTotalYr: number; readonly tEarthTotalYr: number; readonly gammaMax: number };
```

### 4.2 The boost: one fact per frame

```ts
// src/@types/engine/frame/FrameBoost.ts — the observer's frame, derived per frame; null is the rest frame
export type FrameBoost = {
  readonly shipMpc: Vec3; // the fixed point of the contraction
  readonly dir: Vec3; // unit, Earth-frame direction of travel
  readonly beta: number;
  readonly gamma: number;
  readonly contraction: boolean;
  readonly doppler: boolean;
  readonly headlight: number; // the exponent k; 0 is off
};

// Layer.d.ts — growth
readonly boost?: (state: RootState, simDays: number) => FrameBoost | null;

// FrameContextInput / ReadyFrameContext — growth, beside `simDays`
readonly boost: FrameBoost | null;
```

`frameContextInputOf` asks every instantiated Layer and takes the one non-null answer (two answering is a
composition error, thrown at boot by `instantiateLayer`, not arbitrated per frame).

### 4.3 The fold

`deriveSlabs` takes `boost` and, after building the table, replaces each slab's `vp` by `vp · C_slab` when
`boost.contraction` is set. `C_slab` is `contractionMat4` with the ship expressed in the slab's own frame:

| Slab frame | ship in slab coordinates |
| --- | --- |
| `world-mpc`, `originRelative: false` (COSMO) | `shipMpc` |
| `world-mpc`, `originRelative: true` (NEAR0) | `shipMpc − RENDER_ORIGIN_MPC` |
| `body-m` (every body row) | `(shipMpc − eyeMpc) · MPC_TO_M` |

`FrameView.vp` (the COSMO f32 copy the CPU label projection reads) is the folded COSMO `vp`. Nothing else changes:
`drawCamPos` is the eye, and the eye is the ship, so `camPos` readers stay correct; `rebaseViewProj`,
`near0LabelProjection`, `composeBodyMvp`, `composeBodySlabMvp` and `composeMeshMvp` all multiply on the right of
the slab `vp` and so inherit the fold; the pick renderers share the slab `vp` and pick the contracted scene.

What this buys: star points and star catalog, star spheres, Milky Way splats, local bubble, constellations, galaxy
points and disks, filaments, flow, structure markers, labels, mission trails, planets and mesh bodies all contract
in one place, including the CPU-side label and marker projection.

### 4.4 Doppler and the billboard size

```wgsl
// src/services/gpu/shaders/lib/boost.wesl
struct BoostUniforms { dir: vec3<f32>, beta: f32, gamma: f32, doppler: f32, contraction: f32, headlight: f32 } // two vec4
fn dopplerFactor(toSource: vec3<f32>, b: BoostUniforms) -> f32;         // 1.0 when b.doppler == 0
fn contractAbout(p: vec3<f32>, ship: vec3<f32>, b: BoostUniforms) -> vec3<f32>; // identity when b.contraction == 0
fn boostedBpRp(bpRp: f32, d: f32) -> f32;                                 // blackbody at D·T, via a BP−RP ↔ T fit
fn headlightGain(d: f32, b: BoostUniforms) -> f32;                         // soft-ceilinged pow(d, k); 1.0 when k == 0
```

Three renderers append `BoostUniforms` to their own uniform tail and write it from `ctx.snapshot.boost`:

- **Star catalog** (`starCatalog/vertex.wesl:322`): `starTint(boostedBpRp(bpRp, D))`. `d2` (brightness) stays
  Earth-frame.
- **Galaxy points, procedural and textured disks**: the colour index shifts by `−K_CI · log2(D)` before the ramp
  (`lib/colorIndex.wesl:160`), `K_CI` a tuning constant in `src/data/voyage/`; the billboard radius divides by
  `length(contractAbout(p.position, u.camPosWorld, b) − u.camPosWorld)` instead of the Earth-frame distance
  (`points/vertex.wesl:159`).
- **Milky Way splats** (`milkyWayCloudRenderer.ts:185`, the field splat shaders): emission tinted by `D` of the
  splat's direction from the camera.

All three multiply their radiance by `headlightGain(D)`: `pow(D, k)` folded through `h (1 + 1/HEADLIGHT_CEIL) / (1 + h / HEADLIGHT_CEIL)` (exactly 1 at D = 1, asymptote CEIL + 1),
`HEADLIGHT_CEIL` a constant in `src/data/voyage/` (start at 64; the forward Doppler factor passes a million, so
without a ceiling the tone-map sees a white wall by ship-year three). The dial `k` is a `SliderField` row in the
debug tuning section, `[0, 4]`, as the black-hole `dopplerStrength` is; the overlay only switches it on and off.

`boostedBpRp` has a TS twin and a test: identity at `D = 1`, monotone, and an M star at `D = 2` lands in the K–G
range. The galaxy shift is a visualisation constant, not photometry, and the copy says so.

### 4.5 The voyage Layer

```
src/layers/voyage/
  layer.ts            name 'voyage'; settings [voyageSlice]; exhibits VOYAGE_EXHIBITS; boost: selectFrameBoost
  state/voyage/       slice, initialState, selectors
  exhibits/           voyageExhibits.ts (one Exhibit per destination), voyageKind.ts, voyagePose.ts
  sagas/              voyageHoldSaga.ts, voyagePlaySaga.ts
  ui/                 VoyageContainer.tsx, Voyage.tsx, VoyageReadouts.tsx, voyageShortcuts.ts
  @types/             VoyageSettings.ts, VoyageDestination.ts, VoyageDestinationId.ts, VoyageSection.ts
```

```ts
export type VoyageDestinationId = 'proxima' | 'sgrAStar' | 'm31' | 'm87';
export type VoyageDestination = {
  readonly id: VoyageDestinationId;
  readonly label: string;
  readonly positionMpc: Vec3; // src/data/voyage/voyageDestinations.ts; a test pins m31/m87 to the famous seed
  readonly arrivalRadiusMpc: number | null; // half the seed's diameterKpc, for the arrival framing; null for Proxima and Sgr A*
  readonly standoffLy: number; // the trip is `|positionMpc| − standoffLy` long; the ship rests that far short
};
export type VoyageSettings = {
  readonly destination: VoyageDestinationId | null; // null ⇒ no boost, the rest frame
  readonly launchDays: number | null; // sim JD the trip starts at; set when the exhibit opens
  readonly contraction: boolean;
  readonly doppler: boolean;
  readonly headlight: number; // exponent k; the overlay toggle sets 0 or the last non-zero value
  readonly speed: number; // MISSION_SPEEDS factor, as the missions transport
};
// selectors.ts
export function selectFrameBoost(state: RootState, simDays: number): FrameBoost | null;
export function selectShipState(state: RootState, simDays: number): ShipState | null;
```

`selectFrameBoost` is `shipStateAt` on `(destination, simDays − launchDays)` turned into Mpc along `dir`; past
arrival the ship rests at the destination with `gamma = 1`.

### 4.6 The exhibit

One `Exhibit` row per destination (`voyage-proxima`, `voyage-sgrAStar`, `voyage-m31`, `voyage-m87`), each with
`settings` that turn on the star catalog, the Milky Way and the galaxy layers and set its own `voyage` cluster
(destination, `contraction: true`, `doppler: true`). The body is one `voyageKind` section plus prose, facts and
sources sections.

`voyageKind: ExhibitSectionKind<VoyageSection>`:

- **hold** (`voyageHoldSaga`): sets `launchDays` to the sim instant at opening, pauses the clock there, flies in
  (reusing `exhibitBodySaga`'s entry), then loops on run / pause / scrub / speed until `exitTakeover`. Run
  starts a `ClockProfile` from `buildVoyageProfile`. A destination tab opens the sibling exhibit
  (`voyage-<id>`, entry `'cut'`), a takeover swap, so title, facts and the URL follow it.
- **cameraDriver** (`voyagePose`, priority 58, `commitsOnEdge: 'displayed'`, as the mission row): eye at the ship,
  looking along `dir`, with the visitor's drag and wheel offsets as `missionPose` carries them. Past arrival, the
  framing of the destination's `arrivalRadiusMpc` sphere where there is one.
- **shortcuts**: space run/pause, `−`/`+` speed, `[`/`]` as the missions transport.

```ts
// src/utils/voyage/buildVoyageProfile.ts — wall ∝ ship time; sim = launch + t(τ)
export function buildVoyageProfile(
  destination: VoyageDestination,
  fromDays: number,
  launchDays: number,
  speed: number,
  nowMs: number,
): ClockProfile;
export const VOYAGE_WALL_MS = 60_000; // one whole trip at 1×
```

**Overlay** (`Voyage.tsx`, in the notes column): destination tabs; a scrub track in ship years with the midpoint
marked; transport; and the readouts, re-derived on the 4 Hz interval the missions timeline uses:

| Readout | Source |
| --- | --- |
| Ship clock | `τ`, years and days |
| Earth clock | Earth's own elapsed time `t`, labelled so, formatted from years since launch, never through `Date` (a `Date` ends at year 275,760) |
| Speed | `1 − β` once β > 0.999, else β |
| γ | plain |
| Ahead | the destination's remaining distance, Earth frame and ship frame side by side |

Three toggles (`ExhibitToggle` rows): contraction, Doppler shift and headlight, each dispatching the cluster's
setter.

Copy, three prose sections: why the ship clock runs slow and the Earth clock runs away, with the one sentence
on simultaneity (in the ship's own "now", Earth's clock stays under 0.97 years for the whole accelerating half,
then leaps: the Rindler horizon, nothing from more than 0.97 light-years behind can catch an accelerating ship);
the 1.94 light-year invariant; Map versus Window (what a photograph would show instead). Written per `docs/tour/writing-style.md`.

### 4.7 Deep link

`#exhibit=voyage-m31` opens the exhibit at launch, through the existing `takeoverSource('exhibit')` row. On a
reload the hold ignores `t=` and re-launches. The `t=` writer (`hashParamSources.ts:202`) calls `toISOString()`
on the sim instant, which throws past year 275,760; it writes `null` outside the `Date` range instead. The
voyage's own readouts never go through `Date`.

## 5. Out of scope

- The Window picture: aberration and the starbow. The `lib/boost.wesl` helpers are the seam it plugs into.
- A third-person ship (a GLB via `add-mission`) and the camera orbiting it. The fold is centred on `shipMpc`, not
  the eye, so this needs no change to §4.3.
- A ship-time hash param for sharing a mid-trip view.
- Disk and thumbnail promotion on the contracted distance.
- The render origin following the ship (not needed: see §3).
- A grand-tour beat.

## 6. Verification

- **Physics:** `tripOf` and `shipStateAt` reproduce the §4.1 table to three figures; `τ(t)` and `x(t)` are
  continuous through the midpoint; `shipStateAt` past arrival is `arrived` at `gamma = 1`. (The TS `dopplerFactor` twin
  was dropped in review: no production caller, and its form differed from the WGSL's.)
- **Contraction matrix:** identity at `γ = 1`; the ship is a fixed point; a perpendicular offset is unchanged; an
  offset along `dir` scales by `1/γ`.
- **The fold:** through `deriveSlabs`, a world point on the line of flight projects where its contracted position
  would at `γ = 1`, on COSMO, NEAR0 and a body row alike; with `contraction: false` the slabs are bitwise what they
  were.
- **Boost composition:** two Layers answering `boost` fail at `instantiateLayer`; none answering yields `null`.
- **Profile:** `buildVoyageProfile` is monotone in both columns, starts at `fromDays` and ends at arrival, and
  halves its wall length at speed 2.
- **Shaders:** `boostedBpRp` identity and monotonicity, and `headlightGain` at `k = 0` identity and bounded by the
  ceiling, through their TS twins; a shader-module compile test for the
  three renderers with the new tail (the existing pattern for the point shader).
- **Settings:** the exhibit's exit restores `voyage.destination` to `null` and the boost to `null`.
- **By eye:** `npm run shot` on `#exhibit=voyage-m31` scrubbed to τ = 0, 3, 7.4 and 14.3 years: the Milky Way
  flattening and reddening behind, M31 growing and bluing ahead; then Proxima, where γ never passes 3.2 and the
  nearby stars visibly shear. Sent as dash checks.

## 7. Build order

One feature PR, five groups:

1. Physics helpers and their tests; `FrameBoost` and the contraction matrix.
2. The fold: `Layer.boost`, the frame context field, `deriveSlabs`; a debug slider pair (γ, direction) in the
   debug panel proves every layer squashes before any exhibit exists.
3. The `voyage` Layer: slice, destinations, exhibits, hold, profile, camera row, overlay, readouts, toggles.
4. Doppler and headlight: `lib/boost.wesl`, the three renderers' uniform tails, the galaxy billboard size, the
   tuning slider.
5. Copy, shots, `/feature-done` with the deletion audit.

Verify at plan time, as plan tasks: the Milky Way presents sample no world position (else they take the inverse
warp); what the TimeBar shows past year 275,760 while the exhibit is up (`formatSimClock` pads `NaN` rather than
throwing).
