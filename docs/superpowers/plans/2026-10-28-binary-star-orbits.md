# Binary-star orbits (Alpha Centauri A/B prototype): plan

Spec: [`specs/2026-10-28-binary-star-orbits-design.md`](../specs/2026-10-28-binary-star-orbits-design.md).
Branch: `ccr-c8fb8b4c-la32w5`.

## Task 1: Extract the sky-to-frame orbit conversion (G1) `review: yes`

**Files:**
- New: `src/data/bodies/makers/skyOrbitElements.ts`, `src/@types/scene/SkyOrbitSpec.d.ts`.
- Modified: `src/data/bodies/makers/sStar.ts`.

```ts
export type SkyOrbitSpec = {
  readonly id: string; readonly focusId: string; readonly plane: OrbitPlaneFrame;
  readonly semiMajorMpc: number; readonly eccentricity: number;
  readonly inclinationDeg: number; readonly ascendingNodeDeg: number; readonly argPeriapsisDeg: number;
  readonly periapsisEpochYr: number; readonly periodYr: number; readonly color: Vec3;
};
export function skyOrbitElements(spec: SkyOrbitSpec): OrbitalElements;
```

- [ ] Move `sStar.ts`'s conversion body into `skyOrbitElements`. `sStar` keeps its unit and tint
      choices and calls it.
- [ ] No new test: `sStar.test.ts` and `sStarAstrometry.test.ts` must pass untouched.

## Task 2: Famous stars may carry an orbit (G2)

**Files:**
- `tools/parsers/famousStarsSeed.ts`, with its test;
- `tools/famous/buildFamousStars.ts`, with the `FamousStarRow` projection;
- `src/@types/data/FamousStarRow.d.ts`;
- `src/data/bodies/sceneAnchors.ts`, `src/data/bodies/orbitalElements.ts`;
- new: `src/data/bodies/makers/famousStarOrbit.ts`.

- [ ] Add the optional seed `orbit` block (spec §3.1 fields). The parser validates:
      - `host` is another row's id;
      - every number is finite;
      - `0 ≤ e < 1`;
      - `periodYr > 0` and `semiMajorArcsec > 0`.
- [ ] `seedToGeneratedRows` copies it onto the row.
- [ ] `SCENE_ANCHORS` skips rows with an orbit. `ORBITAL_ELEMENTS` appends
      `famousStarOrbit(row)` for each such row:
      - plane = `planeFrameFromPole(host.raDeg, host.decDeg)`;
      - semi-major = arcsec × distancePc au;
      - trail tint from the star's temperature, as the S-stars do.
- [ ] Parser test `rejects an orbit whose host is not a seed row`.

## Task 3: Alpha Centauri B `review: yes`

**Files:**
- `data/seeds/famous_stars.seed.json` and the generated artefacts;
- `tests/fixtures/bodyStatesJ2000.json`;
- new: `tests/data/bodies/makers/famousStarOrbit.test.ts`.

- [ ] Seed B per spec §3.2. A becomes "Alpha Centauri A", drops `hipCompanions`, and gives
      "Toliman" to B. Append B last, then `npm run build-famous-stars`.
- [ ] Append B's J2000 row to the body-state fixture.
- [ ] Test `B is 11.4 au from A at the 2035.6 periastron and 35.9 au at the 1995.6 apastron`.
- [ ] Test `B sits about 4″ from A on the sky in early 2016`: the projected separation at the
      2016.0 date, within ±0.6″. This one pins the orientation.

## Task 4: Shots and docs

- [ ] Shots:
      - `#focus=star-alpha-centauri` with the trail;
      - a pose 30° above B's orbital plane;
      - `#focus=star-alpha-centauri-b`.
- [ ] Note the barycentric item in the backlog line `docs/backlog/2026-08-16-barycentric-orbit-pairs.md`
      if it doesn't already cover stars.

## Definition of Done

- **Deliverables:**
  - `skyOrbitElements` and `famousStarOrbit` exist;
  - seed rows may carry `orbit`;
  - B is a famous star with an orbit.
- **Observable:**
  - A, B and B's trail are visible from the Alpha Centauri focus;
  - "Toliman" search focuses B;
  - "Orbit trails" off hides the trail;
  - the S-star trails are unchanged.
- **Deferred:**
  - other binaries;
  - barycentric motion of A;
  - Proxima's orbit.
