# DHM Punktsky — Datafordeler LiDAR point-cloud harvest (Søndermarken)

| Field        | Value                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| Dataset      | DHM Punktsky (current vintage; historical `Punktsky2015`/`Punktsky2007` also exist)          |
| Licence      | CC BY 4.0 — attribute as **Danmarks Højdemodel (Punktsky) © Klimadatastyrelsen (CC BY 4.0)** |
| Service      | DHM Fildownload (Punktsky) — REST, method `GetPointCloudFile`                                |
| Endpoint     | `https://api.datafordeler.dk/FileDownloads/GetPointCloudFile`                                |
| Tile CRS     | EPSG:25832 (ETRS89 / UTM zone 32N)                                                           |
| Height datum | DVR90 orthometric                                                                            |

Feeds the scene-workbench LiDAR bake (task 3 onward): raw ALS point clouds
for the Søndermarken picnic-spot scene, colourized and thinned to a viewable
point cloud in a local topocentric frame.

## Group extent (v1)

Taken verbatim from the GeoDanmark ortho harvest this scene sits inside
(`data/raw/geodanmark/README.md:36`) — it's the bound the ortho actually
covers, not a park-scale crop. Narrowing later is a crop-constant edit plus
a re-bake, nothing else (spec §11 open question 1).

|                            |                                    |
| -------------------------- | ---------------------------------- |
| Bbox (W/S/E/N, EPSG:4326)  | 12.51 / 55.662 / 12.55 / 55.678    |
| Anchor `latDeg` / `lonDeg` | 55.67 / 12.53 (bbox centre)        |
| Anchor `headingDeg`        | 0 (group +X = local east)          |
| Anchor `heightMDvr90`      | **~33 m — PROVISIONAL, see below** |

### `heightMDvr90` — provisional, re-read at bake time

The DHM/Terræn WMS (`https://wms.datafordeler.dk/DHMNedboer/dhm/1.0.0/WMS`)
is reachable with the Fildownload key (`GetCapabilities` returns 200 and
lists `dhm_kote_0_5_m`/`dhm_kote_2_5_m`/`dhm_kurve_*` layers), but
`GetFeatureInfo` against `dhm_kote_0_5_m` at the anchor coordinate returned
"Search returned no results" — it's a contour/spot-height cartographic
layer, not a point-queryable DTM raster, so it can't hand back a numeric
elevation this way. Punktsky's own LAS header bounding box is **not**
trustworthy for this either — see the "LAS header Z bounds are garbage"
landmine below.

Used instead: Frederiksberg's highest point, the Frederiksberg Bakke
moraine ridge running through Frederiksberg Have and Søndermarken (the
anchor sits on its Søndermarken flank), is documented at 31 m.o.h. near the
castle/Zoo tower and up to 35–36 m.o.h. at a knoll on the Søndermarken side
(da.wikipedia.org "Valby Bakke og Frederiksberg Bakke"; Trap Danmark, which
gives the municipality's high point as 36 m.o.h.). **33 m DVR90** is used
as the anchor midpoint estimate. Task 3's bake must re-read the real value
from the first fetched tile's actual ground-classified points (not its
header bbox) and overwrite this constant.

## Tile list

Computed by converting the bbox corners to EPSG:25832 with `cs2cs` and
enumerating the covered 1 km DDKN cells (floor of each metre coordinate,
km-truncated — tile name = SW-corner km indices):

```
$ printf '55.662 12.51\n55.662 12.55\n55.678 12.51\n55.678 12.55\n' | cs2cs EPSG:4326 EPSG:25832
720767.51  6174048.74 0.00
723282.22  6174176.84 0.00
720677.38  6175828.19 0.00
723191.05  6175956.25 0.00
```

Bbox in EPSG:25832: E [720677.38, 723282.22], N [6174048.74, 6175956.25] →
easting tiles 720–723, northing tiles 6174–6175 (4 × 2 = 8 tiles). Verified
live filenames are lowercase (see Entitlement check below) — the brief's
`PUNKTSKY_1km_<n>_<e>` spelling is descriptive only:

```
punktsky_1km_6174_720   punktsky_1km_6174_721   punktsky_1km_6174_722   punktsky_1km_6174_723
punktsky_1km_6175_720   punktsky_1km_6175_721   punktsky_1km_6175_722   punktsky_1km_6175_723
```

Fetch URL per tile: `GetPointCloudFile?FileName=<name>.las&apiKey=<key>`.

## Apikey / keychain rule

Same key as the GeoDanmark ortho harvest (`data/raw/geodanmark/README.md:65-69`):
lives in the login keychain as `skymap-datafordeler-apikey`, read in-process
via `security find-generic-password -w`. Never print, log, or write it into
a URL that gets logged.

## Vertical-datum note

Punktsky heights are DVR90 orthometric, not ellipsoidal. Task 6's bake
pipeline feeds them to PROJ's `+proj=topocentric` as if they were
ellipsoidal height — exact enough here because `h_0` (the anchor height)
comes from the same DVR90 data, so the ~36 m Danish geoid undulation
cancels out over a 2.5 km patch; it would not for a large-extent or
absolute-height use.

## Entitlement check

`GetPointCloudFile?FileName=punktsky_1km_6175_722.las` returned **HTTP 200**
with an `LASF` magic-number body (verified against the raw bytes, not just
the status code) — the key is entitled to DHM/Punktsky Fildownload, a
separate subscription from the WMS one. No portal action needed.

## Landmines for later tasks

- **Range requests are ignored.** `curl -r 0-255 ...` and `-r 0-239 ...`
  both came back `200` (not `206`) with the _full_ ~13 MB file — the
  endpoint doesn't support partial GET. Task 3's fetcher must plan for
  whole-file downloads, not resumable ranges.
- **`Content-Type` lies.** The response header says `application/zip`; the
  body is a raw uncompressed `.las` file (`LASF` signature at byte 0), not
  a zip. Sniff the magic number, don't trust the header.
- **LAS header Z bounds are garbage.** The anchor tile's header
  (`punktsky_1km_6175_721.las`) reports `minz=-52.68`, `maxz=895.9` —
  physically impossible for Denmark (country max ≈ 171 m). The header
  bbox is noise-contaminated and must not be used for `heightMDvr90` or
  any other elevation read; use actual ground-classified point statistics
  instead.
- **`cs2cs`'s two-CRS form can't take a bare `+proj=topocentric` string.**
  The brief's literal verification command
  (`cs2cs EPSG:4326 "+proj=topocentric ..."`) fails on the installed PROJ
  9.8.1 with `missing target CRS and source CRS is not a projected CRS` —
  a bare topocentric conversion string isn't promotable to a full CRS
  object in this PROJ version. The underlying projection is verified
  working instead via an explicit two-step pipeline through `cct`, in
  `lon,lat,h` order (raw `+proj=` pipelines use PROJ's traditional
  GIS axis order, not EPSG:4326's authority-defined `lat,lon`):
  ```
  $ echo "12.53 55.67 40" | cct +proj=pipeline \
      +step +proj=cart +ellps=GRS80 \
      +step +proj=topocentric +lat_0=55.67 +lon_0=12.53 +h_0=40 +ellps=GRS80
         0.0000       0.0000       0.0000           inf
  ```
  All three metre values are within tolerance of `0`. Task 6 should build
  its pipeline the same way (`+proj=cart` then `+proj=topocentric`), not
  via `cs2cs`'s CRS-pair form.

## Prerequisite versions (verified 2026-09-03)

| Tool                   | Version                       |
| ---------------------- | ----------------------------- |
| `pdal`                 | 2.10.2 (git-version: Release) |
| `gdalinfo`             | 3.13.3 "Iowa City"            |
| `cs2cs` / `cct` (PROJ) | 9.8.1                         |

`pdal --drivers` lists `readers.las`, `filters.colorization`,
`filters.sample`, and `writers.text`.
