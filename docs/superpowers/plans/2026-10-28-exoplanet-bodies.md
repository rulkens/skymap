# Exoplanets as scene bodies (TRAPPIST-1 pilot): plan

Spec: [`specs/2026-10-28-exoplanet-bodies-design.md`](../specs/2026-10-28-exoplanet-bodies-design.md).
Branch: `ccr-c8fb8b4c-la32w5` (the prototype branch). Packaging is asked at the checkpoint.

## Task 1: Light from the body's root anchor (G1) `review: yes`

**Files:**
- New: `src/utils/scene/rootBodyIdOf.ts`, `src/utils/scene/lightSourceMpc.ts`,
  `tests/utils/scene/lightSourceMpc.test.ts`.
- Modified: `src/data/bodies/bodyRegions.ts`, `src/utils/camera/sunDirLocal.ts` (renamed
  `lightDirLocal.ts`), the eight call sites listed below, `src/utils/scene/bodyGlintBrightness.ts`,
  `src/utils/scene/bodyGlintBrightnessOf.ts`, `src/utils/scene/packBodyGlints.ts`,
  `src/services/engine/frame/passes/bodyGlintsPass.ts`.

**Contract:**

```ts
// src/utils/scene/rootBodyIdOf.ts: the anchor a body ultimately hangs off, walking bodyHostId
export function rootBodyIdOf(id: PositionedId): PositionedId;
// src/utils/scene/lightSourceMpc.ts: the world position lighting a body: its root anchor's
export function lightSourceMpc(id: PositionedId, states: ReadonlyMap<string, BodyState>): Readonly<Vec3>;
```

- [ ] Move `rootIdOf` out of `bodyRegions.ts:27` into `rootBodyIdOf.ts`, and have `bodyRegions.ts`
      import it.
- [ ] Rename with `npm run refactor -- rename sunDirLocal lightDirLocal` and move the file with
      `npm run move-files -- src/utils/camera/sunDirLocal.ts src/utils/camera/lightDirLocal.ts`.
      The parameter `renderOriginMpc` becomes `lightMpc`. Grep for `sunDirLocal` afterwards: the
      shader-side `sunDirLocal` uniform names stay, because they are the GPU contract.
- [ ] Each call site passes `lightSourceMpc(bodyId, states)` instead of `RENDER_ORIGIN_MPC`:
      - `drawMeshBodiesOnRow.ts:65`
      - `atmosphereDrawList.ts:70`
      - `surfaceTilesPass.ts:73`
      - `earthPass.ts:65`
      - `ringsPass.ts:154`
      - `planetsPass.ts:108`
      - `texturedBodiesPass.ts:124`
      - `cloudShellPass.ts:185`
- [ ] `bodyGlintBrightness`'s `renderOriginMpc` input becomes `lightMpc`. Its two callers pass
      `lightSourceMpc`.
- [ ] Test `lightSourceMpc lights a solar-system body from the Sun at the render origin`: Mars and
      the Moon both resolve to `[0, 0, 0]`.
- [ ] Test `lightSourceMpc lights a star's planet from that star`: use a fixture row whose focus is a
      famous star, or `trappist-1-e` once Task 4 lands. Task 4 adds this assertion if the fixture
      would be artificial.
- [ ] Existing tests pass unchanged. That is the proof that solar-system lighting is identical.

## Task 2: Bodies rooted at an unclaimed star join the neighbourhood (G2)

**Files:** `src/data/bodies/bodyRegions.ts`, `tests/data/bodies/bodyRegions.test.ts` (the existing
test file, if it covers the total/disjoint invariant; otherwise none).

- [ ] `SOLAR_NEIGHBOURHOOD_IDS` becomes every driver id whose `rootBodyIdOf` is an anchor that no
      tighter region claims (today: the anchors alone).
- [ ] No new test if the existing "regions are total and disjoint over SCENE_BODIES" check exists:
      Task 4's planets then fail it without this task. Otherwise add that invariant test here.

## Task 3: TRAPPIST-1 as a famous star

**Files:** `data/seeds/famous_stars.seed.json`, `src/data/bodies/famousStars.generated.ts` and the
other generated artefacts `npm run build-famous-stars` writes.

- [ ] Add the row with the spec §3.1 facts, a 2–3 sentence `description`, `names`
      `["TRAPPIST-1", "2MASS J23062928-0502285"]`, constellation Aquarius, and no `hip`.
      Use the Proxima Centauri row as the field template.
- [ ] `npm run build-famous-stars`. Commit the seed and every generated file together.
- [ ] No new test: the generator's own tests cover the row shape.

## Task 4: The seven planets as scene planets `review: yes`

**Files:**
- New: `src/@types/scene/ExoplanetSeed.d.ts`, `src/data/bodies/exoplanetPlanets.ts`,
  `src/data/bodies/makers/exoplanet.ts`, `tests/data/bodies/makers/exoplanet.test.ts`.
- Modified: `src/data/bodies/scenePlanets.ts`, `src/data/bodies/orbitalElements.ts`.

**Contract:**

```ts
// src/@types/scene/ExoplanetSeed.d.ts: one planet in the archive's published units
export type ExoplanetSeed = {
  readonly id: string; // 'trappist-1-e'
  readonly label: string; // 'TRAPPIST-1 e'
  readonly hostId: string; // a famous-star id: 'trappist-1'
  readonly hostRaDeg: number;
  readonly hostDecDeg: number;
  readonly semiMajorAu: number; // pl_orbsmax
  readonly periodDays: number; // pl_orbper
  readonly eccentricity: number; // pl_orbeccen, 0 when blank
  readonly inclinationDeg: number; // pl_orbincl, sky convention
  readonly transitJd: number; // pl_tranmid (BJD)
  readonly radiusEarth: number; // pl_rade
};
// src/data/bodies/makers/exoplanet.ts
export function exoplanet(seed: ExoplanetSeed): { body: PlanetBody; elements: OrbitalElements };
```

- [ ] Query the archive with TAP: `pscomppars` for `hostname='TRAPPIST-1'`, columns `pl_name,
      pl_orbsmax, pl_orbper, pl_orbeccen, pl_orbincl, pl_tranmid, pl_rade`. Record the query
      and its date in the file header.
- [ ] Write the maker:
      - frame: `planeFrameFromPole(hostRaDeg, hostDecDeg)`;
      - inclination: `skyInclinationToFrameInclination`;
      - node: `skyPositionAngleToFrameAngle(0)`, the convention of spec §5.1;
      - ω = 0;
      - mean anomaly at J2000 phased so the planet is nearest the Sun at `transitJd`;
      - `meanAnomalyRateRadPerCty` from the period;
      - `focusId` = `hostId`;
      - albedo: spec §5.2;
      - radius: `radiusEarth × 6371 km`;
      - trail colour: the solar planets' trail level, from `palette.ts`.
- [ ] Spread the bodies into `SCENE_PLANETS` and the elements into `ORBITAL_ELEMENTS`, after the
      solar rows, with a comment naming the body PR as their next home.
- [ ] Test `exoplanet puts the planet between its star and the Sun at a transit midpoint`:
      propagate `trappist-1-e` to its `transitJd` with `deriveBodyStates`; the planet's distance
      to the origin is less than the star's by ≈ a·sin i.
- [ ] Test `exoplanet keeps the orbit at the published semi-major axis`:
      |planet − star| = a (±e·a) at two instants.
- [ ] Task 1's planet-lit-by-its-star assertion, if it was deferred there.

## Task 5: Delete the orbit-plane renderer; TRAPPIST-1 leaves the diagram `review: yes`

**Files:**
- Reverted from commit `a066a1e`:
  - `src/layers/structure/render/exoplanetOrbitPlaneRenderer.ts`
  - `src/services/gpu/shaders/exoplanetOrbitPlane/`
  - `src/layers/structure/@types/{ExoplanetOrbitPlane,ExoplanetOrbitPlaneRenderer,ExoplanetOrbitDiagram,OrbitPlaneBasis}.d.ts`
  - `src/layers/structure/present/exoplanetOrbitPlaneBasis.ts`
  - `src/layers/structure/present/produceExoplanetOrbitDiagram.ts`, back to
    `produceExoplanetOrbitMarkers.ts`
  - `create.ts`, `destroy.ts`, `StructureRuntime.d.ts`, `exoplanetOrbitsPass.ts`
  - the tests of each
- Modified:
  - `src/layers/structure/data/exoplanetOrbits.ts`
  - `src/layers/structure/@types/ExoplanetOrbitSystem.d.ts` (`inclinationDeg` goes)
  - `tests/layers/structure/data/exoplanetOrbits.test.ts`

- [ ] `git revert a066a1e` gives back the face-on diagram. Keep `7ba59f2` (the seed radii) as it is.
- [ ] Remove `exoplanet-system-trappist-1` from `EXOPLANET_ORBITS`.
- [ ] Update `exoplanetOrbits.test.ts`:
      - "covers exactly the exoplanet-system seed rows" becomes "every host is drawn exactly once":
        each seed row's id is in `EXOPLANET_ORBITS` XOR has scene-planet rows focused on it.
      - The seed-radius test reads the extent from those rows for a body-backed host: the max
        `semiMajorMpc` in au.

## Task 6: Docs, backlog, and the deep-link check

**Files:**
- `docs/BACKLOG.md`, plus a new `docs/backlog/2026-10-28-exoplanet-systems-to-bodies.md`.
- The `ATTRIBUTIONS.md` NASA Exoplanet Archive entry, if its scope line names only the structure
  seed.

- [ ] Backlog line: "Migrate the other 18 exoplanet systems to scene bodies" `ready`. Each host
      becomes a famous-star row, and the face-on diagram and `EXOPLANET_ORBITS` are deleted with
      the last system. The detail file lists the hosts and the habitable-zone question.
- [ ] Shots: `#focus=exoplanet-system-trappist-1`, the same link with an angled `pose=`, and
      `#focus=body-trappist-1-e`. Send them as a dash check.

## Definition of Done

- **Deliverables:**
  - `rootBodyIdOf`, `lightSourceMpc` and `lightDirLocal` exist; `sunDirLocal` does not.
  - TRAPPIST-1 is in `famousStars.generated.ts`.
  - `exoplanetPlanets.ts` and `makers/exoplanet.ts` exist, and seven `trappist-1-*` ids are in
    `SCENE_PLANETS` and `ORBITAL_ELEMENTS`.
  - No `exoplanetOrbitPlane` file is left.
- **Observable:**
  - The system focus shows the star and seven elliptical trails in perspective, with the glints on
    their trails.
  - The planet focus shows a sphere lit from TRAPPIST-1's side.
  - Turning off "Orbit trails" hides the TRAPPIST-1 trails.
  - Search "TRAPPIST-1 e" focuses the planet.
  - The other 18 systems still draw the face-on diagram on close approach.
- **Deferred:**
  - the other 18 systems;
  - the habitable-zone band;
  - textures and measured albedos;
  - the node angle, which is a convention;
  - the Gaia duplicate point, until the next chunk re-bake.
