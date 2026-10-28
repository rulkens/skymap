# CelesTrak GP orbit data

Input to `npm run build-satellites`, which writes `public/data/satellite-catalog/v1/satellites.bin`
(layout in `tools/utils/io/writeSatelliteCatalog.ts`). The JSON files are gitignored; regenerate with
`npm run fetch-celestrak`. In production nobody runs either by hand: the daily
`.github/workflows/satellites.yml` fetches, builds and uploads to R2 (docs/DEPLOY.md).

- **Upstream:** CelesTrak (T.S. Kelso), `https://celestrak.org/NORAD/elements/gp.php`, mean elements
  derived from the US Space Force catalog. No licence or republishing terms are stated
  (`https://celestrak.org/usage-policy.php`, checked 2026-10-28); see ATTRIBUTIONS.md.
- **Groups:** `tools/satellites/celestrakGroups.ts` (`CELESTRAK_GROUPS`): `active`, the three debris
  clouds `fengyun-1c-debris`, `iridium-33-debris`, `cosmos-2251-debris`, `analyst`, `last-30-days`.
  CelesTrak has no full-catalog group and none for rocket bodies.
- **Files:** `<group>.json`, an array of OMM records (`OBJECT_NAME`, `OBJECT_ID`, `EPOCH` in UTC with
  microseconds and no zone suffix, `MEAN_MOTION` rev/day, `ECCENTRICITY`, angles in degrees, `BSTAR`,
  `EPHEMERIS_TYPE`, `NORAD_CAT_ID`, ...). Field definitions:
  `https://celestrak.org/NORAD/documentation/gp-data-formats.php`.
- **Size on 2026-10-28:** 20,064 objects after de-duplication (16,822 active, 2,672 debris, 570
  other), about 8 MB of JSON.

## Query

```
https://celestrak.org/NORAD/elements/gp.php?GROUP=<group>&FORMAT=json
```

## Download policy

CelesTrak updates GP data every 2 hours and enforces one download per update per client: a repeat
download answers 403, and more than 50 HTTP errors in 2 hours or over 100 MB a day gets the IP
firewalled. `fetchCelestrak` therefore keeps a file younger than 2 hours (`--force` overrides) and
treats a 403 as "keep the copy on disk". The daily Action makes six requests a day.
