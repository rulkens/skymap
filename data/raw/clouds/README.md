# Live cloud bake inputs

`cache/` (gitignored) holds the cloud bake's downloads, one directory per baked day
(`cache/<YYYY-MM-DD>/{granules,mosaics,geo,probe}/`); deleting a day directory evicts it. The bake
is `tools/cloud-bake-rs`, run with `npm run bake-clouds`; see its [README](../../../tools/cloud-bake-rs/README.md).

The ice mask comes from the Blue Marble 2004 month matching the bake date. Those twelve equirects live
in `data/raw/textures/` (`npm run fetch-cloud-inputs`; see its [README](../textures/README.md)), and the
static fallback cloud map is `textures.earthClouds` there too.

## Upstreams and licences

| Upstream                                                          | Data                                                     | Terms                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| NASA GIBS (`gibs.earthdata.nasa.gov`)                             | VIIRS (NOAA-20 / Suomi NPP) swaths and mosaic; GOES-East | NASA open data: free including commercial use, with credit                                                     |
| NASA GIBS, Himawari layer                                         | Himawari frames                                          | JMA terms unverified; flagged medium risk                                                                      |
| EUMETView (`view.eumetsat.int`)                                   | Meteosat MTG and IODC WMS visualisations                 | CC BY 4.0; credit "Contains modified EUMETSAT Meteosat data 2026" (the year of the data)                       |
