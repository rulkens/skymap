# Generated TS modules get a seed-to-module diff test; render rows move to the R2 sidecar

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`src/data/bodies/famousStars.generated.ts` (1,430 lines), `ephemerisCorrections.generated.ts` (1,088) and six more. Only `meshAssetsRoundTrip.test.ts` checks a committed module, and only serializer == file, not inputs == file. Nothing checks seed → `FAMOUS_STARS_GENERATED` / `SUN_GENERATED` / `bodyFacts`. The famous-stars table deploys through git while `famous_stars_meta.json` deploys through R2, so one build ships through two channels that can drift.

## Direction

A test per pure seed→rows projection that re-runs it over the committed seed and diffs the committed module. Input sha256 in the banner of the Horizons-derived files. Move the famous-star render rows into the R2 sidecar so one channel carries both.
