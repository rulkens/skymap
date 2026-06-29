# Lower-tier "close to home" weighting

> **Backlog item** · `needs-design` · area: Data pipeline
> **Promote to:** a spec when picked up.

## Problem

Retune the small/medium tier subsampling so more galaxies survive near the camera's home position — maximum visual density on first load — while keeping the on-screen count fast. Distinct from the deliberate SDSS far-shell sample (memory `project_sdss_medium_intentionally_far`), and distinct from per-group seeding (see [dense Local Volume seeding](2026-06-29-dense-local-volume-seeding.md)): this is camera-home density.

## Current state (verified 2026-06-29)

No camera-home/position term exists. `tools/catalog/subsampleByAbsMag.ts:71-103` ranks purely by absolute magnitude. `tools/catalog/selectTierRecords.ts` adds a flux-magnitude supplement (an apparent `magG` floor) that densifies the local volume _generally_, but that's flux-limited, not biased toward the home position.

## Direction

Add a spatial weighting term (distance-from-home) to the subsample ranking for small/medium tiers, budgeted against the on-screen count.
