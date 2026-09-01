# GeoDanmark orthophoto — Datafordeler WMS GetMap harvest

| Field        | Value                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Layer        | `geodanmark_2025_10cm` (forår 2025, 10 cm/px)                                                                          |
| Licence      | CC BY 4.0 — attribute as **Ortofoto © GeoDanmark / Klimadatastyrelsen (CC BY 4.0)**                                    |
| Upstream URL | `https://wms.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS`                                                     |
| CRS          | EPSG:4326, WMS 1.3.0                                                                                                   |
| Grid         | skymap's own equirect grid — `step = 360 / 2^z` on BOTH axes; `x0` at −180° east-positive, `y0` at +90° south-positive |

Covers the z14–z19 rungs of the powers-of-ten Earth zoom, below EOX
s2cloudless's z13 floor (9.55 m/px). See `data/raw/eox/README.md` for the band
this one extends.

## z19 only, bbox snapped to the z14 grid

This harvest fetches **z19 tiles only**, requested directly on skymap's own
grid via WMS `GetMap` (`BBOX` = the tile's own lon/lat bounds, `WIDTH=HEIGHT=512`)
— coarser levels (z14–z18) are derived at bake time by the existing 2x2
average, exactly as EOX's z8–z12 come from its own z13 harvest
(`geodanmarkTileSource.ts`, `tools/textures/buildEarthTiles.ts`).

The harvested rect's every edge **must be divisible by `2^(19-14) = 32`** —
snapped to the z14 tile grid. That makes the z14–z18 pyramid **closed**: every
parent tile inside coverage has all four children, so every baked tile comes
out fully opaque with no missing quadrant. An unsnapped bbox leaves edge
parents with a transparent quadrant that the runtime alpha-blends over the
blurrier EOX/Blue Marble band beneath — `geodanmarkTileSource.ts` asserts this
at construction and throws rather than baking that silently. This band has no
`underfill` source for the same reason: a closed pyramid never needs one.

## Harvested regions

| Region       | Harvested  | Bounds (W/S/E/N)                | Tiles |
| ------------ | ---------- | ------------------------------- | ----- |
| Søndermarken | 2026-08-31 | 12.51 / 55.662 / 12.55 / 55.678 | 3,072 |

z19 only: 96×32 tile rect, `x[280352..280447]`, `y[49984..50015]` — snapped
from the original unsnapped patch (see git history for the pre-snap harvest).
The patch is roughly 2.5 km × 1.8 km — small enough that a flier leaving it
drops back to EOX z13 with no on-screen indication, which is a coverage-edge
feedback requirement for the production band, not a bug in the planner.

## Layout

Tiles land at `data/raw/geodanmark/soendermarken-z19-jpg/19/<x>/<y>.jpg` —
512 px JPEG `GetMap` responses, upstream bytes as the server sent them (no
local conversion), one flat z19 tree with no per-region subdirectory (unlike
`data/raw/eox/<region>/<z>/<row>/<col>.jpg`, this harvest is a single patch).

## BBOX axis order — landmine

WMS 1.3.0 with EPSG:4326 takes **BBOX as `lat,lon`**, not `lon,lat`. Getting
this backwards returns a plausible-looking image of the wrong place — verified
on-image against Frederiksberg geography, not assumed. The 1.1.1-style
`lon,lat` ordering most tile code uses is wrong here.

## Host, endpoint, and credentials

Use `wms.datafordeler.dk`; the `services.datafordeler.dk` host returns 403
even with a valid key. The `orto_foraar_wmts` path documented in earlier spikes
404s — verified by a live probe; `orto_foraar` (no `_wmts` suffix) is correct
for the WMS `GetMap` endpoint above.

Auth is an `apikey=<key>` query parameter. The key lives in the login keychain
as `skymap-datafordeler-apikey` and is read in-process (`security
find-generic-password -w`). It must never be printed, logged, or written into
a URL that gets logged — redact it from error output.

Freshly registered keys propagate per gateway node, so a new key yields
intermittent 401 `DAF-AUTH-0005` for roughly 20 minutes. Treat 401 as retryable
during that window rather than aborting the run.

## Vintage — open decision

This harvest is forår (spring) 2025 at 10 cm: leafless trees. The user prefers
leafed trees within a 12.5 cm limit, which admits only **sommer 2008 at
12.5 cm** — 18 years old, and hosted on Dataforsyningen, a separate platform
needing its own token and registration. Free summer alternatives fail the
limit: 1999/2002/2005 are 40 cm; 2016+ summers are 20–25 cm and/or restricted
to government Miljøportal parties. Not yet decided.
