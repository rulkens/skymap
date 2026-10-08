# JPL Horizons vectors

Input to `npm run build-ephemeris-corrections`, which fits each body's `Horizons − Kepler`
residual into `src/data/bodies/ephemerisCorrections.generated.ts`. The CSVs are gitignored;
regenerate with `npm run fetch-horizons`.

- **Upstream:** JPL Horizons API, `https://ssd.jpl.nasa.gov/api/horizons.api` (JPL DE ephemeris; public domain, NASA/JPL).
- **Body table:** `tools/bodies/horizonsBodies.ts` (`HORIZONS_BODIES`). Each row names its target, its centre, its span, its raw step in minutes and `vectors` (`position` or `state`). The fit's per-body `fitStep` and out-of-span policy live in `tools/bodies/fittedBodies.ts` (`FITTED_BODIES`).
- **Files:** `<centre>/<target>.csv`, columns `jd,x_km,y_km,z_km` (`vectors: 'state'` rows add `vx_kms,vy_kms,vz_kms`), from JD 2415020.5 (1900-01-01) to 2488069.5 (2100-01-01) at the row's step.
- **`500@10/`** (Sun body centre), 1-day step, ~3 MB each: Mercury `199`, Venus `299`, Earth–Moon barycentre `3`, then the system barycentres `4`–`8` (Mars through Neptune).
- **`500@599/`** (Jupiter body centre): Io `501` (144 min), Europa `502` (288 min), Ganymede `503` (480 min), Callisto `504` (1 day).
- **`500@699/`** (Saturn body centre): Mimas `601` (80 min), Enceladus `602` (120 min), Tethys `603` (160 min), Dione `604` (240 min), Rhea `605` (360 min), Titan `606` (720 min), Iapetus `608` (1 day).
- **`500@899/`** (Neptune body centre): Triton `801` (480 min, retrograde), Proteus `808` (96 min).
- **`500@799/`** (Uranus body centre): Miranda `705` (120 min), Ariel `701` (180 min), Umbriel `702` (360 min), Titania `703` and Oberon `704` (720 min). Puck `715` is not fetched: Horizons has no ephemeris for it before 1900-01-02.
- A moon's step is ≤ P/16 and divides a day, so every piece below starts on the row's grid. The moons total ~8.5M rows, ~550 MB.

## Query

Every row's span is cut at 50-year boundaries (the 1900–2100 rows give 1900–1950, 1950–2000,
2000–2050, 2050–2100; a span starting mid-chunk is clipped to its start), each retried up to five times. Horizons caps one answer at ~90k rows, so a fine-step moon splits
each chunk into equal whole-step pieces of ≤ 89,000 rows (`YYYY-MM-DD HH:MM` start and stop).
Each query includes both endpoints, so the shared boundary row is dropped once when merging.
`npm run fetch-horizons -- io mimas` fetches only the named rows.

```
format=json
COMMAND='<target>'
OBJ_DATA='NO'
MAKE_EPHEM='YES'
EPHEM_TYPE='VECTORS'
CENTER='<centre>'      # e.g. '500@10', the Sun body centre
REF_PLANE='FRAME'      # equatorial ICRF, the scene's world frame
TIME_TYPE='UT'         # UT1 before 1962, UTC after: the app's simDays is UTC
OUT_UNITS='KM-S'
CSV_FORMAT='YES'
VEC_TABLE='1'          # position only; '2' (position + velocity) for `vectors: 'state'` rows
START_TIME='<chunk start>'
STOP_TIME='<chunk stop>'
STEP_SIZE='<step> m'   # stepDays in whole minutes (1440 m for a 1-day row)
```

Planets fetched 2026-10-04, Jupiter and Saturn moons 2026-10-05, Neptune and Uranus moons 2026-10-05.
