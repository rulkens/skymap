# GeoDanmark orthophoto — Datafordeler WMS GetMap harvest

| Field        | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| Layer        | `geodanmark_2025_10cm` (forår 2025, 10 cm/px)                            |
| Licence      | CC BY 4.0 — attribute as **Ortofoto © GeoDanmark / Klimadatastyrelsen (CC BY 4.0)** |
| Upstream URL | `https://wms.datafordeler.dk/GeoDanmarkOrto/orto_foraar_wmts/1.0.0/WMS`  |
| CRS          | EPSG:4326, WMS 1.3.0                                                     |
| Grid         | `step = 360 / 2^z` on BOTH axes; `x0` at −180° east-positive, `y0` at +90° south-positive |

Covers the z14–z19 rungs of the powers-of-ten Earth zoom, below EOX
s2cloudless's z13 floor (9.55 m/px). See `data/raw/eox/README.md` for the band
this one extends.

## Harvested regions

| Region       | Harvested  | Bounds (W/S/E/N)                  | Tiles |
| ------------ | ---------- | --------------------------------- | ----- |
| Søndermarken | 2026-08-20 | 12.51 / 55.662 / 12.55 / 55.678   | 1963  |

Per level: z14 = 3, z15 = 10, z16 = 32, z17 = 112, z18 = 390, z19 = 1416.
The patch is roughly 2.5 km × 1.8 km — small enough that a flier leaving it
drops back to EOX z13 with no on-screen indication, which is a coverage-edge
feedback requirement for the production band, not a bug in the planner.

## Layout, and how it deviates from the raw convention

Tiles land at `data/raw/geodanmark/<region>/<z>/<x>/<y>.webp`, mirroring
`data/raw/eox/<region>/<z>/<row>/<col>.jpg` one level for one level.

**These are already-converted `.webp`, not upstream bytes.** Every other raw
tree holds what the server sent; this one holds 512 px JPEG GetMap responses
already run through `sharp` to RGBA WebP q82, because the tree started life as
a throwaway demo harvest and the intermediate JPEGs were never kept. A
production fetcher should store the server's bytes here and convert at bake
time, as EOX does.

Each level is harvested independently — the server renders every rung natively,
so there is no local 2×2 pyramid step. That is the opposite of EOX, which
fetches z13 only and derives z8–z12 at bake time.

## BBOX axis order — landmine

WMS 1.3.0 with EPSG:4326 takes **BBOX as `lat,lon`**, not `lon,lat`. Getting
this backwards returns a plausible-looking image of the wrong place — verified
on-image against Frederiksberg geography, not assumed. The 1.1.1-style
`lon,lat` ordering most tile code uses is wrong here.

## Host and credentials

Use `wms.datafordeler.dk`; the `services.datafordeler.dk` host returns 403 even
with a valid key.

The API key lives in the login keychain as `skymap-datafordeler-apikey` and is
read in-process (`security find-generic-password -w`). It must never be printed,
logged, or written into a URL that gets logged — redact it from error output.

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
