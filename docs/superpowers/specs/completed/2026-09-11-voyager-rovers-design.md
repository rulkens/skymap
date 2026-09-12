# Voyager 1/2 and the Mars rovers as mesh bodies (design)

Six real spacecraft join the mesh-body arm shipped by
[`2026-09-10-mesh-bodies-design.md`](completed/2026-09-10-mesh-bodies-design.md):
**Voyager 1** and **Voyager 2** on their heliocentric hyperbolas at 172 and 144 au,
and **Curiosity**, **Perseverance**, **Spirit** and **Opportunity** standing at
their landing sites on Mars. Nothing about the `.mesh` format, the renderer, the
shaders, the loader or the InfoCard changes. What changes is the three mechanisms
the whale and the petunias did not need — a hyperbolic conic, a surface-fixed
position driver, and a second and third orientation kind — plus the one
presentation fact a deep-space probe forces: a mesh body with no host to ride
gets a body-slab row of its own.

This spec consumes and deletes three backlog detail files:
`2026-09-10-hyperbolic-kepler-branch.md`, `2026-09-10-surface-fixed-position-driver.md`,
`2026-09-10-rotation-table-tagged-union.md`.

## Goal

Each of the six is a `MeshBody`: searchable, pickable, fly-to-able, captioned,
lit by the Sun, drawn as a real triangle mesh above 3 px and a tinted glint
below it. A Voyager aims its high-gain antenna at Earth. A rover stands upright
at its landing site and turns with Mars.

## Non-goals

- **No trail for a hyperbola.** `TRAIL_ELEMENTS` already excludes every mesh
  body; a hyperbolic trail renderer is out of scope (ruling 6).
- **No inverse-square sunlight.** The shader keeps its constant irradiance
  (ruling 4) — see "Lighting" for why.
- **No terrain.** Mars is a 3390 km sphere; a landing site's real elevation
  relative to the areoid is not modelled.
- **No rover articulation, no deployed-boom animation, no RTG glow.** The bake
  freezes the rest pose, as it does for the whale's rig.
- **No second settings row.** The six ride the one `Source.MeshBody` registry
  entry, so the Labels & Guides checkbox mutes all eight mesh bodies together.

## Data

### Voyager 1 and 2 — heliocentric osculating elements

JPL Horizons, fetched 2026-09-11. `CENTER='500@10'` (Sun body centre),
`REF_PLANE='ECLIPTIC'` (ecliptic of J2000.0), `OUT_UNITS='AU-D'`, epoch
**JDTDB 2461294.5** = 2026-Sep-11 00:00 TDB.

| column      | Voyager 1 (`-31`)    | Voyager 2 (`-32`)    |
| ----------- | -------------------- | -------------------- |
| EC          | 3.703612020159509    | 6.278903766787083    |
| QR (au)     | 8.693415695391655    | 21.22294682244500    |
| IN (deg)    | 35.76697119202111    | 78.98684868193521    |
| OM (deg)    | 178.8798914884395    | 101.8114786642040    |
| W (deg)     | 338.2500033699420    | 130.0227165233163    |
| Tp (JD)     | 2444233.650346363429 | 2445454.392982037272 |
| N (deg/day) | 0.1709365587071547   | 0.1222675366750901   |
| MA (deg)    | 2916.322928412766    | 1936.730865756128    |
| A (au)      | −3.215481966557751   | −4.020332205328676   |

Refresh query (record verbatim in `data/raw/meshes/voyager/README.md` so a
re-fetch is one command; swap `-31` for `-32`):

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-31'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='ELEMENTS'&CENTER='500@10'&START_TIME='2026-09-11'&STOP_TIME='2026-09-12'&STEP_SIZE='1d'&REF_PLANE='ECLIPTIC'&OUT_UNITS='AU-D'
```

**Derived values** (computed against these columns; the arithmetic is in
"Hyperbolic orbits" below):

|                                      | Voyager 1         | Voyager 2         |
| ------------------------------------ | ----------------- | ----------------- |
| M at J2000 = N·(2451545.0 − Tp), deg | 1249.776949297383 | 744.683516942319  |
| dM/dt = N·36525, deg/Julian century  | 6243.457806778826 | 4465.821777057666 |
| hyperbolic anomaly H at the epoch    | 3.3791299750726   | 2.4539801880217   |
| heliocentric r at the epoch, au      | **171.722**       | **143.912**       |

Two independent consistency checks on the transcription, both of which belong in
the test suite because they are external facts, not restatements:

- `A·(1 − EC)` reproduces the published `QR` to 1.6e-14 au (both rows).
- `N·(epoch − Tp)` reproduces the published `MA` to 2.2e-11 deg (both rows) —
  which is what lets the row be authored from `Tp` alone (ruling 13).

### Rover landing sites

Planetocentric latitude, **east** longitude, on the IAU Mars body-fixed frame
(`ROTATION_ELEMENTS`' `mars` row: α₀ 317.68143°, δ₀ 52.8865°, W₀ 176.63°,
Ẇ 350.89198226°/day). These are **landing** sites, which is what the app shows:
Curiosity has since driven ~35 km up Mount Sharp, Opportunity ~45 km to
Perseverance Valley. The spec states this rather than pretending to a live
position none of the four has.

| body           | site                           | lat (°)  | lon E (°) |
| -------------- | ------------------------------ | -------- | --------- |
| `curiosity`    | Bradbury Landing, Gale         | −4.5895  | 137.4417  |
| `perseverance` | Octavia E. Butler, Jezero      | +18.4447 | 77.4508   |
| `spirit`       | Columbia Memorial, Gusev       | −14.5684 | 175.4726  |
| `opportunity`  | Challenger Memorial, Meridiani | −1.9462  | 354.4734  |

### Mesh assets — four, for six bodies

NASA 3D Resources, public domain per NASA's media-usage guidelines. Spirit and
Opportunity are the same spacecraft design and share one asset.

| key            | bodies                  | source                                                            | download                             |
| -------------- | ----------------------- | ----------------------------------------------------------------- | ------------------------------------ |
| `voyager`      | `voyager1`, `voyager2`  | "Voyager Probe (B)", NASA/Michael D. Carbajal                     | GLB, 1.64 MB                         |
| `perseverance` | `perseverance`          | "Mars 2020 Perseverance Rover", Brian Kumanchik, NASA/JPL-Caltech | GLB, 4.76 MB                         |
| `curiosity`    | `curiosity`             | "Curiosity Rover (MSL) (Clean)"                                   | Blender .zip, 5.84 MB → export       |
| `mer`          | `spirit`, `opportunity` | "Mars Exploration Rover — Spirit and Opportunity"                 | .blend, 11.68 MB → export + decimate |

**Budget: each baked asset's `.mesh` + its three PNGs must total under 10 MB on
disk** (user ruling). The MER `.blend` is over that before export, so its prebake
decimates; `TRIANGLE_BUDGET` (150 000) and `TEXTURE_SIZE_BUDGET` (2048) already
bound the rest. An asset agent is fetching these into `data/raw/meshes/<key>/`
and running the Blender prebakes in parallel with this design; its report lands
at `.superpowers/sdd/2026-09-11-voyager-rovers/asset-report.md` and is the input
the asset task consumes.

### Facts

Six `data/seeds/planet_facts.seed.json` rows, each with a `wikiTitle`
(`Voyager_1`, `Voyager_2`, `Curiosity_(rover)`, `Perseverance_(rover)`,
`Spirit_(rover)`, `Opportunity_(rover)`) and a two-sentence factual
`description` — no marketing voice (ruling 7). `distance` and `yearLength` rows
carry honestly-labelled values for a probe ("171.7 au from the Sun, 2026-09-11";
"escape trajectory, no orbital period") rather than being omitted, since the
card drops an absent row entirely.

## Mechanisms

### Hyperbolic orbits

`eccentricAnomalyFromMean` solves `M = E − e·sin E` and documents its domain as
`e ∈ [0, 1)`; `keplerianEllipse` computes `b = a·√(1 − e²)`, which is `NaN` for
`e > 1`. Both are correct and stay untouched. The hyperbolic case is a **sibling**,
selected by eccentricity at the row.

`hyperbolicAnomalyFromMean(meanAnomalyRad, eccentricity)` solves the hyperbolic
form

```
M = e·sinh H − H
```

by Newton's method: `g(H) = e·sinh H − H − M`, `g'(H) = e·cosh H − 1 ≥ e − 1 > 0`,
so the root is unique and convergence is quadratic, exactly as for the elliptic
case. The seed is `H₀ = asinh(M / e)`, which is the large-`M` asymptote and is
already within ~0.5 of the root at the two Voyagers' anomalies (they converge in
4–6 steps against the same `1e-14` tolerance the elliptic solver uses).

The anomaly→position step is the same affine map with `cosh`/`sinh` in place of
`cos`/`sin`, and with one sign change:

```
X(H) = C + A·cosh H + B·sinh H
A    = a · P̂w                 (a is NEGATIVE for a hyperbola)
C    = −a·e · P̂w              (identical formula to the ellipse's)
B    = −a·√(e² − 1) · Q̂w      (the ellipse's is +a·√(1 − e²) · Q̂w)
```

`P̂w`/`Q̂w` — the perifocal axes mapped into equatorial world through the row's
reference plane — are **identical** to the ellipse's, which is why ground prep P1
extracts them (below). At `H = 0` this gives `X = a(1 − e)·P̂w = |a|(e − 1)·P̂w`,
the periapsis at distance `QR` along `P̂w`; `H > 0` runs prograde along `Q̂w`.

`propagateElements` needs **no change**: `M` advances linearly in time for a
hyperbola exactly as for an ellipse (`M = n·(t − Tp)`, `n = √(μ/|a|³)`), the other
five elements carry no rates on these rows, and a branch there would be a no-op
branch (ruling 12 — a deliberate, recorded departure from the parenthetical in
the brief's ruling 1). The single dispatch point is `keplerianPositionMpc`, which
is `deriveBodyStates`' one call site.

**Landmine — `SCENE_ORBIT_CONICS`.** `deriveOrbitConics`
(`src/data/bodies/sceneOrbitConics.ts:89-106`) maps **`ORBITAL_ELEMENTS`**, not
`TRAIL_ELEMENTS`, so a hyperbolic row reaches `keplerianEllipse` and poisons the
table with `NaN` — and the existing "places each body on its own ellipse" test
fails with it. Ground prep P2 fixes the root cause: the table that answers "which
rows draw a conic" already exists, and it is `TRAIL_ELEMENTS`.

### Position drivers as a tagged union

Today a body's position comes from `SCENE_ANCHORS` (authored point) or
`ORBITAL_ELEMENTS` (Keplerian orbit), and every consumer that wants to know
_which_ asks by membership. A rover needs a third: fixed at a latitude/longitude
on a host that spins under it. Per ruling 1 the three become a union
`deriveBodyStates` dispatches on:

```ts
// src/@types/scene/PositionDriver.d.ts
export type PositionDriver =
  | { readonly kind: 'anchor'; readonly id: string; readonly positionMpc: Vec3 }
  | { readonly kind: 'orbit'; readonly id: string; readonly elements: OrbitalElements }
  | {
      readonly kind: 'surfaceFixed';
      readonly id: string;
      readonly hostId: string;
      readonly latDeg: number; // planetocentric
      readonly lonDeg: number; // east-positive
      readonly altitudeM: number; // above the host's mean sphere
    };
```

`src/data/bodies/positionDrivers.ts` **derives** `POSITION_DRIVERS` from the
three authored tables — `SCENE_ANCHORS`, `ORBITAL_ELEMENTS`, and the new
`SURFACE_FIXED_SITES` — rather than replacing them. Authoring stays where it is:
an orbital row keeps its rich shape and its own consumers (`elementsById`,
`TRAIL_ELEMENTS`, `orbitTrailsPass`, `focusResolveOrder`), and the union is the
**read** surface for the two questions that are genuinely driver-shaped:

```ts
export function positionDriverById(id: string): PositionDriver; // throws on a miss
export function bodyHostId(id: string): string | null; // orbit → focusId, surfaceFixed → hostId, anchor → null
```

The surface point, in the host's body-fixed axes, is the standard spherical
conversion with east-positive longitude:

```ts
// src/utils/scene/surfacePointBodyFixed.ts
export function surfacePointBodyFixed(latDeg: number, lonDeg: number, radiusM: number): Vec3; // [r·cosφ·cosλ, r·cosφ·sinλ, r·sinφ]
```

and the world position is `hostPos + hostOrientation · surfacePointBodyFixed(…)`
with `radiusM = hostRadiusM + altitudeM`.

`altitudeM` is **not** eyeballed. The bake recentres every mesh on its
area-weighted surface centroid (`buildMeshes.ts:340-380`), so a rover's origin
sits inside its chassis and `altitudeM: 0` would bury half of it. `MeshAssetRow`
gains `groundOffsetM` — how far the lowest vertex sits below the origin along the
body frame's −Z, in metres — and each `SURFACE_FIXED_SITES` row authors
`altitudeM: MESH_ASSETS[key].groundOffsetM`, so a re-bake that moves the centroid
moves the rover with it (ruling 29).

### Rotation as a tagged union

`RotationElements` becomes a discriminated union. Per ruling 2 **today's 21 rows
are untouched**, so the `iau-pole` arm's discriminant is optional and its absence
means `'iau-pole'`:

```ts
// src/@types/scene/RotationElements.d.ts
export type RotationElements =
  | {
      readonly kind?: 'iau-pole';
      readonly id: string;
      readonly poleRaDeg: number;
      readonly poleDecDeg: number;
      readonly primeMeridianDeg: number;
      readonly spinRateDegPerDay: number;
    }
  | { readonly kind: 'lookAt'; readonly id: string; readonly targetId: string }
  | { readonly kind: 'surfaceLocked'; readonly id: string; readonly headingDeg: number };
```

`orientationForBody` dispatches with `switch (row.kind)`, whose `case undefined:
case 'iau-pole':` arm narrows correctly and whose `default: never` keeps it
exhaustive. Each arm delegates to one util:

```ts
// src/utils/orbit/rotationLookAt.ts
export function rotationLookAt(bodyPosMpc: Vec3, targetPosMpc: Vec3): Mat3;
// src/utils/orbit/rotationSurfaceLocked.ts
export function rotationSurfaceLocked(
  bodyPosMpc: Vec3,
  hostPosMpc: Vec3,
  hostPoleWorld: Vec3,
  headingDeg: number,
): Mat3;
```

**`lookAt` roll convention.** The body frame's **+X is the boresight** (the
high-gain antenna's axis) and **+Z is the reference up** (the side the bus and
the RTG boom hang off). `rotationLookAt` puts +X on the unit vector from the body
to the target, then places +Z as near the **ecliptic north pole** as the boresight
allows (Gram-Schmidt against +X, renormalised); +Y completes the right-handed
triad. The degenerate case — boresight within 1e-6 of the ecliptic pole, which
neither Voyager ever reaches — falls back to the ecliptic +X axis as the up
reference. Stating the convention is load-bearing: without it the dish points
correctly and the spacecraft rolls arbitrarily around it.

**`surfaceLocked` frame.** The body frame's **+Z is up** and **+X is forward**.
`rotationSurfaceLocked` derives the local triad from the body's own derived
position rather than from a second copy of lat/lon: `up = normalize(bodyPos −
hostPos)`; `north = normalize(hostPole − up·(hostPole·up))`, the host's spin axis
projected perpendicular to up; `east = cross(north, up)`. `headingDeg` then
rotates forward from north toward east about up. The host pole is the third
column of the host's own orientation `Mat3` (`rotationFromIau`'s docblock states
that column is the pole), so there is nothing to keep in step.

The four rover headings are authored per body and checked in the visual pass;
they are presentation, not fact, since the app shows a landing pose.

### Resolution order in `deriveBodyStates`

A surface-fixed position reads its host's **orientation**; a look-at orientation
reads another body's **position**. Today's single loop interleaves the two and
cannot express either. The fix (ground prep P3) is a phase split, with
`orientationForBody` taking the position map as a third argument:

```
Phase 1 — positions
  1a  anchors            authored, no dependency
  1b  orbit rows         in FOCUS_ORDER (focus before dependant), the existing loop
  1c  surfaceFixed rows  host position (1a/1b) + host orientation
Phase 2 — orientations   every body, over the finished position map
```

`orientationForBody(id, simDays, positions)`'s `iau-pole` arm ignores `positions`
entirely, which is what makes phase 1c safe: it calls the same function for its
host mid-phase-1, and every host of a surface-fixed body is an IAU-pole planet.
The invariant — **a surface-fixed body's host must carry an `iau-pole` rotation
row** — is documented at the call site; it is also structurally true, since the
only bodies with slab rows and textures are planets. `lookAt` targets must be
positioned in phase 1, which every body except another surface-fixed one is.

### A hostless mesh body hosts itself

A mesh body rides its host's `body-m` slab row, the way a ring rides Saturn's.
A rover's host is Mars, which has a row — so a rover is, structurally, the whale.
A Voyager's position driver names the **Sun**, which has no slab row at all (it
rides `SCENE_STARS`, not `slabBodyCandidates`), and 172 au expressed in metres is
2.6e13, far outside f32's usable range for a depth-composed row. Per ruling 3 it
gets a row of its own — expressed not as a special case but as a one-line
widening of the join everything downstream already uses:

```ts
// src/utils/scene/meshBodySlabHostId.ts
/** The body-slab row a mesh body draws in: its position driver's host when that
 *  host owns a row, else the body itself. */
export function meshBodySlabHostId(body: MeshBody): string;
```

`SLAB_HOST_IDS` is the static set `{SCENE_EARTH.id} ∪ SCENE_PLANETS ∪
SCENE_ANCHOR_POINT_BODIES`, the same three tables `slabBodyCandidates` composes.
With that one function in place:

- `meshBodiesAttachedTo` groups on it instead of `elementsById(id).focusId`
  (which **throws** for a body with no orbital row, so a rover would crash it as
  written). `meshBodiesAttachedTo('voyager1')` returns `[voyager1]`.
- `frameContext.ts:118-120`'s `meshHostIds` reads it for the same reason.
- `frameContext.ts:97-100`'s `slabBodyCandidates` appends the self-hosting mesh
  bodies, read off `state.data.bodies.meshBodies` so the roster stays
  store-driven.
- `BODY_SLAB_CAPACITY` (`frameProgram.ts:89`) gains `+ HOSTLESS_MESH_BODIES.length`
  — **25 → 27**, derived from the table, never a literal (ruling 25).
- `meshBodiesPass` needs no structural change: for `hostId === 'voyager1'`,
  `bodyStateInHostFrame(self, self)` yields `posM = [0, 0, 0]` and `rotM =
IDENTITY`, which is exactly the "drawn in its own row at the origin" ruling 3
  asks for, with the shader's host-axes frame contract satisfied because the host
  _is_ the body.
- `attachedBodiesByHostId` picks the Voyager up as a sphere attached to itself at
  `posM = 0`. That is a **provable no-op** on the near plane:
  `nearestSphereFaceM` returns `dM − radiusM`, and `bodySlabRow`'s own `hostNear`
  is already `≤ viewZ − marginM ≤ dM − radiusM`, so the `Math.min` never bites.

### Lighting a body with no host

Two terms in `meshBodiesPass` read the host, and both go wrong when the host is
the body itself:

1. **`sunVisibleFraction` returns `NaN`.** With `hostPosMpc === bodyPosMpc` the
   host direction is `0/0 = NaN`, `acos(NaN) = NaN`, both threshold comparisons
   are false, and the ramp falls through as `NaN` — which reaches the uniform and
   renders the spacecraft as garbage. This is a hard bug, not a nit.
2. **`hostSkyFraction(r, 0)` returns 0.5**, not 0: the guard `dist >
hostRadiusM` is false at zero distance, so `s = 1` and the body sees half its
   own sky filled by itself. It happens to multiply to zero today only because
   `ATMOSPHERE_PARAMS['voyager1']` is absent and `hostShineColor` is `[0,0,0]` —
   ruling 4's "falls out of `hostSkyFraction`" does **not** hold as stated;
   verified, and corrected here.

Both are one predicate, and it is essential rather than accidental — a body with
no host genuinely has no eclipse geometry and no reflected fill. `meshBodiesPass`
computes `const hosted = body.id !== hostId;` and feeds `sunVisibleFraction: hosted
? sunVisibleFraction({…}) : 1` and `hostShineStrength: hosted ? … : 0`
(ruling 19). No new file: `passFilePurity.test.ts` keeps the pass file declaring
only the pass, and this is two ternaries inside `draw`.

**The rovers' terminator, by contrast, already works and needs nothing.** With
the body at `r = hostRadiusM`, `angularRadiusAndDirection` clamps to `asin(1) =
π/2`, so `sunVisibleFraction` is 1 when the Sun is more than π/2 from the
planet-centre direction (day), 0 when it is less (night), and ramps linearly
across a band of ±(the Sun's angular radius at Mars, 4.43 mrad) — a sunrise
lasting about two minutes of Mars time. That is the correct physics, arrived at
without a special case. Likewise `hostSkyFraction(R, R) = 0.5`: a rover on the
ground sees exactly half its sky filled by Mars, and takes Mars-shine from
`ATMOSPHERE_PARAMS['mars'].groundAlbedo`.

**Sun irradiance stays constant** (ruling 4). Voyager 1 receives 1/171.7² ≈ 3.4e-5
of Earth's insolation; a physically-lit probe at that distance is a black object
nobody can see, and the textured planets are drawn without the 1/d² term too, so
adding it here alone would make the scene _less_ internally consistent, not more.

## Precision

`cam.position` and `BodyState.positionMpc` are f64 Mpc throughout, and every
metre-scale quantity is derived by **cancelling in Mpc first, then scaling**
(`bodyRelativePose`, `bodyStateInHostFrame`). The relevant conversions:

```
1 au = 4.848136811095368e-12 Mpc        1 m = 3.240779289444365e-23 Mpc
```

At Voyager 1's 171.7 au = 8.33e-10 Mpc the f64 ulp is 1.85e-25 Mpc ≈ **5.7 mm**;
at Voyager 2's 143.9 au ≈ **4.8 mm**. Against a spacecraft ~10 m across that is
three orders of magnitude below the smallest visible feature, and because the
subtraction happens in Mpc before the metre scale, the residual is the ulp of the
_difference_, not of the heliocentric magnitude. The camera focus distance
(`bodyLikeFraming`, unclamped) and the zoom floor (`pivotFraming`,
`radiusMpc × standoffRadii`) both land at ~1e-22 Mpc, well above
`MIN_DISTANCE_MPC` (1e-24 Mpc ≈ 3 cm), so neither clamps.

**Accepted, per ruling 8:** a rover's pivot floor is 2 × its bounding radius
(~3–5 m). Because the rover sits _on_ Mars, orbiting it at that distance puts the
eye below the Martian surface for part of the sweep. The alternative — a
per-body standoff that knows about the host's surface — is a camera feature, not
a body feature, and is not built here.

## Ground preparation

The feature's ideal diff is **data**: four asset directories, four `MESH_SOURCES`
rows, four regenerated `MESH_ASSETS` rows, six `SCENE_MESH_BODIES` seeds, two
`ORBITAL_ELEMENTS` rows, four `SURFACE_FIXED_SITES` rows, six `ROTATION_ELEMENTS`
rows, six fact-seed rows, four `ATTRIBUTIONS.md` entries. Everything that is
_not_ data is a joint that does not exist yet or a joint that exists and is
wired to the wrong thing. Verdicts per touchpoint:

| touchpoint                                                                                                                      | verdict                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Kepler solve + anomaly→position for `e > 1`                                                                                     | **growth** — sibling solver, one dispatch in `keplerianPositionMpc`; the shared perifocal derivation extracts (P1) |
| `deriveOrbitConics` walking `ORBITAL_ELEMENTS`                                                                                  | **wired to the wrong table** — `TRAIL_ELEMENTS` already answers the question (P2)                                  |
| `deriveBodyStates` single interleaved loop                                                                                      | **growth** — phase split, positions then orientations (P3)                                                         |
| position drivers                                                                                                                | **growth** — union derived from the three authored tables                                                          |
| rotation kinds                                                                                                                  | **growth** — optional discriminant, existing rows untouched                                                        |
| "which slab row does this mesh body draw in"                                                                                    | **growth** — `meshBodySlabHostId` replaces a lookup that throws                                                    |
| `slabBodyCandidates` / `BODY_SLAB_CAPACITY`                                                                                     | **growth** — both already compose from tables; append one more                                                     |
| self-hosted lighting                                                                                                            | **essential branch** — one predicate, two terms, inside `draw`                                                     |
| `.mesh` format, renderer, shaders, fetcher, slot registry, partition, occluders, pick, search, captions, InfoCard, framing, URL | **no change**                                                                                                      |

**Prep refactors** — three, each its own commit, sequenced first. Per ruling 9
they **ride this PR** (the user's standing choice for this effort).

- **P1 — extract `perifocalAxesWorld`.** `keplerianEllipse.ts:70-100` computes
  `P̂w`/`Q̂w` (the `Rz(Ω)·Rx(i)·Rz(ω)` columns mapped through the row's reference
  plane) inline, with a private `frameToWorld`. The hyperbolic position needs
  the identical pair. Extract to `src/utils/orbit/perifocalAxesWorld.ts` (one
  symbol per file); `keplerianEllipse` imports it. Behavioural no-op — its
  existing tests staying green is the test.
- **P2 — `deriveOrbitConics` defaults to `TRAIL_ELEMENTS`.** One table decides
  which rows carry a drawn conic; `orbitTrailsPass` already reads it, and
  `SCENE_ORBIT_CONICS` reading a different one is how a hyperbola reaches
  `keplerianEllipse`. Observable change: the whale's and the petunias' rows
  leave `SCENE_ORBIT_CONICS` (they already draw no trail), so this is the
  cheapest possible moment to make it.
- **P3 — phase-split `deriveBodyStates`.** Positions first (anchors, then
  `FOCUS_ORDER`), orientations second, over the finished map;
  `orientationForBody` gains a `positions` parameter its only arm ignores.
  Behavioural no-op: same values, same memoisation, same one-deep cache.

## Testing

Only tests that can fail on a real bug, per
[`testing.md`](../conventions/testing.md).

- **`hyperbolicAnomalyFromMean`** — round-trip: for `H` in `{−3, 0.5, 3.4}` and
  `e` in `{1.5, 3.7, 6.28}`, `hyperbolicAnomalyFromMean(e·sinh H − H, e) ≈ H`.
  A round-trip against the _forward_ equation, not against the solver's own
  iteration, so a wrong formula fails it.
- **The two Voyager rows against JPL.** `propagateElements(row, 2461294.5)`
  reproduces the published `MA` (2916.322928412766° / 1936.730865756128°) to
  1e-9 deg, and `|keplerianPositionMpc(propagated)|` reproduces 171.722 au /
  143.912 au to 1e-4 au. Both expectations are external data, independently
  computed, not the source's own arithmetic.
- **The hyperbolic branch is selected by eccentricity**, through the real
  `deriveBodyStates`: `voyager1`'s derived position is finite and > 100 au.
  (`keplerianEllipse`'s `NaN` is what this guards.)
- **`surfacePointBodyFixed`** — hand-computed: (0°, 0°) → `[r, 0, 0]`;
  (0°, 90°E) → `[0, r, 0]`; (90°, anything) → `[0, 0, r]`.
- **A rover turns with Mars.** Through the real `deriveBodyStates`: the angle
  between `curiosity`'s heliocentric offset from Mars at `t` and at
  `t + 1 sidereal Martian day` is under 0.05°, and at `t + ¼ day` it is within
  0.05° of 90°. Fails if the site is anchored in the wrong frame, if longitude
  runs west, or if the host's spin is dropped.
- **A rover stands on the surface.** `|curiosityPos − marsPos|` equals
  `marsRadiusM + altitudeM` to 1e-6 m, through the real derive.
- **`rotationLookAt`** — the resulting `Mat3`'s first column equals the unit
  vector body→target (hand-constructed fixture), and the matrix is orthonormal
  with determinant +1. Orthonormality is the property that catches a botched
  Gram-Schmidt.
- **`rotationSurfaceLocked`** — with a host pole on +Z and a body on the host's
  equator, `headingDeg = 0` puts the body's +X on world +Z (north) and its +Z on
  the radial; `headingDeg = 90` puts +X on east. Hand-computed, and the
  determinant is +1.
- **`meshBodySlabHostId`** — a mesh body whose driver host owns a slab row
  returns that host; one whose host does not returns its own id. The two-line
  behaviour the whole slab widening rests on.
- **`SURFACE_FIXED_SITES` altitudes track the bake** — each row's `altitudeM`
  equals its asset's `groundOffsetM`. An invariant between two independently
  edited files, so it is not a restatement.
- **Every `SCENE_BODIES` id resolves a `BodyState`** — the existing test, which
  now also covers the four surface-fixed rows and guards
  `extractSelectionRow.ts:56`'s non-null assertion.
- **Bake: `groundOffsetM`** — over the tool's own synthetic GLB fixture, a cube
  spanning z ∈ [−1, 1] about its centroid reports 1.
- **No renderer, shader or asset-content tests.** The visual pass covers them.

## Perf

The six add at most **two** slab rows (the Voyagers, and only within
`SUB_PIXEL_BODY_CULL_PX` of one — beyond a few thousand km each is sub-pixel and
never gets a row) and at most one mesh draw per row. The rovers add nothing
Mars's row was not already paying for. `BODY_SLAB_CAPACITY` 25 → 27 widens two
compile-time GPU-timing slot pools by two entries each.

Run `npm run perf` before and after, per the `perf` skill, passing `--url` for
_this worktree's_ dev-server port. A neutral-or-negative measurement **halts** the
landing pipeline; land or park is the user's ruling, not process momentum.

## Rulings

The brief's eleven, restated so this file stands alone, plus those made here.

1. **Position drivers become a tagged union** dispatched by `deriveBodyStates`:
   `orbit`, `anchor`, `surfaceFixed`; the hyperbolic case is a branch of `orbit`
   chosen by `e > 1`, with its own solver and its own anomaly→position step.
2. **Rotation becomes a tagged union**: `iau-pole` (today's rows untouched),
   `lookAt { targetId }` with a stated roll convention, `surfaceLocked` with an
   authored heading.
3. **Slab rows.** A rover rides Mars's `body-m` row as the whale rides Earth's. A
   Voyager has no host row to ride and gets its own, drawn at `posM = 0`.
   `BODY_SLAB_CAPACITY` rises only as far as the arithmetic requires.
4. **Sun irradiance stays the constant the shader carries** — no 1/d². Host fill
   is 0 for a hostless body.
5. **Captions keep the default reach** (`SOLAR_SYSTEM_REACH`); no `captionRevealM`
   on any of the six. They are real objects, not easter eggs.
6. **No orbit trails** for the six; a hyperbolic trail renderer is out of scope.
7. **Facts**: `planet_facts.seed.json` rows with `wikiTitle` and a two-sentence
   factual description each, no marketing voice.
8. **Camera**: focus/standoff/floor use the existing `MeshBody` fields; a rover's
   2-radii pivot may put the eye below the Martian surface — accepted.
9. **Ground preparation** is filled in above; prep refactors are their own plan
   tasks, sequenced first, and ride this PR.
10. **PR**: branch `worktree-voyager-rovers`, based on
    `worktree-whale-petunias-mesh-bodies` (PR #678); retargeted to `main` once
    #678 lands.
11. **Pass files declare only the pass.** Every helper or constant a task adds
    goes in its own file with a focused test; `passFilePurity.test.ts` enforces it.

Made here:

12. **The hyperbolic dispatch lives in `keplerianPositionMpc`, not
    `propagateElements`** — the affine advance is already conic-agnostic (`M`
    advances linearly for any conic and these rows carry no other rates), so a
    branch there would be a no-op branch. A recorded departure from ruling 1's
    parenthetical.
13. **The Voyager rows are authored from `Tp`**, not from the published `MA` at
    the 2026 epoch: `M(t) = n·(t − Tp)` is exact, so `meanAnomalyRad` at J2000 is
    `degToRad(N·(J2000 − Tp))`. The published `MA` becomes an independent test
    fixture instead of an input — one number can't be both.
14. **A `probe` maker** (`makers/probe.ts`) converts a Horizons ELEMENTS column
    set into an `OrbitalElements` row, the way `satellite` converts a JPL
    satellite row. Two rows with an identical column set and a shared epoch
    conversion is exactly the maker's brief.
15. **The rotation discriminant is optional on the `iau-pole` arm**, so the 21
    existing rows are untouched (ruling 2's "untouched", taken literally). The
    `switch (row.kind)` with `case undefined:` narrows correctly and stays
    exhaustive.
16. **`surfaceLocked` derives its ENU triad from the derived positions and the
    host's pole**, not from a second copy of the site's lat/lon. Two tables
    carrying the same coordinates is a drift the type system cannot catch.
17. **Body-frame conventions.** Look-at: **+X boresight**, **+Z reference up**
    (aimed at the ecliptic north pole). Surface-locked: **+Z up**, **+X forward**
    (the heading direction). `MESH_SOURCES`' `bodyFromSource` maps each download
    into its frame, confirmed by the visual pass.
18. **A hostless mesh body is its own slab host.** Expressed as one function
    (`meshBodySlabHostId`), so every downstream join — the attachment map, the
    candidate roster, the pass's host lookup — stays single-branch.
19. **`meshBodiesPass` skips both the eclipse term and the host fill when
    `body.id === hostId`.** `sunVisibleFraction` returns `NaN` at zero host
    separation and `hostSkyFraction` returns 0.5, not 0; ruling 4's stated
    mechanism does not hold and this is the correction.
20. **Spirit and Opportunity share `meshKey: 'mer'` but get separate asset slots
    and separate GPU copies.** The slot family is keyed by body id and the
    renderer by body id. Accepted: the two sites are ~10 600 km apart against a
    ~150 km load radius, so they are never co-resident, and the HTTP cache dedupes
    the fetch. Keying the renderer by mesh key instead is a change to shipped
    machinery for no observable win.
21. **No new `Source` registry row.** The six ride `Source.MeshBody`, so the
    Labels & Guides "Mesh body" checkbox mutes all eight together. Only that
    row's docblock changes, to stop naming the whale and the petunias as if they
    were the category.
22. **`altitudeM` is measured from Mars's mean 3390 km sphere**; site elevations
    relative to the areoid are not modelled.
23. **Landing sites, stated as such.** The four coordinates are where each rover
    touched down, not where it stopped. Each fact-sheet description says so.
24. **Two sidereal frames stay separate.** The rover's spin comes from the
    `mars` `ROTATION_ELEMENTS` row's `Ẇ`; nothing re-derives it from the orbital
    period. (`charon`'s row documents the one place in this codebase where the
    two are deliberately the same quantity.)
25. **`BODY_SLAB_CAPACITY` is derived, not typed.** `+ HOSTLESS_MESH_BODIES.length`
    → 27 today, and a third self-hosting mesh body widens it with no edit.
26. **The six take the shared `MESH_BODY_STANDOFF_RADII` of 2** from the
    `meshBody` maker and carry no `captionRevealM` (ruling 5).
27. **The `.mesh` format does not change.** No version bump, no new payload
    block; `groundOffsetM` is a generated-table number, computed from geometry
    the file already carries.
28. **Four `MESH_ASSETS` keys for six bodies**: `voyager`, `curiosity`,
    `perseverance`, `mer`.
29. **`groundOffsetM` is generated, and the site rows read it.** A rover's
    altitude is a consequence of where the bake put the origin, so it is derived
    from `MESH_ASSETS` at the seed site rather than eyeballed — the same posture
    `radiusM` and `albedo` already have in the `meshBody` maker.
30. **The visual pass is the acceptance gate for every orientation.** The roll
    conventions, the four headings and the three `bodyFromSource` matrices have no
    honest unit test: a matrix can be orthonormal, determinant +1, and still have
    the rover on its side.

## Out of scope

- A hyperbolic **trail** (the conic renderer draws ellipses).
- Live rover positions, traverse paths, or landing-site terrain.
- Inverse-square sunlight, for any body.
- A camera standoff that knows a body sits on a host's surface (ruling 8's
  accepted consequence).
- Deployed-instrument articulation, animated booms, RTG emissive.
- Keying the mesh renderer by mesh key rather than body id (ruling 20).
- Any other spacecraft: New Horizons, the Pioneers, Cassini's debris. The
  machinery this lands makes each of them a data append.

## Definition of done

- Tests green, `npm run typecheck` green.
- Each baked asset's `.mesh` + three PNGs under 10 MB on disk, reported.
- Provenance recorded per asset (`data/raw/meshes/<key>/README.md`, the
  `meshes.*` `RAW_DATA` rows, the sha256 sidecar) and in `ATTRIBUTIONS.md`.
- The three consumed backlog items deleted — index lines **and** detail files.
- `npm run perf` before and after, reported.
- Visual pass attested by the user, per the plan's final task.
- R2 sync of `public/data/meshes/` noted as a deploy step (already in
  `docs/DEPLOY.md`; confirm the four new keys are covered).
- Memory updated.
