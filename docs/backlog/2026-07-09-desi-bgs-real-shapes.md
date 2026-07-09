# DESI BGS real galaxy shapes

> **Backlog item** · `needs-verification` · area: Data
> **Promote to:** a spec once route (a) is verified.

## Problem

The DESI deep-cone source (spec `docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`, shipped on `feat/desi-deep-cone-spec`) renders every DESI row with the default 30 kpc diameter and the hashed fallback orientation — no galaxy in the cone has a real size or PA on screen.

## Current state (verified 2026-07-09)

The DR1 LSS clustering catalogs carry no shape columns at all. Checked against the local files: LRG (13 cols) and ELG/QSO (14-15 cols) are pure positions/z/clustering-weights; BGS (18 cols) adds five dereddened fluxes (`flux_g/r/z/w1/w2_dered`) but still no `SHAPE_R`, no ellipticity, no PA, no morphology column anywhere. This is the same column-set gap documented in the design spec's live-header-inspection correction.

Sizes exist upstream, just not in these files: DESI targeting is built on Legacy Surveys imaging, and the Tractor fits behind that imaging measure `SHAPE_R` (half-light radius), ellipticity components (e1/e2), and a per-source morphological model.

## Options

- **(a) The `*_full_HPmapcut` LSS files** (~10 GB total across tracers) carry more imaging columns than the lean clustering files this source currently fetches — but the shape columns must be **verified present** (live header inspection, not assumed from a README) before this gets spec'd, per the verify-external-data-before-spec convention. These are the same files the design spec rejected for flux columns on size/quality-filter grounds, so route (a) needs its own check independent of that prior finding.
- **(b) Legacy Surveys sweep files** cross-matched by `TARGETID` — definitive for shapes (this is the actual source of the Tractor fit), but a separate bulk imaging fetch outside the LSS pipeline.

## Scope note

Only worth doing for the BGS tracer (~10k rows in the current cone). Apparent size only reads visually in the near field during a fly-through — beyond ~1 Gpc every point is sub-pixel on screen, and LRG/ELG/QSO's z > 0.5 angular sizes are arcseconds regardless of the true physical size.
