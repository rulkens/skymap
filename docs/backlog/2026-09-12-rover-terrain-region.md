# Rover landing sites as 3D terrain with high-resolution textures

**Raised:** 2026-09-12, user visual pass on PR #693 (Mars rovers). User ruled:
backlog, not this PR.

A rover today stands on the analytic 3390 km sphere wearing the global Mars
equirect: at 10 m the ground is a flat, blurred, single-colour plane. The
intent is the opposite — a rover set in a realistic place: Gale, Jezero, Gusev
and Meridiani with real relief and metre-scale imagery around the site.

## What it needs

- **Terrain**: a local height field per site (HiRISE DTMs cover all four
  landing sites at ~1 m/post; MOLA/HRSC for the surround), drawn as a
  displaced patch over the sphere inside a region — the same idea as the
  Earth surface tiles (`earthSurfaceTile`), but a mesh, not a texture band.
- **Textures**: HiRISE orthoimages (~25 cm/px) over the patch, CTX for the
  surround, blending into the global equirect at the region edge.
- **Region gating**: a `surfaceFixed` site claims its host region already
  (`bodyRegions.ts`); the terrain patch is that region's close-range
  representation, engaged by the same bands that switch Earth to tiles.
- The rover's `altitudeM` then reads the DTM height at the site, not the mean
  sphere (`SURFACE_FIXED_SITES` notes the areoid gap today).

Pairs with `docs/backlog/2026-09-12-rover-surface-camera-regime.md` (the camera
that would look at it) and `docs/backlog/2026-09-12-mesh-body-shadows.md` (the
shadow that would fall on it).
