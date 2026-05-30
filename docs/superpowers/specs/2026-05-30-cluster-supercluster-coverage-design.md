# Cluster / Supercluster Coverage — Catalog-Driven Expansion

**Status:** Draft, awaiting user review
**Date:** 2026-05-30
**Author:** Alexander Rulkens (with Claude)

## 1. Goal and motivation

Today the cluster / supercluster / void overlay is driven by a
hand-curated table of **11 clusters + 6 superclusters + 3 voids** in
`src/data/clusterAnchors.ts`. It's textbook-accurate but sparse: the
sky reads as a handful of lonely markers rather than a populated cosmic
web, and it's biased toward the northern, local volume.

This spec expands the cluster/supercluster set to a **catalog-driven
~375 structures** (≈300 clusters + ≈75 superclusters), full-sky, out to
z ≤ 0.15 (~600 Mpc), while keeping the curated structures as a
**featured tier** that retains popular names, curator-tuned radii, and —
crucially — **labels**.

Two deliberate constraints shape the whole design, both from user
direction during brainstorming:

1. **Rings + halos render for *all* ~375 structures; labels render only
   for the *featured* subset.** Drawing 375 labels would be noise; the
   ring/halo glow conveys "structure is here" everywhere, while the
   label is the reward for the recognizable ones.
2. **Physical parameters matter.** We use a catalog that ships
   ready-made radius and mass (MCXC), not one that needs derivation.

The existing at-rest visualization (soft halo + screen-aligned ring,
per the 2026-05-18 cluster-viz spec) and the selection/camera-focus path
are unchanged — this spec feeds *more structures* into them, plus a
label-gating rule. **Member-isolation focus mode** (the "show only
galaxies inside the cluster" interaction) is explicitly out of scope —
see §12.

## 2. Data sources (verified against VizieR, not paper text)

### 2.1 Clusters — MCXC (base catalog)

`J/A+A/534/A109` — Meta-Catalogue of X-ray detected Clusters
(Piffaretti et al. 2011). **1,743 clusters, all-sky.** Verified columns:

| Column | Meaning | Units |
|---|---|---|
| `RAJ2000`, `DEJ2000` | position (J2000) | h:m:s, d:m:s |
| `z` | redshift | — |
| `M500` | total mass | 10¹⁴ M☉ |
| `R500` | characteristic radius | **Mpc (ready-made)** |
| `L500` | X-ray luminosity (0.1–2.4 keV) | 10³⁷ W |
| `OName` | popular / Abell name | — |
| `AName` | alternative name | — |

MCXC is the authoritative source for **position, distance (`z`),
physical radius (`R500`), and significance (`M500`)**. No derivation
needed.

### 2.2 Superclusters — MSCC

`J/MNRAS/445/4073/mscc` — Main SuperClusters Catalogue
(Chow-Martínez et al. 2014). **601 superclusters, all-sky**, z ≈
0.01–0.15. Verified columns: `RAdeg`, `DEdeg` (deg), `z` (mean),
`Nm` (member-cluster count → significance), `dmax` (max member-pair
separation, h₇₀⁻¹ Mpc → extent proxy). Superclusters are not
virialized, so there is no `R500`-style radius; `dmax/2` is the extent.
This matches the existing convention in `clusterAnchors.ts` where
superclusters collapse `physicalRadiusMpc == apparentRadiusMpc`.

### 2.3 Names — MCXC's own columns only

Abell designations come from parsing MCXC's `OName`/`AName` (it's
compiled from X-ray surveys of mostly-known clusters, so Abell numbers
are already present for much of the set). **No separate Abell/ACO
catalog fetch.** Clusters lacking a name in those columns fall back to
the MCXC primary id (`JHHMM.m+DDMM`). A positional cross-match against
the full Abell catalog (`VII/110A`) is a possible future enhancement
(§12), not part of this work.

## 3. Featured tier — curated seed JSON

The hand-curated anchors move out of the TypeScript constant
`clusterAnchors.ts` into **`data/cluster_anchors.seed.json`**, the single
source of truth for featured structures. Each entry carries: `id`,
`names` + `commonName`, `category` (`cluster` | `supercluster` |
`void`), `raHours` / `decDeg` / `distMpc`, `physicalRadiusMpc`,
`apparentRadiusMpc`, and `description`.

- **Extended a little**: grow from 17 to **~25–30** recognizable
  structures (e.g. Leo / A1367, Corona Borealis SC, a few more
  textbook clusters). Exact additions settled during implementation.
- **Voids ride along here** (featured-only — there is no bulk void
  catalog in scope; the existing 3 voids stay, sourced from the seed).
- **Bundled, not async**: the seed JSON is imported at build time
  (Vite JSON import) so the featured POI list stays *synchronous* — see
  §6 for why this is load-bearing for deep-links and the CF-4 audit.

`clusterAnchors.ts` is **deleted**. Its `raDecDistToEqCart` helper moves
to a standalone util (`src/utils/math/raDecDistToEqCart.ts`, named per
the one-function-one-file convention). A small `parseClusterSeed`
loader (mirroring `tools/parsers/famousSeed.ts`) validates the JSON
shape.

## 4. Bulk catalog build pipeline — `tools/clusters/buildClusters.ts`

Mirrors `tools/famous/buildFamous.ts`. Steps:

1. **Register raw catalogs** under `data/raw/mcxc/` and `data/raw/mscc/`
   via `tools/utils/io/rawDataRegistry.ts` (keys `mcxc.table`,
   `mcxc.readme`, `mscc.table`, `mscc.readme`), each with a provenance
   `README.md` and `.gitignore` exceptions per the "adding a new raw
   data source" checklist in CLAUDE.md.
2. **Parse** MCXC + MSCC (new parsers in `tools/parsers/`, byte layouts
   from the VizieR ReadMes committed beside each catalog).
3. **Distance**: `z → distanceMpc` via the existing
   `src/utils/math/redshiftToDistanceMpc.ts`. Radii: MCXC `R500 →
   physicalRadiusMpc`; `apparentRadiusMpc = APPARENT_MULTIPLE × R500`
   (tunable, ≈1.5–2). MSCC `dmax/2 → physical == apparent` (convert
   h₇₀⁻¹ → Mpc).
4. **Threshold knobs** (constants at the top of the script, tunable to
   retune visual density without code changes):
   - `MCXC_M500_MIN` → ≈ top 300 clusters by mass.
   - `MSCC_NM_MIN` → ≈ top 75 superclusters by member count.
   - `Z_MAX = 0.15` distance cut on both.
5. **Build-side dedup against the featured seed**: any MCXC/MSCC entry
   within a 3D proximity of a featured seed entry is **dropped** (the
   curated, hand-tuned version wins). This prevents Coma drawing twice.
   Proximity = `< apparentRadiusMpc` of the featured anchor (with a
   small floor), measured in equatorial-Cartesian Mpc.
6. **Emit** `public/data/clusters.ccat` (bulk numeric payload) +
   `public/data/clusters_meta.json` (bulk names + short descriptions,
   indexed by local-idx). A generated one-line description per bulk
   cluster (e.g. `X-ray cluster · M500 = … · z = …`) so the InfoCard
   isn't empty.

Run order: after `npm run build-tiers` (consistent with `build-famous`).
New npm script `build-clusters`.

## 5. Artefact format — `src/data/clusterCatalogFormat.ts`

A new, cluster-specific binary format (**not** shoehorned into
`GalaxyCatalog` — clusters aren't galaxies; radius ≠ diameter, and they
have a category). Mirrors `galaxyCatalogFormat.ts` structurally:

- **Header**: `magic` (`'CCAT'`) + `version` (1) + `count`. Old files
  fail loudly with a regenerate message, same as the galaxy format.
- **Per-record (fixed size)**: `posX, posY, posZ` (f32 ×3,
  equatorial-Cartesian Mpc), `physicalRadiusMpc` (f32),
  `apparentRadiusMpc` (f32), `significance` (f32 — `M500` for clusters /
  `Nm` for SCs, normalized at decode for visual weighting), `category`
  (u8), padding to alignment.
- **`encode` / `decode`** + unit tests, parallel to the galaxy format's.

**Extension `.ccat`** (cluster catalog). Alternative `.lss`
("large-scale structure", covers SCs/voids semantically) noted as an
open decision in §13. Strings (names, descriptions) live in the JSON
sidecar, exactly as `famous.bin` pairs with `famous_meta.json`.

This carries the **bulk** structures only. Featured structures are not
in the `.ccat` (they're in the bundled seed JSON, §3).

## 6. Runtime integration

The current `src/data/buildStaticAnchorPois.ts` is **synchronous and
pure**, reading the compiled constants, and feeds two consumers:
`wireSlots` (engine bootstrap) and `usePoiUrlSync` (the `#poi=…`
deep-link drain). The deep-link drain *requires* a synchronous read-side
list — famous-galaxy POIs load async and their deep-links are explicitly
deferred today.

To avoid **regressing the working Virgo/Coma deep-links**, the design
splits by load timing:

- **Featured (sync)**: `buildStaticAnchorPois` reads the bundled
  `cluster_anchors.seed.json`. These POIs get `featured: true`, are
  labeled, deep-linkable, and feed the audit. Behaviour identical to
  today, just sourced from JSON instead of a TS constant.
- **Bulk (async)**: the cloud loader fetches `clusters.ccat` +
  `clusters_meta.json` through `dataUrl()` (dev: `public/data/`; prod:
  R2), decodes via `clusterCatalogFormat`, and **merges** the result
  into `poiSubsystem` — the same async-merge path famous-galaxy POIs
  already use in `wireSlots`. These POIs get `featured: false` and are
  **not** labeled.

`PointOfInterest` gains two fields: `featured: boolean` (gates label
rendering + deep-link eligibility) and `significance: number`
(normalized; drives ring brightness/size falloff). Existing consumers
that build POIs (the famous merge) set `featured` appropriately.

## 7. Rendering — rings everywhere, labels for the featured

Reuses the existing `ClusterMarkerRenderer` (halo + ring) and label
layer. Changes:

- **Halo + ring**: drawn for **all** POIs (featured + bulk). Visual
  weight (ring alpha, halo intensity, max pixel size) scales with
  `significance` and fades with camera distance (the existing far-fade,
  per `2026-05-28-cluster-ui-far-fade`). Low-significance distant
  clusters stay faint so the field reads as structure, not fog.
- **Labels**: gated on `featured`. Among the ~25–30 featured labels, a
  **light screen-space declutter** (collision cull, highest-significance
  wins) handles crowding in rich regions (e.g. Shapley). This is far
  simpler than a top-N-of-375 declutter because the candidate set is
  already tiny.

Performance: ~375 instanced ring/halo quads + ~30 labels is negligible
on the marker renderer (orders of magnitude below the 2.5M-point galaxy
path).

## 8. Extracted curation seam (the "don't build a new system" ask)

We do **not** build a curation framework. We extract only the genuinely
shared, domain-neutral helpers so `buildFamous` and `buildClusters`
don't duplicate them:

- **`writeMetaSidecar(entries, path)`** — the `id → human-readable
  strings, indexed by local-idx` JSON emission both build scripts do by
  hand today.
- **`dedupeByProximity(featured, candidates, ...)`** — the
  curated-wins 3D-proximity merge.

What stays **per-domain** (forcing these together would be a leaky
abstraction): the famous image-overrides (`dir`/`sourceUrl`/`license`,
in `famousCuratedOverrides.ts`) and the two seed schemas (galaxy
photometry vs cluster radii/category). The boundary is called out
explicitly so a future reader doesn't try to unify them.

Shared helpers land in `tools/curation/` (or `tools/utils/io/` if that
fits better — settled in the plan).

## 9. CF-4 audit re-point

`tools/volumes/auditCf4Anchors.ts` currently imports the
`CLUSTER_ANCHORS` / `SUPERCLUSTER_ANCHORS` / `VOID_ANCHORS` constants.
It re-points to the **featured seed JSON** (via `parseClusterSeed`) —
the audit only cares about textbook overdensities, which are exactly the
featured set. The bulk catalog is *not* audited (it's X-ray-selected
real clusters; auditing it against CF-4 density adds no signal and many
sit beyond CF-4's reliable volume).

## 10. Deploy

- Add `clusters.ccat` + `clusters_meta.json` to the `syncR2.ts` ALLOW
  filter and `public/_headers` (same `max-age` treatment as the other
  data artefacts).
- The runtime fetch goes through `dataUrl()`, so dev serves from
  `public/data/` and prod from R2 with no code change.
- `.ccat`/`_meta.json` are build artefacts → gitignored under
  `public/data/`, like the galaxy bins.

## 11. Testing

- `clusterCatalogFormat` encode/decode round-trip (parallels the galaxy
  format tests).
- MCXC + MSCC parser fixtures (small hand-built byte/row samples).
- `buildClusters` threshold + dedup logic (featured entry suppresses a
  nearby catalog entry; threshold excludes below-cut entries).
- `parseClusterSeed` validation (malformed seed fails loudly).
- `buildStaticAnchorPois` still produces the featured POIs with correct
  slugs + `featured: true` from the seed JSON.
- Extracted `writeMetaSidecar` / `dedupeByProximity` unit tests.

## 12. Out of scope (companion specs / future)

- **Member-isolation focus mode** ("show only galaxies inside the
  cluster") — designed in the 2026-05-18 cluster-viz spec §3–4, but
  *never actually built* (only the pure `clusterMembership` cone-search
  + a `FocusState` type stub landed; the `cluster-viz-4` plan sits in
  `completed/` with 74 unchecked boxes and no `FocusUniforms` /
  `clusterFocusSubsystem` in the codebase). This is the natural
  follow-up: the radii + positions this spec produces feed it directly.
  Worth its own spec that resurrects/finishes cluster-viz-4.
- **Abell/ACO positional cross-match** (`VII/110A`) to name MCXC entries
  lacking an `OName`/`AName` Abell number.
- **Per-cluster in-app calibration** of ring centre/radius.
- **Voids beyond the curated 3** (no bulk void catalog in scope).

## 13. Open decisions for review

1. **Extension**: `.ccat` (recommended) vs `.lss`.
2. **Featured count**: ~25–30 — confirm the target and any must-have
   additions.
3. **Featured bundled vs in-`.ccat`**: this spec bundles the featured
   seed JSON (sync) and puts only bulk in `.ccat`, to preserve
   synchronous deep-links. Confirm that split is acceptable (the
   alternative — everything in `.ccat` — would defer curated deep-links
   to an async "POIs ready" subscriber, regressing today's behaviour).
