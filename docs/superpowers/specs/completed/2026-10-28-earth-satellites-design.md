# Earth satellites

Status: shipped 2026-10-29 as steps 1–3 (#953 pipeline, #954 Layer, #955 camera follow of transient
positions, #956 pick, search, cards and class toggles). Step 4 (orbit rings) was not built and is in the
backlog. §6 was a hand-run pass; `refactor-ground` ran retroactively before #956 landed. What changed
from the text below:

- The file is `satellites.satg`, not `satellites.bin`: every data format has its own extension.
- §5.2: the Action uploads with an R2 token scoped to `skymap-data` over the S3 API (`aws s3 cp`),
  in a second job with no checkout and no npm. `docs/DEPLOY.md` "Satellite catalog" has the secrets.
- §5.5: the asset row also demands while the search palette is open or a satellite is selected, so a
  satellite can be searched for, and followed, from anywhere.
- Satellites start off; every class starts on. A satellite link opened with satellites off switches
  them on and arrives (`docs/superpowers/specs/2026-10-29-selection-driven-layers-design.md` §4).
- Following a satellite: core re-extracts the selected or focused satellite's row every frame and
  places it in the frame's body states (#974, which replaced #955's `transientPositions` registry);
  satellites are still never `bodies` rows (§2).

## 1. Intent

Skymap shows the Voyagers, Hubble and the rovers as hand-placed meshes, but none of the ~20,000 tracked
objects around Earth. Seen from a few Earth radii out, they are some of the most striking things a
student can see: the low-Earth-orbit (LEO) shell, the Starlink trains, the geostationary (GEO) ring, the
debris clouds from three collisions.

A new `satellites` Layer draws every object CelesTrak publishes as a point, positioned by SGP4 from orbit
data refreshed daily. A user can find a satellite in the palette, pick it, and read its card.

## 2. Goals, non-goals, anti-goals

**Goals**

- About 20k objects (§5.1) drawn as points around Earth, correct to a few km at the data's epoch.
- The data refreshes daily with no hand step. Stale data fades the Layer out on its own (§5.3).
- Points while time runs at human rates; orbit rings once time runs fast (§5.4).
- Pick, palette search and an InfoCard: name, NORAD and COSPAR ids, class, altitude, period, inclination,
  data epoch.
- Classes (active payloads, debris, other) toggle in Settings.
- Nothing runs unless the Layer is drawing: no download, no worker and no sweep while it is off or the
  camera is far from Earth (§5.5).

**Non-goals**

- Satellites around other planets, at Lagrange points, or in cruise. Those are `/add-mission` rows or
  sampled tracks, a separate effort.
- Historical replay. Sim time far from the epoch shows nothing (§5.3).
- Exact launch and decay instants. Inside the ±14-day window an object may appear a few days before
  launch or linger after re-entry. SATCAT dates fix that later if it matters.
- Meshes. Hubble keeps its `/add-mission` mesh, and the point layer skips Hubble's NORAD id.

**Anti-goals**

- 20k `bodies` rows. Satellites are data, not scene bodies. The body tables, the focus graph and
  `deriveBodyStates` never see them.
- SGP4 on the main thread, or per frame at real-time rates.
- A generic worker pool or "live data" framework built for this one consumer.

## 3. Shape

```
GitHub Action (daily) ── CelesTrak OMM JSON ──▶ tools/satellites/buildSatellites.ts ──▶ R2 satellite-catalog/v1/satellites.bin
                                                                                             │ fetch (max-age 1 h)
src/layers/satellites/
  load/satellitesAsset.ts       `assets?` row: demand = shown and near Earth; the committed value is the
                                worker, and `onRelease` terminates it
  load/satellitesWorker.ts      json2satrec once at load, then one SGP4 sweep per request → TEME pos/vel
  render/satellitePointRenderer.ts   additive dots, positions extrapolated in the vertex stage
  render/satelliteRingRenderer.ts    one analytic ring per object from its mean elements
  passes/satellitesPass.ts      NEAR0 POST_FOREGROUND hdr line, beside the mission trails
  present/  search, selection row, pick id   ui/  detail card, settings section
```

## 4. How it works

**Data file.** `satellites.bin` (magic `SATG`, under `satellite-catalog/v1/`) holds one record per
object: the SGP4 mean elements at f64 (epoch, mean motion, eccentricity, inclination, node, argument of
perigee, mean anomaly, B*), the NORAD id, a class byte, and the name and COSPAR id as strings. About
2.3 MB for 20k objects, 1.1 MB gzipped. The header carries the fetch time, which drives §5.3.

**Propagation.** The worker builds satrecs once (`satellite.js` `json2satrec`, WGS-72, opsmode `'i'`),
then sweeps every object when asked (§5.5). Each sweep posts transferred Float32 arrays of TEME position
and velocity in km and km/s, relative to the sweep's instant, plus the sweep's sim time. An object whose
propagation errors (decayed, perigee below the surface) is flagged and not drawn.

**Between sweeps.** The vertex stage extrapolates `p + v·dt − ½·GM·p/|p|³·dt²` in TEME. Measured worst
case over 2,000 LEO objects: 0.78 m after 1 s, 2.9 m after 4 s.

**Frame.** Each frame the CPU composes one f64 Mat3: TEME → Earth-fixed by GMST, then Earth-fixed →
world by Earth's `orientationForBody`. After #947 that is the IERS ERA plus precession, so the two agree
to arcseconds, and satellites stay on the same ground tracks as Skymap's globe. The pass draws in the
NEAR0 hdr frame with the trails' rebased hi/lo view-projection about Earth's position. It is not a
body-m row, because Earth's row exists only while Earth's disc is on screen (`visibleSlabBodies.ts`),
and GEO points with Earth out of frame would vanish. Points behind Earth fade by the sampled
`foreground:0` depth plus `sceneOccluderSpheres`, as the trails do.

**Measured cost** (30k objects, CelesTrak data of 2026-10-28, from a scratch benchmark; step 2 re-measures in the app):

| | JS sweep | WASM bulk sweep |
| --- | --- | --- |
| Chromium desktop | 18 ms | 10 ms |
| Chromium, CPU 4× slower (phone stand-in) | 83 ms | 45 ms |

At 1 Hz the JS sweep is about 2% of a desktop core and 8% of a slow phone's, so JS ships and WASM stays
the fallback if `npm run phone` disagrees.

## 5. Rulings

1. **Source: CelesTrak groups, no account.** These are `active`, the three debris groups (`fengyun-1c-debris`,
   `iridium-33-debris`, `cosmos-2251-debris`), `analyst` and `last-30-days`, de-duplicated by NORAD id.
   That is ~20k objects with no rocket bodies. Space-Track's full ~30k catalog needs an account and their
   approval to redistribute, so it is a follow-up. CelesTrak states no republishing terms, so the
   ATTRIBUTIONS.md entry is "Ask the holder" until CelesTrak confirms a daily copy on R2 is fine. The Action
   downloads each group once a day, inside CelesTrak's one-download-per-update policy.
2. **Refresh: a scheduled GitHub Action → R2.** It runs `npm run build-satellites` and uploads `satellites.bin` to a
   fixed key with `Cache-Control: max-age=3600`, outside the manifest and `DATA_FAMILIES`, the way the
   hand-uploaded site video is. It needs one new secret, an R2 write token. A failed run fails visibly in
   GitHub. Dev runs the same script into `public/data/satellites/` (gitignored, untracked by the drift guard).
3. **Time window: ±14 days around the fetch time, then fade.** The Layer fades over the last two days of
   the window, and the card shows the epoch. The same rule handles a broken refresh: data older than 14
   days fades itself out, rather than showing positions that are off by hundreds of km.
4. **Fast time: rings, not points.** Once one worker interval covers more than about a minute of sim time,
   extrapolation stops holding. Points fade out and each object draws its mean-element ellipse instead,
   with node and perigee turned at the satrec's own J2 rates (`nodedot`, `argpdot`), so a ring needs only
   static data and the sim time. The worker sends the ring parameters once. The exact detent is the
   builder's, measured.
5. **The worker exists only while the Layer is active, and sweeps only while it draws.** Two gates:
   - *Existence* is the demand loop's, like the body textures' proximity loads. The `satellites.bin` asset row
     demands while the show toggle is on and the camera is inside a load radius of Earth, and releases when
     the toggle goes off or the camera passes a larger evict radius (hysteresis, so hovering at the edge
     does not thrash). Loading fetches the file and spawns the worker; the committed value is the worker
     handle, so `onRelease` terminates it and frees its ~20k satrecs. The load radius sits outside the
     distance where the Layer fades in, so the data is resident before the first point shows. A user who
     never flies near Earth never downloads the file.
   - *Work* is pulled, not pushed. The worker never sweeps on a timer. The pass asks for a sweep only on a
     frame where it actually draws points (faded in, inside the time window, below the rings detent) and the
     last sweep is about a second old in real time or the sim clock has jumped. So a hidden tab (no frames),
     a paused clock (one sweep, then extrapolation with `dt = 0`), the rings regime and a time outside the
     window all cost nothing. At most one sweep is in flight.

## 6. Ground preparation

None needed, because each candidate is already a seam or belongs to this Layer alone:

- **Long-lived worker.** `runDisposableWorker` is one-shot by design, and its docblock says a reusable
  worker is "a different abstraction". The satellites worker is the first and only one, so it lives in the
  Layer (`load/`) and is not generalised (§2 anti-goals). Its lifetime needs no new seam: an `assets?` row's
  demand and release predicates plus the slot's `onRelease` are exactly the "load near, free far" lifecycle
  the body textures already use (§5.5).
- **Point renderer.** `bodyGlintRenderer` has a fixed capacity, and `starPointRenderer` uploads static
  positions. Neither extrapolates in the vertex stage, so the Layer owns its renderer, mirroring
  `starPointRenderer`'s upload-then-draw split. Its pick twin mirrors `starCatalogPickRenderer`, under a new
  `Source` code (37+, append-only).
- **Distance gate.** `BodyRegionId` has no Earth region, and regions anchor at the J2000 snapshot, so an
  Earth band would sit in the wrong place. The pass gates on the camera's live distance from Earth, the way
  foreground passes gate on `FOREGROUND_MAX_DISTANCE_MPC`. If a second Earth-relative Layer appears, that is
  the moment to add a live region.
- **Daily file.** `dataUrl()` passes unmanifested paths through unchanged (`dataManifest.ts`). The fixed-key
  file needs no change to the manifest or `syncR2`.
- **Body Layers spec.** Its open P5 (a Layer slab row duplicating core's Earth row) is avoided by not
  authoring a slab row (§4). Its pending `body` PR edits `frameSections.ts`. The only contact is the new
  pass name, which must stay unique.

## 7. Packaging and order

1. `tools/satellites/` writer + parser + the Action, with a unit test of the round-trip. The file is
   unused until step 2.
2. The Layer: worker, points, pass, visibility toggle, the fade window.
3. Pick, palette search (`class: 'catalog'`, names only into Redux), detail card, class toggles.
4. Orbit rings for fast time.

Each step is its own PR (ruled 2026-10-28: step 1 does not ride with step 2).

## 8. Left to the builder

- The rings detent (§5.4) and the ring vertex count, both measured with `npm run perf`.
- Point size and brightness by class, and the camera distance where the Layer fades in, by eye check.
- Whether the worker's sweep rate adapts to the time rate between real time and the rings detent.
- Colour palette, per the dataviz and UI conventions.

## 9. Adjacent findings (backlog, not this effort)

- Space-Track's full catalog (rocket bodies, all debris): an account plus written approval to redistribute.
- Craft around other planets and at Lagrange points: `/add-mission` rows, plus generalising
  `buildSpacecraftTracks` beyond Voyager for halo orbits.
