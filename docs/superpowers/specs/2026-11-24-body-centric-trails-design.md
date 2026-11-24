# Body-centric trails: design spec

> **Status.** Draft, 2026-11-24. Owner: Alexander Rulkens. The owner ruled the four shape questions
> the same day (§2). **Written against** `feat/body-centric-trails` at f6e00887a, which already
> holds the prep commit (§5).
> **Scope.** Trails and the Voyager flybys. The asteroid 2026 QQ8 is the next PR (§8).

## 1. Why

A sampled craft's trail is drawn in the Sun's frame. Near a planet that hides what happened: Jupiter
moves 13 km/s along its orbit, so a Voyager's swing-by reads as a faint bend in a long line, not as
the hyperbola around the planet that it was. The same holds for anything bound to a planet: asteroid
2026 QQ8's seven months around Earth are a line hugging Earth's orbit in the Sun's frame.

While a craft is near a planet, that stretch of its trail should be drawn around the planet and ride
along with it.

## 2. Decisions (owner rulings, 2026-11-24)

1. **The centre is worked out when the trail is built**, not stored in `spacecraftTracks.bin`. The
   track stays Sun-centred; craft positions, the launch join and the mission camera do not change.
   Rejected: a centre per time span in the file (format v2, a re-bake, 22 sites).
2. **A stretch switches to a planet's frame by distance**: while the craft is within the planet's
   reach, 1.5 × its Hill radius. The factor is there because 2026 QQ8 stays bound out to 1.58
   million km, past Earth's 1.5 million km Hill radius. The Hill radius is calculated from the
   planet's mass, so **the fact sheet's mass becomes a number**.
3. **One trail shows at a time, and the planet frame is the Voyager exhibit's alone** (owner,
   2026-11-24, after the eye check; replaces "the Sun trail ends at the entry instant"). A setting,
   `missionTrails.nearPlanets`, off by default, asks for it and only the Voyager exhibit sets it:
   with trails on in normal mode a craft's trail is its Sun-centred orbit and nothing else. With
   the setting on, a craft inside a planet's reach is drawn by that planet's piece alone, and the
   Sun trail is not drawn. The piece fades to nothing toward where the craft entered, as its
   start hangs loose at the reach boundary.
4. **After leaving, the trail is the Sun trail again.** Nothing stays behind at the planet. The
   two pictures cross-fade over 15% of the stay's length at each end: the planet piece fades in
   after the entry while the whole Sun trail fades out, and the reverse after the exit.
5. **The trail starts on the launch pad** (owner, 2026-11-24): the craft's invented climb is put in
   front of the track when the trail is built. The data file does not change. The invented climb
   now rises to parking height (about 170 km) in its first ten minutes (owner, 2026-11-24), so the
   trail from the pad shows instead of lying hidden on the ground; the craft itself moves that way
   too.

## 3. Shape

A craft's trail is its whole track about the Sun plus one piece per stay near a planet. The prep's
`MissionTrailGeometry` (`centreId`, centre-relative vertices) is the piece; nothing in it changes.

```ts
// src/layers/missions/trails/@types/CraftTrail.d.ts
export type CraftTrail = {
  readonly id: string; // the craft
  readonly whole: MissionTrailGeometry; // the full track, centre 'sun'
  readonly near: readonly NearTrail[]; // one per stay: { piece, leaveDays }; the piece runs past the exit for the fade
};

// src/layers/missions/trails/@types/TrailDraw.d.ts — one drawTrail call, decided without a GPU
export type TrailDraw = {
  readonly piece: MissionTrailGeometry;
  readonly segmentCount: number;
  readonly head: boolean; // end on the craft's live position
  readonly weight: number; // opacity factor: the Sun trail and a planet's piece cross-fade where they swap
  readonly fadeVertex: number; // a planet's piece fades to nothing toward its first vertex; -1 = none
  readonly fadeMaxMpc: number;
};

// src/layers/missions/@types/MissionTrailsSettings.d.ts
export type MissionTrailsSettings = {
  enabled: boolean;
  nearPlanets: boolean; // draw a stretch near a planet about that planet; the Voyager exhibit only
};

// src/layers/missions/trails/utils/trailDrawsAt.ts — at most two draws, two only during a cross-fade
export function trailDrawsAt(trail: CraftTrail, simDays: number, nearPlanets: boolean): TrailDraw[];

// src/layers/missions/trails/utils/trailStaysOf.ts — entry and exit instants per planet
export function trailStaysOf(
  track: SampledTrack,
  centres: readonly TrailCentre[], // { id: SceneBodyId; reachKm: number }
  positionAt: (id: string, simDays: number) => Readonly<Vec3>,
): TrailStay[]; // { centreId; t0Days; t1Days }

// src/utils/orbit/hillRadiusKm.ts
export function hillRadiusKm(semiMajorKm: number, massKg: number): number; // a · ∛(m / 3M☉)
```

- **`trailDrawsAt`** is the whole per-frame rule. With `nearPlanets` off, or outside every stay:
  `whole` up to now, with a head. Inside a stay: that `near` piece up to now with a head, and
  during the cross-fade at either end `whole` up to now as well, the two weights summing to 1.
- **Centres** are every body that orbits the Sun and has a fact-sheet mass (the planets, Pluto,
  Ceres, Vesta, Bennu): a derived list, not a hand-written one. Moons are not centres, so Voyager 1's Titan pass sits inside Saturn's piece.
- **A `near` piece is tessellated in the planet's frame.** The track's samples over the stay, minus
  the planet's position and velocity (`bodyVelocityKmS`) at each sample time, form a relative
  `SampledTrack` that goes through the existing `tessellateTrack`. Tessellating in the Sun's frame
  and subtracting afterwards would leave the planet's own orbital curvature (hundreds of km of sag
  per step) in the line.
- **Masses** (owner ruling 2026-11-24). The fact sheet holds the number: `planet_facts.seed.json`
  carries `massKg` where it carried a `mass` display string, through `build-planet-facts` into
  `BodyFacts.massKg`. The card's text is derived by `formatBodyMass` (Earth masses for a
  Sun-orbiting body from Pluto's size up, kilograms for moons and small bodies), so the reach and
  the card read one value. The Sun's mass is one constant, `SUN_MASS_KG`.
- **Renderer.** `ensureTracks` returns `ReadonlyMap<string, CraftTrail>` and `drawTrail` takes the
  piece instead of the craft id. Two crafts draw at most four pieces a frame; `MAX_TRAILS` is 8.
- **Launch.** Earth is a centre too, so a Voyager's first two days after its first sample are an
  Earth piece. That is correct (it is leaving Earth), and it is in the smoke list.

## 4. Tests

- `trailDrawsAt`: with `nearPlanets` off, one Sun draw even inside a stay; on, outside a stay one
  Sun draw, mid-stay the `near` piece alone, during the entry rise and the exit fall both with
  weights summing to 1; a stay that opens the track is the `near` piece alone from the start.
- `trailStaysOf`: a straight synthetic track past a fixed body gives one stay whose entry and exit
  sit on the reach; a track that stays outside gives none; two bodies give two stays in time order.
- `hillRadiusKm`: Jupiter and Earth against published values (53.1 and 1.50 million km) within 1%.
- The `near` piece builder: a craft that keeps a fixed offset from a moving body yields vertices at
  that offset, whatever the body's path.

## 5. Ground preparation

Done, commit f6e00887a: a trail names its centre body. Trail vertices were absolute world positions
built once about the Sun, with the Sun threaded pass → renderer → build. They are now relative to
`centreId`, and the centre's position joins per frame at draw. Shader and uniform layout unchanged;
owner's eye check passed 2026-11-24. With that joint in place this feature is growth: two new types,
three new utils, a list where the build pushed one piece. The one contract edit left is the
renderer's (§3), which the prep could not make without the list existing.

## 6. Risks

- **The swap.** The Sun trail and the planet piece are different pictures of the same stretch, up
  to about 50 million km apart at Jupiter. The eye check failed a hard switch, so they cross-fade
  at the entry and at the exit (§2.3, §2.4); during a cross-fade both lines show, dimmed.
- **Planet positions.** The planet-frame shape is the track minus skymap's own planet position. The
  Voyager tracks are already blended onto DE441 near each encounter for that reason; the closest
  approach distances in `MISSION_EVENTS` are the check.

## 7. Smoke list (DoD)

- `#exhibit=voyager-missions&t=1979-03-05T18:00:00Z`: Voyager 1's trail is the piece around
  Jupiter alone, fading toward where it entered; no Sun trail for it.
- `#exhibit=voyager-missions&t=1989-08-25T06:00:00Z`, Voyager 2 tab: it swings over Neptune's pole.
- `#exhibit=voyager-missions`: the departure from Earth, then play through the Jupiter flyby and
  both cross-fades.
- `#focus=body-jupiter&t=1979-03-05T18:00:00Z&layers=missionTrails`: normal mode, Sun trails only.
- `#focus=body-voyager1&t=1979-03-05T06:00:00Z&layers=missionTrails`: the trail still ends on the craft.
- `#focus=body-voyager1&t=1985-01-01T00:00:00Z&layers=missionTrails`: cruise, one continuous Sun trail.
- No perf gate (owner ruling 2026-11-24): the standard poses draw no mission trails. The trail
  build has its own 50 ms budget, measured in the plan's Task 4.

## 8. Out of scope

- **Faster craft.** `trailStaysOf` steps on a 100 km/s closing-speed bound (the Voyagers peak at
  68 km/s, against Mercury). A craft that can exceed it, such as Parker Solar Probe, needs the bound
  raised or derived from the track before its row is added.
- **2026 QQ8.** Next PR: optional launch fields on `SampledBody`, `buildSpacecraftTracks` opened
  beyond Voyager, a marker for a body too small to draw.
- **Backlog.** "Craft around other planets and at Lagrange points" stays; the QQ8 PR narrows it to
  the craft rows once the track build is general.
- A view that holds the Sun's direction still (the frame in which QQ8's path closes into a loop).
