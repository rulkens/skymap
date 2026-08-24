# Camera-pivot research (2026-08-24)

Research input for the globe-anchored surface-camera pivot: how Cesium, OpenSpace,
and MapLibre each anchor a camera to a rotating body's surface, and where skymap's
current camera seams sit relative to those strategies.

Reading order: [DESIGN-INPUT.md](DESIGN-INPUT.md) first — it is the synthesis and
decision input for a grill session and spec. The notes files are its evidence base,
read on demand via its citations: [cesium-notes.md](cesium-notes.md),
[openspace-globebrowsing-notes.md](openspace-globebrowsing-notes.md),
[openspace-camera-notes.md](openspace-camera-notes.md),
[openspace-camera-comparison.md](openspace-camera-comparison.md),
[maplibre-kml-notes.md](maplibre-kml-notes.md),
[skymap-seam-map.md](skymap-seam-map.md).

Related: [`docs/grill-sessions/earth-local-slab-2026-08-21.md`](../../grill-sessions/earth-local-slab-2026-08-21.md)
is the paused predecessor design (camera-rebased, Earth-fixed f64 anchor, km/m units)
that this pivot design absorbs — DESIGN-INPUT.md treats its local-frame conclusion
as a given. [probe-findings.md](probe-findings.md) — measured feel-probe results on the
pre-pivot camera; empirical confirmation of DESIGN-INPUT.md §1's state-vector verdict
(rolled horizon, nadir heading degeneracy, latitude-dependent sky ceiling — all the
same missing thing).

Caveat: `skymap-seam-map.md`'s `file:line` references are a snapshot of branch
`earth-surface-navigation` as of this date, not necessarily `main`.
