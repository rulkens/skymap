# Cluster / Supercluster Coverage — Plan Index

**Spec:** [`docs/superpowers/specs/2026-05-30-cluster-supercluster-coverage-design.md`](../specs/2026-05-30-cluster-supercluster-coverage-design.md)
**ADR:** [0003 — Cluster catalog loading](../../adrs/0003-cluster-catalog-loading.md) (Accepted) — the `.ccat` format + featured-sync/bulk-async load-timing decision these plans implement.
**Date:** 2026-05-30

The cluster/supercluster-coverage feature is split into two
independently-shippable plans along the build-vs-runtime seam. Each plan
ends at a green test run and a working slice of software.

## Plans

1. **[Data + build pipeline](2026-05-30-cluster-supercluster-coverage-1-data-pipeline.md)** —
   raw-data registration (MCXC + MSCC), the two parsers, the
   `clusterCatalogFormat` binary format, the extracted curation helpers
   (`writeMetaSidecar` / `dedupeByProximity`) + buildFamous refactor, the
   featured seed-JSON migration (delete `clusterAnchors.ts`, move
   `raDecDistToEqCart`), the CF-4 audit re-point, and
   `tools/clusters/buildClusters.ts` + the `build-clusters` npm script.
   **End state:** `npm run build-clusters` emits `public/data/clusters.ccat`
   + `public/data/clusters_meta.json`; all tests green; nothing renders
   differently yet (runtime still reads the seed JSON only).

2. **[Runtime + rendering + deploy](2026-05-30-cluster-supercluster-coverage-2-runtime-render.md)** —
   `PointOfInterest` gains `featured` + `significance`; `buildStaticAnchorPois`
   reads the bundled seed JSON synchronously (featured + labeled +
   deep-linkable); bulk `.ccat` async fetch + decode + merge into
   `poiSubsystem` (mirrors the famous async-merge); rendering weights
   rings/halos by `significance` + distance fade and gates labels on
   `featured` with a light screen-space declutter; `syncR2` ALLOW extension.
   **End state:** ~375 structures render, featured ones labeled, deep-links
   preserved.

## Dependency

**Plan 2 depends on Plan 1.** Plan 2's runtime decode needs
`clusterCatalogFormat` (Plan 1 §format task) and its sync featured path
needs the seed-JSON migration (Plan 1 §seed task). Execute Plan 1 to
completion first.

Within Plan 1 the seed-JSON migration + format module are independent of
the parser/build tasks and can interleave; the INDEX leaves ordering to
the executing session, but the format module must land before
`buildClusters` emits a `.ccat`.
