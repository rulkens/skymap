# SBDB — JPL Small-Body Database, asteroid diameters

`diameters.json`: every numbered asteroid the JPL Small-Body Database gives a diameter, with its
geometric albedo. MPCORB carries only H and G, so this is what puts a measured size on an asteroid's card.
Most rows come from NEOWISE thermal fits; a few from radar, occultations and spacecraft (each row's
reference is on its SBDB page, not in this file).

- **Upstream:** the SBDB Query API, <https://ssd-api.jpl.nasa.gov/sbdb_query.api> (docs:
  <https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html>, constraint syntax:
  <https://ssd-api.jpl.nasa.gov/doc/sbdb_filter.html>). JPL updates the database continuously.
- **Query:** `sb-kind=a` (asteroids), `sb-ns=n` (numbered), `sb-cdata={"AND":["diameter|DF"]}` (diameter
  defined), `fields=pdes,diameter,albedo,diameter_sigma`, `sort=spkid`. The gateway answers the whole
  query with a 502, so it is paged with `limit=50000` and `limit-from`, and the pages joined.
- **Fetch:** `npm run fetch-sbdb-diameters` (`tools/fetch/fetchSbdbDiameters.ts`). A file that matches its
  `.sha256` sidecar is kept; `-- --force` fetches again and rewrites the sidecar.
- **Consumer:** `npm run build-asteroids` joins it to MPCORB by number and writes
  `asteroids/v1/asteroid-diameters.bin`.
- **Copy behind the first bake:** fetched 2026-11-16, 135,476 rows (numbers 1…893,584, no duplicates, 925
  without an albedo), 4.5 MB, sha256 in `diameters.json.sha256`.

## Layout

The API's own response shape, with the pages' `data` joined:

```
{"signature":{"version":"1.0","source":"NASA/JPL SBDB (Small-Body DataBase) Query API"},
 "fields":["pdes","diameter","albedo","diameter_sigma"],
 "data":[["1","939.4","0.090","0.20"], …],
 "count":135476}
```

Field meanings from the Query API docs (read 2026-11-16), verbatim: `pdes` "primary designation (for
numbered asteroids, this is the IAU number)", `diameter` "effective body diameter (km)", `albedo`
"geometric albedo", `diameter_sigma` "1-sigma formal (or estimated) uncertainty in diameter". Values are
strings; a missing one is `null`.

## Terms

No licence or redistribution terms are stated on the API pages or the SSD "about" page (read
2026-11-16). The SSD/CNEOS API fair-use policy, <https://ssd-api.jpl.nasa.gov/>, verbatim excerpts:

```
Automated processes must not make unnecessarily frequent, repetitive, or redundant requests. Where
practical, applications should cache and reuse results rather than repeatedly requesting unchanged or
predictably changing data.
You agree to submit only one API request at a time (no simultaneous requests).
Applications making automated connections must provide a valid, application-specific User-Agent request
header that includes correct product name, version, and contact information.
You may not embed these APIs in your website (per NASA CORS policy).
```

The fetcher sends one request at a time, backs off on errors, identifies itself with a User-Agent and
contact address, and is run by hand. The app never calls the API: it reads the baked file from our CDN.

Citation, from <https://ssd.jpl.nasa.gov/about/> (read 2026-11-16), verbatim:

```
For referencing the data downloaded from the SSD website, please use the following citation:
“NASA/JPL Solar System Dynamics. Data retrieved on (Downloaded Year, Month, Date). (Title of the Page). https://ssd.jpl.nasa.gov”
```
