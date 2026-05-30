# ADR 0003 — Cluster/Supercluster POIs Are a Generated Catalog Artefact, Loaded Featured-Sync and Bulk-Async

- **Status:** Accepted
- **Date:** 2026-05-30
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [spec 2026-05-30-cluster-supercluster-coverage-design](../superpowers/specs/2026-05-30-cluster-supercluster-coverage-design.md); [plan 1 — data pipeline](../superpowers/plans/2026-05-30-cluster-supercluster-coverage-1-data-pipeline.md); [plan 2 — runtime/render](../superpowers/plans/2026-05-30-cluster-supercluster-coverage-2-runtime-render.md)

## Context

The cluster / supercluster / void overlay began life as a hand-curated
TypeScript constant — `CLUSTER_ANCHORS` / `SUPERCLUSTER_ANCHORS` /
`VOID_ANCHORS` in `src/data/clusterAnchors.ts` — 11 + 6 + 3 entries
compiled into the bundle. `buildStaticAnchorPois.ts` maps that constant
to `PointOfInterest[]`, consumed synchronously by both the engine
(`wireSlots`) and the React deep-link drain (`usePoiUrlSync`, which
resolves `#poi=cluster-virgo-m87` against the static list).

The cluster-coverage work expands this to ~375 catalog-driven structures
(MCXC clusters + MSCC superclusters). That forces a representation
decision that the existing compiled-constant approach can't carry, and
which will set the precedent for every future large-scale-structure
overlay (more cluster catalogs, void catalogs, filament POIs, …):

- **Where does the structure data live?** Three options were live:
  (a) keep growing a compiled TS constant; (b) reuse the existing
  `GalaxyCatalog` binary format the way `famous.bin` does; (c) a new
  artefact.
- **How is it loaded?** The curated subset must stay *synchronous* —
  deep-links to Virgo/Coma resolve against an in-hand list today, and
  famous-galaxy POIs already demonstrate that async POIs lose deep-link
  resolution (theirs is explicitly deferred). But ~350 bulk structures
  don't need to block boot.

Constraints that shaped the call:

- A 375-entry compiled constant is the wrong tool — it bloats the bundle
  with data that isn't code and can't be regenerated from source on a
  catalog refresh.
- `GalaxyCatalog` (option b) is a galaxy vertex-buffer format: it has
  `diameterKpc`, not cluster radius semantics; no category; and it's
  consumed by the point/billboard renderer, whereas structures render
  via `ClusterMarkerRenderer` (halo + ring). Shoehorning clusters into
  it would be a semantic mismatch (radius ≠ diameter) and a misleading
  reuse.
- Clusters are string-dominated (names + descriptions) and number only
  ~475, so the binary's value is *consistency with the rest of the data
  pipeline*, not load speed — at this count JSON would parse in ~1 ms.
- Regressing the working synchronous deep-links is unacceptable.

## Decision

**Large-scale-structure POIs are a *generated catalog artefact*, not a
compiled constant — represented in a dedicated `.ccat` binary format
(distinct from `GalaxyCatalog`), and loaded in two timings: a small
*featured* tier bundled synchronously, and the *bulk* catalog loaded
asynchronously and merged at runtime.**

Concretely:

- The **featured tier** (~25–30 curated structures, the ones that get
  labels and deep-links) lives in a bundled `data/cluster_anchors.seed.json`,
  imported synchronously by `buildStaticAnchorPois`. This preserves the
  synchronous deep-link drain and feeds the CF-4 audit. It replaces the
  `clusterAnchors.ts` constant.
- The **bulk tier** (~350 structures) is built from the source catalogs
  into `public/data/clusters.ccat` (numeric: position, radii,
  significance, category) paired with `clusters_meta.json` (strings) —
  the same binary+sidecar split `famous.bin` / `famous_meta.json` uses,
  because the binary format has no string slots. It is fetched through
  `dataUrl()` (dev: `public/data/`; prod: R2) and merged into
  `poiSubsystem` exactly like async famous-galaxy POIs.
- The `.ccat` format is **its own format module** (`clusterCatalogFormat.ts`),
  not a reuse of `GalaxyCatalog`, with the same loud-fail-on-version-bump
  header discipline.

**What this ADR is NOT deciding:** the exact `.ccat` byte layout (that's
the plan/spec's job), the source catalog choice (MCXC/MSCC — spec §2),
the rendering policy (rings-for-all / labels-for-featured — spec §7), or
the count thresholds. Those are feature decisions recorded in the spec.
This ADR records only the *data-representation + load-timing* pattern,
because that is the part future structure-overlay work will inherit.

## Consequences

### Positive
- Catalog refreshes are independent of code deploys — regenerate the
  `.ccat` and re-sync R2, no rebuild, mirroring the `.bin` pipeline.
- The bundle no longer carries hundreds of structure rows as code.
- Synchronous deep-links are preserved (the featured tier is in-hand at
  boot); the bulk tier degrades gracefully (an async fetch failure means
  bulk rings simply don't appear, featured + app keep working).
- A clear precedent: the next structure overlay (voids, another cluster
  catalog) follows "featured-seed-bundled + bulk-`.ccat`-async" rather
  than inventing a third pattern.

### Negative
- A second binary catalog format to maintain alongside `galaxyCatalogFormat.ts`
  (encoder/decoder/version/tests), for a numeric payload that is tiny
  (~13 KB). The cost is justified by pipeline consistency, not perf.
- Two load timings for one logical overlay is more moving parts than a
  single source; the `poiSubsystem` merge must reconcile featured + bulk
  (+ famous) without one arrival clobbering another.
- The featured/bulk split lives in two files (bundled JSON + `.ccat`),
  so "all structures" is never a single artefact.

### Neutral / forward-looking
- Establishes `.ccat` + `clusters_meta.json` as new R2-synced artefacts
  (syncR2 ALLOW + the runtime fetch list).
- The synchronous-featured / async-bulk split is reusable for famous
  galaxies too (their deep-links could later promote to the same
  featured-sync path) — not done here, but unblocked.
- Leaves room for a future void *bulk* catalog: the `.ccat` category byte
  reserves values beyond cluster/supercluster.

## Implementation notes (non-binding)

The spec + the two plans carry the how. In brief: `clusterCatalogFormat.ts`
mirrors `galaxyCatalogFormat.ts`; `buildClusters.ts` mirrors
`buildFamous.ts`; the async slot + merge mirror the famous-meta slot and
`rewireFamousPois`. The featured seed JSON is validated at build time by
`parseClusterSeed`; the `src/`-side import trusts the build-validated
file.

## References

- ADR 0001 — Fade ownership (the prior cross-cutting ownership ADR this
  one follows in spirit).
- `src/data/galaxyCatalogFormat.ts` — the binary-format idiom `.ccat`
  mirrors.
- `tools/famous/buildFamous.ts` + `famous.bin` / `famous_meta.json` — the
  binary+sidecar precedent.
- Piffaretti et al. 2011, A&A 534, A109 (MCXC); Chow-Martínez et al.
  2014, MNRAS 445, 4073 (MSCC) — the source catalogs.
