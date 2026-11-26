# BepiColombo around Mercury

**Readiness:** `blocked`. Parked by the owner on 2026-11-24 after the science-scout story `bepicolombo-mercury-orbit` (digest 2026-11-23) was checked against its sources.

**Trigger:** JPL Horizons re-fits the `-121` (MPO) track to post-insertion tracking. The header line `Data fit through …` must read later than 2026-11-21. A good second moment is after the orbiters separate (9–10 December 2026), when `-121` is MPO alone.

## What is known

- Capture into Mercury orbit was confirmed on 2026-11-21. The burn started at 18:24 UTC and ended early because of a software issue (Space.com, updated 2026-11-23). Neither ESA nor Space.com has published the orbit that resulted.
- Horizons' `-121` track (`bc_mpo_fcp_00243`) was "fit through 2026-Nov-17, prediction thereafter" when checked on 2026-11-24. Its capture orbit (about 625 × 52,900 km altitude, 2.45-day period, inclination ~90°) is what the full burn would have given.
- In that prediction the orbit steps down about every two weeks: period 2.45 d on 25 Nov, 0.34 d from mid-December, 0.18 d from mid-January, 0.098 d (2.4 h) from 10 March 2027. The plan after the short burn may differ.

## What stands in the way

1. **Orbit data.** No source carries the real post-burn orbit yet.
2. **One element row lasts days.** `orbiter()` holds a single Keplerian set. Either accept a row that is refreshed by hand at each step, or give Mercury-centred craft a sampled track; `kind: 'sampled'` is Sun-centred only today (see the backlog item "Craft around other planets and at Lagrange points").
3. **No model.** No public-domain textured model was found: NASA 3D Resources has none, ESA links only a viewer (`bepi.ideorum.com`), and the TurboSquid model (product 2205580) is paid and editorial-only. That licence excludes commercial use (the dome and kiosk contract work) and forbids shipping the model where it can be extracted, which a public web app that serves the mesh and its textures does; read the live terms before relying on this, the page could not be fetched on 2026-11-24. `/add-mission` forbids an untextured bake. Where the model comes from is decided when the build starts (owner, 2026-11-24).
4. **Unverified frame.** `orbiter()` has only been used around Earth. A Mercury row needs `REF_PLANE='B'` with Mercury's IAU pole, and the Horizons `VECTORS` position test from `/add-mission` to prove it.
5. **No orbit line.** Mesh bodies draw no trail by design, so the capture orbit itself would not show, only the craft.

## Refresh query

```
https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-121'&OBJ_DATA='YES'&MAKE_EPHEM='YES'&EPHEM_TYPE='ELEMENTS'&CENTER='500@199'&START_TIME='<from>'&STOP_TIME='<to>'&STEP_SIZE='12h'&REF_PLANE='B'&OUT_UNITS='KM-D'
```

`OBJ_DATA='YES'` prints the header with the fit date. JAXA's Mio has its own Horizons track once it separates.
