# In-scene thumbnail quality (SDSS / DSS branches)

> **Backlog item** · `needs-design` · area: Rendering
> **Promote to:** a spec when picked up (memory `project_thumbnail_quality`).

## Problem

The auto-fetched SDSS-cutout and CDS-DSS thumbnails drawn as in-scene atlas quads still have the original quality issues. Scoped to the **non-curated** SDSS/DSS path only — the famous-galaxy branch is fully addressed (procedural-disk fade-out, high-res LOD #214, thumbnail calibration + square deproject + disk-plane unification #229/#234/#235/#240).

## Current state (verified 2026-06-29)

Per-galaxy sizing + a DSS _color_ composite landed — but only on the InfoCard React `<img>` path (`buildGalaxyInfo.ts:107-110`, sized via `galaxyThumbnailFovArcmin`). The actual **in-scene atlas-quad fetch** (`src/utils/network/fetchGalaxyBitmap.ts:86,100`) still uses fixed sizes: SDSS at native 0.4″/px × 128 px, DSS at a hardcoded 2 arcmin. No masking, sky-subtraction, per-galaxy size, DESI source, or brightness normalization on this path.

## Options (ranked, from memory `project_thumbnail_quality`)

- **A** — star/foreground mask.
- **B** — sky subtraction.
- **C** — per-galaxy cutout size (port the InfoCard's `galaxyThumbnailFovArcmin` to the atlas path).
- **D** — DESI image source.
- **E** — brightness normalization.
