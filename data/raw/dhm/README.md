# DHM Punktsky — Datafordeler LiDAR point-cloud harvest (Søndermarken)

| Field        | Value                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------- |
| Dataset      | DHM Punktsky (current vintage; historical `Punktsky2015`/`Punktsky2007` also exist)          |
| Licence      | CC BY 4.0 — attribute as **Danmarks Højdemodel (Punktsky) © Klimadatastyrelsen (CC BY 4.0)** |
| Service      | DHM Fildownload (Punktsky) — REST, method `GetPointCloudFile`                                |
| Endpoint     | `https://api.datafordeler.dk/FileDownloads/GetPointCloudFile`                                |
| Tile CRS     | EPSG:25832 (ETRS89 / UTM zone 32N)                                                           |
| Height datum | DVR90 orthometric                                                                            |
| Flight date  | 2011-09-20 (derived from point `GpsTime`, see "Flight date" below)                           |

Feeds the scene-workbench LiDAR bake (`tools/fetch/fetchDhm.ts` →
`tools/scene-recon/bakeLidar.ts`): raw ALS point clouds
for the Søndermarken picnic-spot scene, colourized and thinned to a viewable
point cloud in a local topocentric frame.

## Group extent (v1)

Taken verbatim from the GeoDanmark ortho harvest this scene sits inside
(`data/raw/geodanmark/README.md:36`) — it's the bound the ortho actually
covers, not a park-scale crop. Narrowing later is a crop-constant edit plus
a re-bake, nothing else (spec §11 open question 1).

|                            |                                   |
| -------------------------- | --------------------------------- |
| Bbox (W/S/E/N, EPSG:4326)  | 12.51 / 55.662 / 12.55 / 55.678   |
| Anchor `latDeg` / `lonDeg` | 55.67 / 12.53 (bbox centre)       |
| Anchor `headingDeg`        | 0 (group +X = local east)         |
| Anchor `heightMDvr90`      | **18.53 m** (measured, see below) |

### `heightMDvr90` — read from the anchor tile's own points

The DHM/Terræn WMS (`https://wms.datafordeler.dk/DHMNedboer/dhm/1.0.0/WMS`)
is reachable with the Fildownload key (`GetCapabilities` returns 200), but
`GetFeatureInfo` against its `dhm_kote_0_5_m` layer at the anchor
coordinate returned "Search returned no results" — it's a contour/spot-height
cartographic layer, not a point-queryable DTM raster. Punktsky's own LAS
header bounding box is unusable too (see "LAS header Z bounds are garbage"
below). Both ruled out, the height was read from the anchor tile's actual
points instead:

```
$ pdal info --stats --dimensions Classification punktsky_1km_6175_721.las
Classification min 1 max 11 count 455159
```

`punktsky_1km_6175_721.las` (the tile covering the anchor, fetched during
the entitlement check) carries **zero** `Classification == 2` (ground)
points anywhere in its 455,159 — its only classes are 1 (unclassified/noise
catch-all), 5 (high vegetation), 6 (building), 7 (low-point noise), and 11
(not a class the DHM v1.0.0 product spec uses; likely a pre-2018-vintage
holdover). A `filters.smrf` ground-reclassification pass over a 60 m
context around the anchor was also tried and found to degenerate to a
no-op — with no true bare-earth return anywhere nearby to anchor the
morphological model, it just reclassified the same ~429 canopy points as
"ground" (median 19.95 m, identical to the unfiltered vegetation stats
below), so its output wasn't used either.

Used instead: the minimum Z among all points within 20 m of the anchor —
a hard lower bound from real returns, not a manufactured estimate:

```
$ pdal pipeline anchor-crop-pipeline.json   # readers.las → filters.crop(point, distance=20) → writers.text
$ # 429 points in radius: 418 Classification=5 (high vegetation, Z 18.45–22.45),
$ #                        11 Classification=1 (unclassified, Z 25.87–29.63)
$ python3 -c "..."  # min(Z) over the 429-point CSV
18.45
```

**18.5 m DVR90** (429 points sampled, tile `punktsky_1km_6175_721.las`).
Since it's the lowest of 429 real LiDAR returns within 20 m, true bare
earth is at or below it — high-vegetation points sit ≥2 m above ground by
DHM's own classification rule (see Point classification, DHM product spec
§7.3), so this likely still overstates ground height by some margin the
data here can't resolve (no pulse in this radius reached soil). The
Frederiksberg Bakke figure (31–36 m.o.h., da.wikipedia.org "Valby Bakke og
Frederiksberg Bakke"; Trap Danmark) does **not** corroborate this — that's
a different, higher point (the ridge crest near the castle/Zoo tower),
not the bbox-centre anchor, which sits lower and further into
Søndermarken's tree cover.

### Re-derivation — same conclusion, standard method

Re-run by the standard method: `filters.reprojection` (EPSG:25832
→ EPSG:4326) → `filters.crop` to a 20 m-radius box around the anchor
(lon 12.53 / lat 55.67) → `filters.range Classification[2:2]`. Same tile,
same result — **zero** ground (class 2) points among 508 returns in the box
(491 class 5 high-vegetation, 17 class 1 unclassified). Per the ruling's
fallback, took the 5th-percentile Z of all 508 returns: **18.53 m** —
0.08 m above the earlier min-Z estimate (18.45 m over 429 points in a
differently-shaped crop), well inside the margin either method already
flagged as an overstatement of true bare earth (no pulse in this radius hit
soil). Still true bare earth is at or below this value.

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

Punktsky heights are DVR90 orthometric, not ellipsoidal.
`lidarPipelineStages.ts` feeds them to PROJ's `+proj=topocentric` as if they were
ellipsoidal height — exact enough here because `h_0` (the anchor height)
comes from the same DVR90 data, so the ~36 m Danish geoid undulation
cancels out over a 2.5 km patch; it would not for a large-extent or
absolute-height use.

## Flight date

`bakeLidar`'s `provenance.sourceVintage` needs the source material's date,
not the bake date. The LAS headers' own `creation_year`/`creation_doy`
fields are unset (`0` — a TerraScan export quirk, not a real date), so it's
read from point `GpsTime` instead: PDAL's `readers.las` decodes it as
Adjusted Standard GPS Time (`GpsTime + 1e9` seconds past the GPS epoch,
1980-01-06 UTC, minus the 18 s GPS-UTC leap offset). All 8 tiles decode to
the same day:

```
$ pdal info --stats --dimensions GpsTime punktsky_1km_6175_721.las
GpsTime min 567880.7422 max 568340.3804
$ python3 -c "import datetime; e=datetime.datetime(1980,1,6,tzinfo=datetime.timezone.utc); \
  print(e+datetime.timedelta(seconds=567880.7422+1e9-18))"
2011-09-20 15:31:02.742200+00:00
```

**2011-09-20.**

## Entitlement check

`GetPointCloudFile?FileName=punktsky_1km_6175_722.las` returned **HTTP 200**
with an `LASF` magic-number body (verified against the raw bytes, not just
the status code) — the key is entitled to DHM/Punktsky Fildownload, a
separate subscription from the WMS one. No portal action needed.

## Landmines

- **Range requests are ignored.** `curl -r 0-255 ...` and `-r 0-239 ...`
  both came back `200` (not `206`) with the _full_ ~13 MB file — the
  endpoint doesn't support partial GET. `fetchDhm.ts` therefore does
  whole-file downloads, not resumable ranges.
- **`Content-Type` lies.** The response header says `application/zip`; the
  body is a raw uncompressed `.las` file (`LASF` signature at byte 0), not
  a zip. Sniff the magic number, don't trust the header.
- **LAS header Z bounds are garbage.** The anchor tile's header
  (`punktsky_1km_6175_721.las`) reports `minz=-52.68`, `maxz=895.9` —
  physically impossible for Denmark (country max ≈ 171 m), caused by a
  handful of far-outlier points (Classification 6 and 7) the header
  bounds don't exclude. Never trust the header bbox for an elevation
  read; filter by classification and/or a spatial crop first.
- **This tile has no ground classification at all.** `Classification`
  ranges 1–11 with zero `2`s across all 455,159 points (see
  `heightMDvr90` above) — don't assume `filters.range
Classification[2:2]` returns anything for an arbitrary Punktsky tile;
  check first, and have a ground-filter fallback (`filters.smrf` /
  `filters.pmf`) ready. Even that fallback needs real bare-earth returns
  to anchor itself — under a dense-canopy tile like this one it can
  degenerate to a no-op that just relabels canopy as "ground".
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
  All three metre values are within tolerance of `0`, and
  `lidarPipelineStages.ts` builds its pipeline the same way (`+proj=cart`
  then `+proj=topocentric`), not via `cs2cs`'s CRS-pair form.
  The same failure hits PDAL's `filters.reprojection`
  itself — `out_srs` set to the bare `+proj=topocentric ...` string, or to
  the whole `+proj=pipeline ...` string, both fail the same way
  (`Object is not a SingleCRS` for the latter). `filters.projpipeline`'s
  `coord_op` option runs an arbitrary PROJ pipeline directly instead of
  negotiating a CRS pair — that's what `lidarPipelineStages.ts` uses. Its
  pipeline also needs an explicit `+proj=unitconvert +xy_in=deg +xy_out=rad`
  first step: PROJ pipelines run in radians, unlike `cct`'s CLI convenience
  wrapper (used above) which silently converts degree input.
- **Punktsky LAS files carry no embedded CRS.** `filters.reprojection`
  refuses to run with `PROJ: ... source data has no spatial reference and
none is specified with the 'in_srs' option` unless told one — every
  `readers.las` stage needs `default_srs: 'EPSG:25832'` (this table's
  Tile CRS).
- **`writers.text` quotes its header by default.** `quote_header` defaults
  to `true`, so a `format: csv` writer's first line reads `"X","Y","Z",...`
  — `readPdalCsv` checks `PDAL_CSV_COLUMNS` byte-for-byte, so the pipeline
  must set `quote_header: false` explicitly.

## Prerequisite versions (verified 2026-09-03)

| Tool                   | Version                       |
| ---------------------- | ----------------------------- |
| `pdal`                 | 2.10.2 (git-version: Release) |
| `gdalinfo`             | 3.13.3 "Iowa City"            |
| `cs2cs` / `cct` (PROJ) | 9.8.1                         |

`pdal --drivers` lists `readers.las`, `filters.colorization`,
`filters.sample`, and `writers.text`.
