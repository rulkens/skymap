# JPL Horizons vectors

Input to `npm run build-ephemeris-corrections`, which fits each body's `Horizons − Kepler`
residual into `src/data/bodies/ephemerisCorrections.generated.ts`. The CSVs are gitignored;
regenerate with `npm run fetch-horizons`.

- **Upstream:** JPL Horizons API, `https://ssd.jpl.nasa.gov/api/horizons.api` (JPL DE ephemeris; public domain, NASA/JPL).
- **Body table:** `tools/bodies/horizonsBodies.ts` (`HORIZONS_BODIES`). Each row names its target, its centre, its raw step and its out-of-span policy.
- **Files:** `<centre>/<target>.csv`, columns `jd,x_km,y_km,z_km`, from JD 2415020.5 (1900-01-01) to 2488069.5 (2100-01-01) at the row's step.
- **`500@10/`** (Sun body centre), 1-day step, ~3 MB each: Mercury `199`, Venus `299`, Earth–Moon barycentre `3`, then the system barycentres `4`–`8` (Mars through Neptune).

## Query

Every target is fetched in four 50-year chunks (1900–1950, 1950–2000, 2000–2050, 2050–2100),
each retried up to five times. Each chunk includes both endpoints, so the shared boundary row is
dropped once when the chunks are merged.

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
VEC_TABLE='1'          # position only
START_TIME='<chunk start>'
STOP_TIME='<chunk stop>'
STEP_SIZE='<stepDays> d'
```

Planets fetched 2026-10-04.
