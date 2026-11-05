# Commercial build that cannot ship non-commercial data

`needs-design` — filed 2026-10-12 while #882 baked DSS2 cutouts into `public/images/structures/`.

## Problem

Several sources Skymap ships or fetches at runtime forbid commercial use or need the holder's written permission. A paid installation or a for-profit client's deployment would be exposed today, and nothing stops a build from shipping them. The goal is two parts:

1. A **commercial build** (a build flag or composition) that leaves out every non-commercial source and the features that depend on it, with a sensible substitute or an absent feature.
2. A **guard** that makes it impossible to ship non-commercial data in that build. For example, a build-time check fails if any asset or runtime host traces back to a restricted `ATTRIBUTIONS.md` entry.

## Current state (from `ATTRIBUTIONS.md` "Use:" lines, 2026-10-12)

| Use                                   | Entry                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Non-commercial only                   | Gaia DR3 — the star field                                                   |
| Non-commercial only                   | Bailer-Jones distances (Gaia EDR3)                                          |
| Non-commercial only                   | GCNS                                                                        |
| No licence stated; Non-commercial only | Hipparcos 2007                                                             |
| Ask the holder                        | Digitized Sky Survey: runtime galaxy-thumbnail fallback + shipped structure shots |
| Ask the holder                        | StarNet2 (star removal, tooling)                                            |
| Non-commercial only; Share-alike      | EOxCloudless s2cloudless-2025 (Earth imagery)                               |
| No derivatives; No licence stated     | `pcg4d` hash                                                                |
| Per item; Non-commercial only         | Pictures and films made with skymap                                         |

Each entry carries an `<!-- attribution: id=…; keys=…; hosts=… -->` marker. That marker is the natural hook for a guard: data keys map to `public/data/` files and asset folders, and hosts map to runtime fetches.

## Options to weigh

- **Restriction source:** a machine-readable `use` field on each attribution marker (`commercial: false`), read by the guard, so `ATTRIBUTIONS.md` stays the single source.
- **Per-source substitute or drop:** for example, Gaia is replaced by a permissive star catalogue or the far star field is dropped; DSS2 is replaced by app renders or a permissive survey; EOX uses the 2016 s2cloudless layer, which is CC BY.
- **Asking first:** a single email to archive@stsci.edu may clear DSS without any code. Gaia's terms should be re-read before designing around them.
