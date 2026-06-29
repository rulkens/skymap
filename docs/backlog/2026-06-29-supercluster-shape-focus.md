# Supercluster/wall shape accuracy (focus mode)

> **Backlog item** · `needs-design` · area: Rendering
> **Promote to:** a spec when picked up.

## Problem

Structure-focus mode (PR #242) renders membership as a sphere of radius `apparentRadiusMpc ?? physicalRadiusMpc` centred on the catalog centroid. For superclusters/walls (MSCC) this is crude: the structure is a flattened sheet, so the sphere swallows foreground/background voids and clips the wall's arms (e.g. the Hydra Wall reads ~847 galaxies at medium tier).

## Current state (verified 2026-06-29)

Still spherical. `src/utils/structure/structureMembership.ts` is a pure cone-search (`d2 < r*r` against a single radius — no ellipsoid, no MSCC `memCl` fit, no density-field membership). `structureFocusSubsystem.ts:88-95` now ramps the fade across a `[physicalRadiusMpc, apparentRadiusMpc]` band — a refinement, but the membership geometry is still a sphere.

## Options

No all-sky per-galaxy membership catalog exists to replace it — redMaPPer/WHL give cluster members but only in the SDSS footprint; Liivamägi+2012 gives galaxy→supercluster IDs but is also SDSS-limited and threshold-dependent. So use a better proxy:

- **(a) Ellipsoid fit** from MSCC member-cluster positions (`memCl` column — data we already have). Cheap, immediate.
- **(b) Density-field membership** reusing the rhizome/MCPM cosmic-web field or DisPerSE filaments (all-sky, same method the literature uses). More principled, reuses existing plumbing.
