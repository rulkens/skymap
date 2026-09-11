# Skråfoto — Dataforsyningen oblique aerial harvest (Søndermarken)

| Field       | Value                                                                      |
| ----------- | -------------------------------------------------------------------------- |
| Dataset     | Skråfotos 2025 (`skraafotos2025`) — oblique + nadir aerial photography     |
| Licence     | CC BY 4.0 — credit **Klimadatastyrelsen** (see "Licence" below)            |
| Service     | Skråfoto STAC API v1.0 (`POST /search`)                                    |
| Endpoint    | `https://api.dataforsyningen.dk/rest/skraafoto_api/v1.0/search`            |
| Image CDN   | `https://skraafoto-cdn.dataforsyningen.dk/…/<itemId>.tif` (COG, from STAC) |
| Camera CRS  | EPSG:25832 (ETRS89 / UTM zone 32N), heights DVR90                          |
| Flight date | 2025-04-27 (single flight over this bbox)                                  |
| Harvested   | 2026-09-10 (306 frames, `npm run fetch-skraafoto`)                         |

Feeds the scene-workbench Gaussian-splat bake (`tools/fetch/fetchSkraafoto.ts`
→ `tools/scene-recon/bakeSplats.ts`): downsampled frames plus their
photogrammetric exterior/interior orientation, converted to a COLMAP model and
trained by `brush-cli`.

Both CLIs take `--group <id>` (default `soendermarken`); the ids live in
`tools/scene-recon/groups/sceneGroupFromArgv.ts`.

## Layout

```
data/raw/skraafoto/<collection>/<itemId>.{json,jpg}            whole-frame groups
data/raw/skraafoto/<collection>/<groupId>/<itemId>.{json,jpg}  cropped groups
```

Gitignored (only this README is committed). Registered as `skraafoto.dir` /
`skraafoto.readme` in `tools/utils/io/rawDataRegistry.ts`; the collection
subdirectory name comes from the group's `skraafoto.collection`.

A whole-frame harvest is keyed by collection alone — its pixels depend on
nothing but the flight, so every whole-frame group shares one download. A
**cropped** group gets its own subdirectory: its JPEGs carry the same item ids
but hold a different part of each frame, and would otherwise overwrite the
shared harvest. `tools/utils/skraafoto/skraafotoHarvestDir.ts` is the one place
that rule lives.

## Collection and query

`skraafotos2025` is the forår-2025 flight, matching the vintage the LiDAR
colorization already uses. The search body is the group's own bbox:

```jsonc
{ "collections": ["skraafotos2025"], "bbox": [12.51, 55.662, 12.55, 55.678], "limit": 1000 }
```

**306 items** over that bbox (measured 2026-09-10), all dated 2025-04-27:
70 nadir, 62 north, 60 south, 59 east, 55 west. The `soendermarken-crop-2019`
group searches its own small crop box against **`skraafotos2019`** instead —
**106 items**, all dated 2019-06-23 (harvested 2026-09-11): 20 nadir, 23 north,
24 south, 18 east, 21 west. That flight is an UltraCam Osprey at 0.10 m GSD, so
its frames are neither the same shape nor the same size as 2025's (nadir
13470 x 8670, obliques 7700 x 10300 against 14144 x 10560); nothing reads a
sensor dimension that isn't the item's own. `limit` is a flat cap, not a
page size — the fetcher warns if the result count reaches it, because a
truncated harvest would otherwise train silently on a partial frame set.

## Credentials — two different keys

Skråfoto uses Dataforsyningen's **self-service token** ("Administrer token til
webservices og API'er" on dataforsyningen.dk, user-set expiry). This is a
**separate credential** from the Datafordeler `apiKey` the DHM harvest uses
(`data/raw/dhm/README.md`); they are not interchangeable.

| Keychain service                | Used by                               |
| ------------------------------- | ------------------------------------- |
| `skymap-dataforsyningen-apikey` | skråfoto STAC API (this harvest)      |
| `skymap-datafordeler-apikey`    | DHM Punktsky Fildownload (`fetchDhm`) |

Read in-process via `security find-generic-password -w`
(`tools/utils/io/readKeychainSecret.ts`). It travels **only** as a `token:`
request header, or as `GDAL_HTTP_HEADERS` for the `gdal_translate` subprocess —
never in a URL, never in argv (`ps` would show it), never in a log line. Every
error string passes through `redactSecret` first.

## Licence

The collection's own STAC `license` field reads `"various"`, which is not a
licence identifier — its `rel: "license"` link resolves the ambiguity, pointing
at Klimadatastyrelsen's terms page, and that is the authority for this data:

> CC BY 4.0 licensen gælder for frie geografiske data
> …
> Du skal kreditere Klimadatastyrelsen på et passende sted

— <https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/vilkaar-og-priser>
(CC BY 4.0 since 2024-05-16; data downloaded before that date stays on the
older terms). The page lists `Klimadatastyrelsen`, `KDS`,
`Klimadatastyrelsen CC BY 4.0` and `(CC BY 4.0) Klimadatastyrelsen` as
acceptable credit strings. **Attribute as `Skråfoto © Klimadatastyrelsen
(CC BY 4.0)`**, matching the shape of the DHM attribution beside it.

Provider names in the API are stale in both directions and are not the credit
line: the collection lists `KDS` (host, licensor), while each item still lists
`SDFI` (the pre-July-2024 name for the same agency) as licensor and `AVT` as
the flight producer.

## Window recipes

One `gdal_translate` per frame, reading the COG's own overview pyramid over
`/vsicurl/` — no whole-file download:

```
gdal_translate /vsicurl/<assets.data.href> -srcwin <x0> <y0> <w> <h> -outsize <w'> <h'> -b 1 -b 2 -b 3 -of JPEG <dest>
```

`-b 1 -b 2 -b 3` keeps only the colour bands: harvests taken before that flag
went in hold four-band JPEGs, which `bake-mesh`'s staging transcode re-reads
band-wise on the way into the reconstruction.

`tools/scene-recon/poses/frameWindow.ts` computes `<x0> <y0> <w> <h>` and the
output size, and is the **only** place that decides them — `bakeSplats`
recomputes the same window from the same STAC item to scale the pose
intrinsics, so nothing is recorded on disk to drift.

**Whole frame** (no `groundMmPerPx` on the group): the full raster, scaled so
the **long edge is 1920 px** — ~740 mm/px on the ground, which is what makes
those splats blurry. Measured on `2025_84_40_5_0052_00001969_100mm`:
`proj:shape` `[14144, 10560]` → `-outsize 1433 1920`, 710 KB, **5.6 s** — so a
full 306-frame harvest is tens of minutes, not hours, and is bounded by request
latency rather than bandwidth.

**Crop** (`groundMmPerPx` set, e.g. `soendermarken-crop`'s 200): the group's
bounds box, swept -10..+50 m in the group's ENU frame so ground, buildings
and treetops all fall inside, projected through the frame's own
collinearity into native pixels; the pixel bbox padded 2%, clamped to the
frame, and downsampled only as far as `groundMmPerPx` asks. The native
resolution it scales from is the box's **ground diagonal over its projected
diagonal**, not a nominal GSD — an oblique's pixels cover more ground than a
nadir's, and both are being asked to resolve the same box. `scale` never
exceeds 1: the COG's own pixels are the ceiling. Frames whose window lands
off-frame, behind the camera, or under 64 px on a side are skipped and counted.

On the two fixture frames, `soendermarken-crop`'s 258 x 183 m box at 200 mm/px
comes out as:

| fixture                             | `-srcwin`             | `-outsize` | native mm/px |
| ----------------------------------- | --------------------- | ---------- | ------------ |
| `..._1_0049_00002495_100mm` nadir   | `9381 5346 2029 2759` | `973 1323` | ~96          |
| `..._5_0052_00001969_100mm` oblique | `3667 2666 2826 1861` | `1372 904` | ~97          |

Both drop to ~48% of native, against the whole-frame recipe's 9-14%.

Changing a group's `bounds` or `groundMmPerPx` invalidates its harvest.
`bakeSplats` reads each JPEG's SOF dimensions and refuses to train if they
disagree with the recomputed window — delete that group's harvest directory and
re-run `npm run fetch-skraafoto -- --group <id>`.

## Landmines

- **`proj:shape` is `[rows, cols]`.** STAC states height first, width second —
  the reverse of `-outsize`'s `<w> <h>` and of `pers:interior_orientation`'s own
  `sensor_array_dimensions`, which is `[width, height]` (`[10560, 14144]` for
  the same frame). Swapping them transposes every frame the trainer sees.
- **`pixel_spacing` is an array, not a scalar.** Live items report
  `pixel_spacing: [0.00376, 0.00376]` (mm, x then y), not a single number.
  A scalar read yields `NaN` focal lengths in pixels, silently.
- **The image CDN needs no token.** A `gdal_translate` of the same href with
  `GDAL_HTTP_HEADERS` unset succeeds (verified 2026-09-10) — only the STAC API
  itself checks the token. The header is still sent, so an access change on the
  CDN doesn't break the harvest overnight; don't "simplify" it away.
- **GDAL writes a `.aux.xml` sidecar by default.** `GDAL_PAM_ENABLED=NO` keeps
  the output directory to exactly the `.json`/`.jpg` pair the resume check and
  the COLMAP model builder both enumerate.
- **Resume is presence-only, and the write order is what makes that safe.**
  Both `<itemId>.json` and `<itemId>.jpg` present ⇔ that item succeeded. Unlike
  the DHM LAS tiles, no header check is needed: `gdal_translate` writes to
  `<dest>.tmp` and is renamed only on exit code 0, and the **item JSON is
  written last, after the JPEG lands**. A failed or interrupted frame therefore
  never leaves a `.json` behind — which matters because the COLMAP model builder
  and `bakeSplats` enumerate this directory by `*.json`, and a JSON without its
  JPEG would be a frame the trainer cannot open. The reverse leftover (a JPEG
  with no JSON, from an interrupt in the sub-millisecond window between the two
  writes) is invisible to that enumeration and is re-fetched on the next run.
  Don't "tidy" the JSON write back to the top of the function.

## Prerequisite versions (verified 2026-09-10)

| Tool             | Version                 |
| ---------------- | ----------------------- |
| `gdal_translate` | GDAL 3.13.3 "Iowa City" |
| `cct` (PROJ)     | ships with GDAL         |

`cct` is new to the harvest: the crop is computed in the group's ENU frame, so
every camera centre goes through the same `+proj=topocentric` pipeline the bake
uses. Homebrew's `gdal` pulls `proj` in, so a machine that can run
`gdal_translate` already has it.
