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
| Harvested   | 2026-09-10 (search confirmed live; frames fetched by task 8)               |

Feeds the scene-workbench Gaussian-splat bake (`tools/fetch/fetchSkraafoto.ts`
→ `tools/scene-recon/bakeSplats.ts`): whole downsampled frames plus their
photogrammetric exterior/interior orientation, converted to a COLMAP model and
trained by `brush-cli`.

## Layout

```
data/raw/skraafoto/<collection>/<itemId>.json   STAC item, verbatim
data/raw/skraafoto/<collection>/<itemId>.jpg    1920-long-edge JPEG
```

Gitignored (only this README is committed). Registered as `skraafoto.dir` /
`skraafoto.readme` in `tools/utils/io/rawDataRegistry.ts`; the collection
subdirectory name comes from `SOENDERMARKEN.skraafoto.collection`.

## Collection and query

`skraafotos2025` is the forår-2025 flight, matching the vintage the LiDAR
colorization already uses. The search body is the group's own bbox:

```jsonc
{ "collections": ["skraafotos2025"], "bbox": [12.51, 55.662, 12.55, 55.678], "limit": 1000 }
```

**306 items** over that bbox (measured 2026-09-10), all dated 2025-04-27:
70 nadir, 62 north, 60 south, 59 east, 55 west. `limit` is a flat cap, not a
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

## Downsample recipe

One `gdal_translate` per frame, reading the COG's own overview pyramid over
`/vsicurl/` — no whole-file download:

```
gdal_translate /vsicurl/<assets.data.href> -outsize <w> <h> -of JPEG <dest>
```

`<w>,<h>` scale `proj:shape` so the **long edge is 1920 px**. Measured on
`2025_84_40_5_0052_00001969_100mm`: `proj:shape` `[14144, 10560]` → `-outsize
1433 1920`, 710 KB, **5.6 s** — so a full 306-frame harvest is tens of minutes,
not hours, and is bounded by request latency rather than bandwidth.

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
- **Resume is presence-only.** Both `<itemId>.json` and `<itemId>.jpg` present
  means done. Unlike the DHM LAS tiles, no header check is needed: the fetcher
  writes to `<dest>.tmp` and renames only on exit code 0, so a failed or
  interrupted `gdal_translate` never leaves a file under the final name.

## Prerequisite versions (verified 2026-09-10)

| Tool             | Version                 |
| ---------------- | ----------------------- |
| `gdal_translate` | GDAL 3.13.3 "Iowa City" |
