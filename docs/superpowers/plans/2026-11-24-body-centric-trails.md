# Body-centric trails: plan

> **Spec.** [`2026-11-24-body-centric-trails-design.md`](../specs/2026-11-24-body-centric-trails-design.md).
> **Branch.** `feat/body-centric-trails`; the prep commit f6e00887a is already in.
> **Execution.** Lean SDD per `sdd-execution.md`. Ledger: `.superpowers/sdd/2026-11-24-body-centric-trails/progress.md`.

## Goal

While a sampled craft is within a planet's reach, that stretch of its trail is drawn around the
planet and rides along with it. Outside every planet's reach the trail is the Sun trail it is today.

## What exists (read before any task)

- `src/layers/missions/trails/@types/MissionTrailGeometry.d.ts`: one piece of trail, vertices in
  f64 Mpc relative to `centreId`, with vertex times `tDays` (UT Julian date).
- `src/layers/missions/trails/render/buildMissionTrails.ts`: builds one Sun piece per craft.
- `src/@types/scene/SampledTrack.d.ts`: `tDays`, `posKm` (Sun-centred, f64), `velKmS` (f32).
- `src/utils/orbit/hermiteTrackAt.ts`, `src/layers/missions/missionCamera/utils/hermiteTrackVelAt.ts`,
  `src/utils/orbit/bodyVelocityKmS.ts`, `src/utils/exhibits/mission/bodyPositionMpcAt.ts`.
- Conventions: one function per `utils/` file, one type per `@types/` file, filename = symbol,
  `type` aliases only, comments explain why and stay within budget (`docs/superpowers/conventions/comments.md`).

## Task 1: planet and Sun masses

**Files:** `src/data/bodies/planetMassKg.ts` (new), `src/data/bodies/sunMassKg.ts` (new)

```ts
export const PLANET_MASS_KG: Readonly<Record<string, number>>; // keyed by scene body id
export const SUN_MASS_KG = 1.9885e30;
```

Values, NASA planetary fact sheets (cite the URL `https://nssdc.gsfc.nasa.gov/planetary/factsheet/`
in the file), in kg: mercury 3.3010e23, venus 4.8673e24, earth 5.9722e24, mars 6.4169e23,
jupiter 1.89813e27, saturn 5.6832e26, uranus 8.6811e25, neptune 1.02409e26. The keys must be the
ids these planets carry in `ORBITAL_ELEMENTS`. No test: constants.

## Task 2: `hillRadiusKm`

**Files:** `src/utils/orbit/hillRadiusKm.ts` (new), `tests/utils/orbit/hillRadiusKm.test.ts` (new)

```ts
export function hillRadiusKm(semiMajorKm: number, massKg: number): number; // a · ∛(m / 3·SUN_MASS_KG)
```

Test: Jupiter (a = 778.479e6 km) gives 53.1e6 km and Earth (a = 149.598e6 km) gives 1.50e6 km, each
within 1%.

## Task 3: the trail centres

**Files:** `src/layers/missions/trails/@types/TrailCentre.d.ts` (new),
`src/layers/missions/trails/data/trailCentres.ts` (new),
`src/layers/missions/trails/data/missionTrailStyle.ts`,
`tests/layers/missions/trails/data/trailCentres.test.ts` (new)

```ts
export type TrailCentre = { readonly id: SceneBodyId; readonly reachKm: number };
export const TRAIL_CENTRES: readonly TrailCentre[];
export const TRAIL_REACH_HILL_RADII = 1.5; // in missionTrailStyle.ts
```

`TRAIL_CENTRES` is derived, never listed by hand: every `ORBITAL_ELEMENTS` row whose `focusId` is
`'sun'` and whose id has a `PLANET_MASS_KG` entry, with
`reachKm = TRAIL_REACH_HILL_RADII × hillRadiusKm(semiMajorMpc / SCALE_UNITS.KM_TO_MPC, mass)`.
The comment on the factor says why it is not 1: asteroid 2026 QQ8 stays bound to Earth out to 1.58
million km, past the 1.5 million km Hill radius.

Test: the list holds `jupiter` and `earth`, holds neither `moon` nor `sun`, and Jupiter's reach is
between 75e6 and 85e6 km.

## Task 4: `trailStaysOf`

**Files:** `src/layers/missions/trails/@types/TrailStay.d.ts` (new),
`src/layers/missions/trails/utils/trailStaysOf.ts` (new),
`tests/layers/missions/trails/utils/trailStaysOf.test.ts` (new)

```ts
export type TrailStay = { readonly centreId: SceneBodyId; readonly t0Days: number; readonly t1Days: number };

export function trailStaysOf(
  track: SampledTrack,
  centres: readonly TrailCentre[],
  positionAt: (id: string, simDays: number) => Readonly<Vec3>, // world Mpc
): TrailStay[];
```

A stay is a maximal time interval in which the craft is within `reachKm` of the centre. The craft's
world position at `t` is the Sun's `positionAt('sun', t)` plus `hermiteTrackAt(track, t)` in Mpc.
Entry and exit are found to within 0.001 day of the crossing. A stay already under way at the first
sample opens there; one still under way at the last sample closes there. Stays come back in time
order. A pass shorter than the scan step may be missed: say so in the header comment.

Budget: both Voyager tracks against all eight centres in under 50 ms total. Measure it once (a
throwaway `console.time` in the dev server, removed again) and put the number in your reply. If it
is over, stop and report instead of optimising blind.

Tests, with a synthetic straight-line track and a `positionAt` stub:

- one fixed body beside the path gives one stay, and at both `t0Days` and `t1Days` the distance to
  the body equals `reachKm` within 0.1%;
- a body farther from the path than its reach gives no stay;
- two bodies along the path give two stays in time order;
- a track that starts inside a body's reach gives a stay with `t0Days` equal to the first sample time.

## Task 5: `nearTrailPiece`

**Files:** `src/layers/missions/trails/render/nearTrailPiece.ts` (new),
`tests/layers/missions/trails/render/nearTrailPiece.test.ts` (new)

```ts
export function nearTrailPiece(
  id: string,
  track: SampledTrack,
  stay: TrailStay,
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): MissionTrailGeometry; // centreId = stay.centreId; tDays[0] = stay.t0Days; last tDays = stay.t1Days
```

Build a relative `SampledTrack` over the stay: the track's samples inside it plus an interpolated
sample at each end (`hermiteTrackAt` / `hermiteTrackVelAt`), each minus the centre's Sun-relative
position (km) and velocity (`bodyVelocityKmS`) at that sample's time. Tessellate that with the
existing `tessellateTrack(…, MISSION_TRAIL_MAX_SAG_KM)`, then `trackKmToMpc`. Tessellating in the
Sun's frame and subtracting afterwards is wrong: it leaves the planet's orbital curvature, hundreds
of km of sag per step, in the line.

Test: a body moving on a curved path and a craft that keeps a fixed 1e6 km offset from it give a
piece whose every vertex is that offset within 1 km, and whose first and last `tDays` are the stay's.

## Task 6: `CraftTrail` and `trailDrawsAt`

**Files:** `src/layers/missions/trails/@types/CraftTrail.d.ts` (new),
`src/layers/missions/trails/@types/TrailDraw.d.ts` (new),
`src/layers/missions/trails/utils/trailDrawsAt.ts` (new),
`src/layers/missions/trails/render/buildMissionTrails.ts`,
`src/layers/missions/trails/render/missionTrailRenderer.ts`,
`src/layers/missions/trails/@types/MissionTrailRenderer.d.ts`,
`tests/layers/missions/trails/utils/trailDrawsAt.test.ts` (new)

```ts
export type CraftTrail = {
  readonly id: string;
  readonly whole: MissionTrailGeometry; // the full track about the Sun
  readonly near: readonly MissionTrailGeometry[]; // one per stay, in time order
};
export type TrailDraw = {
  readonly piece: MissionTrailGeometry;
  readonly segmentCount: number;
  readonly head: boolean; // end on the craft's live position
};
export function trailDrawsAt(trail: CraftTrail, simDays: number): TrailDraw[];
export function buildMissionTrails(): CraftTrail[];
```

`trailDrawsAt`, with `k = countAtOrBefore(piece.tDays, t)`:

- `t` before `whole.tDays[0]`: no draws.
- `t` inside a `near` piece (`tDays[0] <= t < last tDays`): `whole` up to the entry instant with
  `head: false`, then that `near` piece up to `t` with `head: true`. Omit a draw with no segments
  and no head.
- otherwise: `whole` up to `t`, `head: true` unless `t` is past its last vertex.

`buildMissionTrails` passes `bodyPositionMpcAt` as `positionAt` and `TRAIL_CENTRES` as the centres.
In this task the renderer only has to keep compiling and drawing `whole` as today (read
`trail.whole` where it read the geometry); Task 7 makes it draw pieces.

Tests for `trailDrawsAt`, on hand-built pieces: before the track gives `[]`; cruise gives one draw
with a head; inside a stay gives two draws, the first cut at the entry vertex without a head and the
second with one; at the stay's exit instant it is one draw again; past the track's end the single
draw has no head.

## Task 7: the renderer and the pass draw pieces

**review: yes** (GPU draw path; CI cannot see it)

**Files:** `src/layers/missions/trails/@types/MissionTrailRenderer.d.ts`,
`src/layers/missions/trails/render/missionTrailRenderer.ts`,
`src/layers/missions/trails/passes/missionTrailsPass.ts`

```ts
ensureTracks(version: number): ReadonlyMap<string, CraftTrail>;
drawTrail(
  pass: GPURenderPassEncoder,
  piece: MissionTrailGeometry, // was: id
  color: Readonly<Vec3>,
  opacity: number,
  segmentCount: number,
  centreMpc: Readonly<Vec3>,
  headMpc: Readonly<Vec3> | null,
): void;
```

Every piece of every craft is uploaded into the one vertex buffer; the first-vertex lookup is keyed
by the piece, not the craft id. The pass calls `trailDrawsAt` per craft and one `drawTrail` per
draw, with `centreMpc` the position of `piece.centreId` and `headMpc` the craft's position when
`head` is set. Uniform layout, shaders and `MAX_TRAILS` do not change; do not touch the `.wesl`
files. No new test: the rule is `trailDrawsAt`'s, already tested. Update the header comments of the
three files to say what they now do, within the comment budget.

## Task 8: docs (controller, inline)

**Files:** `docs/RENDERER.md`

One bullet for mission trails: pieces are centre-relative, the eye is handed over relative to the
centre, and a stay near a planet draws in that planet's frame.

## Definition of Done

- New symbols exist: `PLANET_MASS_KG`, `SUN_MASS_KG`, `hillRadiusKm`, `TRAIL_CENTRES`,
  `trailStaysOf`, `nearTrailPiece`, `CraftTrail`, `TrailDraw`, `trailDrawsAt`.
- `#focus=body-jupiter&t=1979-03-05T18:00:00Z&layers=missionTrails`: Voyager 1's trail curves around Jupiter.
- `#focus=body-voyager1&t=1979-03-05T06:00:00Z&layers=missionTrails`: the trail ends on the craft.
- `#focus=body-neptune&t=1989-08-25T06:00:00Z&layers=missionTrails`: Voyager 2 swings over Neptune's pole.
- `#focus=body-voyager1&t=1985-01-01T00:00:00Z&layers=missionTrails`: cruise, one continuous Sun trail.
- `#focus=body-earth&t=1977-09-07T00:00:00Z&layers=missionTrails`: the departure from Earth.
- `#exhibit=voyager-missions`: playing through the Jupiter flyby and its exit shows no trail jump
  the owner objects to (the hard cut at exit is the spec's named risk).
- Out of scope: asteroid 2026 QQ8, the track build beyond Voyager, a Sun-fixed view, a fade at the
  exit switch.
