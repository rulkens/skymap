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

**Rulings (2026-08-24):** the grill over DESIGN-INPUT §7 is complete; the decision
record is [`docs/grill-sessions/globe-camera-pivot-2026-08-24.md`](../../grill-sessions/globe-camera-pivot-2026-08-24.md)
(lands via PR #634). Where that transcript diverges from DESIGN-INPUT's
recommendations, the transcript wins. Divergences: units are **metres**, not km;
the regime band is **h/R ≈ 1.7 / 3.4** (whole-Earth-in-view), not the FW-E
values; the tilt ceiling runs **180° at ground → 0 at disengage** (sky reachable
via look mode); the camera state is **anchor-relative** (floating-origin anchor,
deep zoom in scope now); decision 10 flipped to **in scope** (tour/clip
endpoints and serialization go body-relative in this effort); the render slab is
**near-body generic** — all planets and moons ride per-body slabs in the first
landing, always-on, no activation handoff; delivery is **two sequenced specs**
(body slabs first, then the camera pivot).

Caveat: `skymap-seam-map.md`'s `file:line` references are a snapshot of branch
`earth-surface-navigation` as of this date, not necessarily `main`.
