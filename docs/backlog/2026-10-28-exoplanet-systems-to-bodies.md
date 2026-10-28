# Migrate the other 18 exoplanet systems to scene bodies

TRAPPIST-1 became the pilot on 2026-10-28
([spec](../superpowers/specs/2026-10-28-exoplanet-bodies-design.md)): its host is a famous star,
its seven planets are scene planets with orbit trails, and it left `EXOPLANET_ORBITS`. The other
18 `exoplanet-system` anchors still draw the face-on diagram (`produceExoplanetOrbitMarkers`).

## Per system

- The host becomes a `famous_stars.seed.json` row. Its `ra`/`dec`/`distancePc` must be exactly the
  structure seed's values (`exoplanetOrbits.test.ts` pins host and star within 1% of the system).
- Its planets become `ExoplanetSeed` rows in `src/data/bodies/exoplanetPlanets.ts`. Use
  `pscomppars` for `pl_orbsmax`, `pl_orbper`, `pl_orbeccen`, `pl_orbincl`, `pl_tranmid` and
  `pl_rade`.
- Its entry leaves `EXOPLANET_ORBITS`.

## Open questions

- **Non-transiting planets** (51 Peg, eps Eri, HR 8799, beta Pic, GJ 581 and others):
  - with no `pl_tranmid`, the phase needs another epoch (`pl_orbtper`, periastron);
  - with no `pl_rade`, the radius needs a mass–radius estimate;
  - HR 8799 and beta Pic have measured nodes (Ω) from imaging and astrometry, so they need not
    take the PA-0 convention.
- **Circumbinary and pulsar hosts:** Kepler-16 orbits a binary, and PSR B1257+12 is a pulsar. A
  pulsar's star body is a neutron star, not a blackbody sphere.
- **The habitable-zone band:** dropped for TRAPPIST-1. If it returns, it is one annulus per host,
  not a second orbit renderer.
- **Glint dissolve per system:** `bodyGlintBackdrop` is sized off the solar system's extent for
  every root. Per-system bands would follow `regionById`'s extents if a system ever needs one.

When the last system moves, delete `EXOPLANET_ORBITS`, `produceExoplanetOrbitMarkers`,
`exoplanetOrbitsPass` and the structure Layer's `orbitRenderer`.
