# IAU Gazetteer of Planetary Nomenclature — Moon

The USGS Astrogeology gazetteer's Moon centre points, public domain
(https://planetarynames.wr.usgs.gov/).

- **Download:** https://planetarynames.wr.usgs.gov/shapefiles/MOON_nomenclature_center_pts.zip
  (redirects to the `asc-planetarynames-data` S3 bucket), fetched 2026-11-07.
  Zip SHA-256 `73e2ee042a8f03683f9b3c9dd5d7d355b08dc7221a4b27e1715d7e441ae45ab6`.
- **Kept:** `MOON_nomenclature_center_pts.dbf` (SHA-256
  `5ad6fe7de58f2e63867d8a55389c1da87ab256d95c95d6333f907a5c0707638a`), 9,087 features.
- **Fields read:** `type` (`Crater, craters` and `Satellite Feature` for the crater table),
  `center_lat`, `center_lon` (degrees, east-positive, 0–360), `diameter` (km).
- **Consumer:** `tools/antique/moon/bakeMoonCraters.ts`.
