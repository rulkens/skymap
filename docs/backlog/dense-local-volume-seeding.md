# Densely seed the Local Volume across all tiers (group explorability)

> **Backlog item** · `needs-design` · area: Data pipeline
> **Promote to:** a spec when picked up.

## Problem

The 16 Local Volume groups are only interesting to fly into if their _member_ galaxies are present, but `subsampleByAbsMag` thins the nearby volume by absolute-magnitude cut, so faint dwarfs in the Local Group / M81 / Cen A / Sculptor etc. get culled — a group ring you focus into can be nearly empty at small/medium tier. Bias the subsampling to **keep galaxies inside (or near) the featured group spheres** regardless of `M_abs`, across small + medium and ideally large tiers.

## Current state (verified 2026-06-29)

No group-sphere sparing. Neither `subsampleByAbsMag.ts`, `selectTierRecords.ts`, nor `buildAllBins.ts` references `structure_anchors.seed.json`, group radii, or any sphere-membership spare logic. The only local-volume density that exists is the global flux supplement (`fluxSupplementMagLimitFor`, GLADE/SDSS) — an apparent-mag floor that ignores the featured group spheres.

## Direction

The group seed positions/radii (`data/structure_anchors.seed.json`) are available to the build, so the subsampler can spare points within `apparentRadiusMpc` of each group centre. Keep an eye on the on-screen count budget. Pairs with the cluster-focus member count (`PoiDetailCard` "Galaxies" row) — denser seeding makes that number meaningful at lower tiers. Distinct from [close-to-home weighting](close-to-home-weighting.md): this is per-group membership density keyed off the structure seed, not camera-home density.
