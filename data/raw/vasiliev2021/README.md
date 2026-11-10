# `data/raw/vasiliev2021/` — Sagittarius stream N-body snapshot

## Provenance

|         |                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paper   | Vasiliev, Belokurov & Erkal 2021, _Tango for three: Sagittarius, LMC, and the Milky Way_, MNRAS 501, 2279 ([arXiv:2009.10726](https://arxiv.org/abs/2009.10726)) |
| Data    | Zenodo [record 4300977](https://zenodo.org/records/4300977), `Sgr_stream_simulations.zip` (43.6 MB)                                                  |
| Licence | CC-BY 4.0 (the Zenodo record)                                                                                                                         |
| Files   | `Sgr_snapshot/stars.txt` (27,000,135 bytes) and `Sgr_snapshot/readme.txt`, extracted; the rest of the zip is discarded                               |
| Fetched | 2026-11-06                                                                                                                                            |
| Fetcher | `npm run fetch-vasiliev2021`                                                                                                                          |

Checksums (also in the committed `.sha256` sidecars, which the fetcher verifies against):

```
892ba18e30ed07978a1b0417d2976774f21d061971175fe9ea921b7d0c90008a  stars.txt
72ac950b7e9b8f0190c9d071239ad12c3330b98d6650827e8b16ba3f24f9310a  readme.txt
```

`Sgr_snapshot/` is the present-day snapshot of the run with an LMC of 1.5 × 10¹¹ M☉ in an evolving
triaxial Milky Way; the zip's `Sgr_snapshot_noLMC/` sibling is not used.

## Layout of `stars.txt`

One `#` header line, then 200,000 whitespace-separated rows, one star particle each, sorted by initial
binding energy (most bound first):

| Column               | Unit   | Meaning                                                                       |
| -------------------- | ------ | ----------------------------------------------------------------------------- |
| `x y z`              | kpc    | galactocentric position (see frame below)                                     |
| `vx vy vz`           | km/s   | galactocentric velocity                                                       |
| `ra dec`             | deg    | ICRS sky position                                                             |
| `distance`           | kpc    | heliocentric distance                                                         |
| `pmra pmdec`         | mas/yr | proper motions                                                                |
| `vlos`               | km/s   | heliocentric line-of-sight velocity (not GSR)                                 |
| `Lambda Beta`        | deg    | stream-aligned sky coordinates; leading arm has Λ > 0, Λ spans multiple wraps |
| `Zeta`               | deg    | Λ-like angle measured from the Galactic Centre                                |
| `Tstrip`             | Gyr    | stripping time: 0 = still bound, negative = when it last left 5 kpc of the remnant |
| `mass`               | M☉     | particle mass                                                                 |

**Frame:** right-handed galactocentric Cartesian with the Sun at x = −8 kpc, so the axes are the
galactic ones: x from the Sun towards the Galactic Centre, y towards l = 90°, z to the north galactic
pole. The build reads positions from `ra dec distance` (already heliocentric) and rotates only the
velocity into the equatorial frame.

About 112k of the 200k particles are still bound (`Tstrip = 0`); the oldest debris was stripped
2.6 Gyr ago, inside the run's 3 Gyr span.
