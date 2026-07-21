# Multi-star sphere presence (resolved double systems)

**Surfaced:** 2026-07-21, designing presence-by-proximity (`fieldStarSphereLayer`).
Deliberately shipped single-sphere; this is the extension if a real double ever
matters.

## The gap

The layer draws ONE sphere — the nearest resolvable star (nearest-wins with
hysteresis). A second catalogued star inside its own sprite-dissolve band
(would-be sphere size 4–16 px, roughly 3–12 AU of camera distance for solar
radius at 1080p) has its point sprite faded/retired but gets no sphere: the
companion of a close pair goes invisible while the primary shows.

Why this is acceptable today: the window only opens for two Gaia records within
a few AU of each other. Gaia resolves pairs down to ~0.4–0.6 arcsec — a few AU
of separation even at 10 pc — so such pairs are vanishingly rare in the bin,
further thinned by magnitude subsampling. No known repro in the shipped data.

## Extension sketch

- `nearestResolvableStar` → `starsWithinRadius`: same expanded-box octree
  descent, return ALL hits within the OFF radius (bounded small; the radius is
  ~AU-scale).
- Layer keeps per-star hysteresis over a small present-set (≤K, K≈4) instead of
  one `PresentStar`; `draw`/`drawPick` loop the set — `starRenderer.draw` and
  `drawFlooredSpherePick` are already per-sphere calls, so the loop is the only
  change. Pick pass handles multiple spheres as-is (depth-tested nearest-wins).
- All spheres share the one representative solar radius (no per-star radii in
  the bin) — a true double renders as two identical suns.

Design bits to settle: K and whether the ON takeover rule stays nearest-only or
admits any star crossing ON (probably the latter once presence is a set).
