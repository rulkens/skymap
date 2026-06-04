# Nearby Galaxy Groups — a `group` Structure Category

**Status:** Draft, awaiting user review
**Date:** 2026-06-04
**Author:** Alexander Rulkens (with Claude)

## 1. Goal and motivation

The cluster overlay today labels three kinds of large-scale structure —
**clusters**, **superclusters**, and **voids** — but skips the one the
viewer actually lives in: a **galaxy group**. The Local Group, M81, Cen A,
Sculptor and their peers are the nearest, most recognizable structures in
the whole map, and several of them already host a curated thumbnail in the
famous layer (M81, M82, NGC 5128, M101, NGC 253). A ring + label around
those groups frames thumbnails we already draw and tells the "our cosmic
neighbourhood" story the local volume is made for.

This spec adds a fourth featured structure category, **`group`**, seeded
with **16 verified Local Volume groups** (0–13.5 Mpc). It is deliberately
small and additive: no new binary format, no bulk catalog, no rendering
subsystem — it rides the seam the cluster/supercluster/void work already
built.

### Non-goals (YAGNI)

- **No bulk group catalog.** Groups are *featured-only*, exactly like
  voids. There is no `.ccat` payload for groups and no async fetch.
- **No per-group ring-weight variation.** Featured groups render at uniform
  prominence (`significance = 1`), consistent with featured clusters and
  voids. Member count is shown as descriptive InfoCard text, not mapped to
  alpha.
- **No new renderer or shader.** Groups reuse `clusterMarkerRenderer`
  (halo + ring) and the existing label layer unchanged.

## 2. Why the binary format is NOT reused for groups

`src/data/clusterCatalogFormat.ts` (`.ccat`) encodes only the **bulk,
async** MCXC/MSCC catalog. Its category byte is `{0=cluster,
1=supercluster}` — voids never appear in it, because voids are
featured-only and live in `data/cluster_anchors.seed.json`, read
synchronously by `buildStaticAnchorPois`.

Groups follow the **void precedent precisely**: a curated set with no bulk
catalog behind them. So the `.ccat` format is reused *untouched* — groups
simply never flow through it. Everything group-specific lives in the seed
JSON plus the category plumbing.

| Layer | Change for groups |
|---|---|
| `clusterCatalogFormat.ts` (`.ccat`) | **none** — groups are seed-only, like voids |
| `data/cluster_anchors.seed.json` | + 16 `"category": "group"` entries |
| `tools/parsers/parseClusterSeed.ts` | add `'group'` to `VALID_CATEGORIES` |
| `src/@types/.../PointOfInterest` | add a `'group'` arm (mirrors the void arm) |
| `src/data/sources.ts` | add `Source.Group = 15` + a `PoiEntry` |
| `src/data/buildStaticAnchorPois.ts` | add a `'group'` case to the switch |
| `poiSubsystem.ts` `POI_STYLES` | add a `group` style row (extends `PoiCategory`) |
| `clusterMarkerRenderer.ts` | add `'group'` to the marker-bearing category set |
| `clusterFocusSubsystem.ts` | add `'group'` to the focus-eligible predicate |

## 3. Category plumbing — derived where possible, explicit where not

The codebase already anticipated a new category, so most of the surface is
data, not code:

- **`PoiCategory` is `keyof typeof POI_STYLES`** (`poiSubsystem.ts`). Adding
  a `group` row to `POI_STYLES` extends the union automatically — visibility
  records, label gating, and `getPoisForCategory` all follow for free. The
  module header states this contract explicitly ("adding a fifth category is
  one POI_STYLES row").
- **`Source.Group = 15`** — the next free append in the `Source` enum.
  Source codes 5/6/7 are Cluster/Supercluster/Void; 8–14 are taken
  (Milliquas, filaments, volumes, debug). 15 is the next POI code and is
  pick-safe: it's packed into the pick texture's upper 5 bits, well under
  the all-ones sentinel (31) reserved in `selectionEncoding.ts`. Append,
  never renumber.
- **The one genuinely-hand-edited spot is the *marker-bearing* category
  set** in `clusterMarkerRenderer.ts`. That renderer hardcodes
  `'cluster' | 'supercluster' | 'void'` (famous galaxies have no markers)
  in ~8 record/union sites. Groups are marker-bearing, so they join it.

### Consolidate the marker-category literal (the "generalize repeated fixes" rule)

Rather than smear `'group'` across ~8 inline `'cluster' | 'supercluster' |
'void'` literals in `clusterMarkerRenderer.ts`, introduce **one** exported
`MARKER_CATEGORIES` tuple + `MarkerCategory` type (the marker-bearing
subset of `PoiCategory`, i.e. all categories except `famousGalaxy`) and
derive the renderer's records from it. This is the repo's
"second hand-edited list = consolidate" rule applied before the duplication
grows. Two distinct category sets exist and must stay distinct:

- **All POI categories** — `cluster | supercluster | famousGalaxy | void |
  group` (from `POI_STYLES`).
- **Marker-bearing categories** — `cluster | supercluster | void | group`
  (the `clusterMarkerRenderer` set; excludes `famousGalaxy`).
- **Bulk-catalog categories** — `cluster | supercluster` only (the `.ccat`
  byte; unchanged by this spec).

## 4. Radius mapping — group dynamics onto the two-radius schema

The seed schema already carries two radii whose semantics fit group
catalog quantities exactly:

- **`physicalRadiusMpc` ← harmonic radius `Rh`** (the dense bound core,
  ~0.1–0.4 Mpc). Mirrors the schema's "virial/R_200 radius for clusters".
- **`apparentRadiusMpc` ← zero-velocity turnaround radius `R0`** (the
  binding/named extent, ~0.6–1.3 Mpc). Mirrors "wider named extent". Since
  `R0 > Rh` always, the schema invariant `apparentRadiusMpc ≥
  physicalRadiusMpc` holds for free.

Where a catalog gives only one of the two (some groups have only `Rh`,
some only a published angular "apparent extent"), the missing radius is
**derived and flagged in the seed comment**, never silently invented:
`apparentRadiusMpc ≈ 3 × Rh` or `physicalRadiusMpc ≈ 0.3 × apparentRadiusMpc`,
matching the catalogued `R0/Rh ≈ 3` ratio of the six best-studied groups.

### Local Group placement

The Local Group has no on-sky centroid (we are inside it). Karachentsev
2005 catalogues its barycentre at `D ≈ 0.43 Mpc`, dominated by the
Milky Way + M31. We place the marker **along the M31 sightline** (the
dominant partner; the MW sits at the origin, so the barycentre lies toward
M31): `raHours ≈ 0.71`, `decDeg ≈ +41.3`, `distMpc = 0.43`. This:

- passes the `distMpc > 0` validator,
- puts a ~0.94 Mpc-radius ring effectively *around* the camera's start
  position (the engine frames the viewer inside the Local Group), so we
  **rely on the existing far-/near-fade** (`2026-05-28-cluster-ui-far-fade`)
  for the inside-the-ring case. This is the one marker that sits at the
  camera origin, so it gets an explicit visual-verification step in the
  plan.

## 5. Group styling — a distinct visual register

Groups are 10–100× less massive than clusters and sit at 0–13 Mpc, so a
group ring is *small but very near* — a foreground marker. A new `group`
row in `POI_STYLES` gives it:

- **A distinct tint** (proposed: soft green, e.g. `#8FBF8F`) separating
  groups from cluster-yellow / SC-orange / void-cyan. Final hue settled in
  implementation with a visual check.
- **Small `worldEmMpc`** (~0.3) — group labels are physically tiny, between
  famous-galaxy (0.0125) and cluster (1.25).
- **A low `markerMinApparentRadiusPx`** so a nearby group ring stays
  visible rather than tripping the "too small to read" floor that the bulk
  cluster field uses.

## 6. Data — the 16 verified groups (provenance appendix)

Sourced from **Karachentsev 2005** (AJ 129, 178, Table 11 — `R0`, `Rh`,
member counts, σ for the six nearest complexes) and **Makarov &
Karachentsev 2011** (centroids, harmonic radii), cross-checked against
NED / SIMBAD / UNGC. `[cat]` = directly catalogued; `[anchor]` = dominant
galaxy's J2000 position standing in for an untabulated centroid; `[est]` =
derived via the §4 rule. The final `data/cluster_anchors.seed.json` rows
are written from this table during implementation.

| Group | RA(h) | Dec(°) | Dist (Mpc) | physR=Rh (Mpc) | appR=R0 (Mpc) | Members | Notes |
|---|---|---|---|---|---|---|---|
| Local Group | 0.71 | +41.3 | 0.43 | 0.16 [cat] | 0.94 [cat] | ~15 | barycentre along M31 sightline |
| IC 342 Group | 3.78 | +68.10 | 3.0 | 0.21 [cat] | 0.90 [cat] | ~16 | Zone-of-Avoidance, obscured |
| M81 Group | 9.93 | +69.07 | 3.5 | 0.21 [cat] | 1.05 [cat] | ~29 | M81+M82 tidal complex |
| Cen A Group | 13.42 | −43.02 | 3.6 | 0.26 [cat] | 1.26 [cat] | ~42 | nearest giant elliptical/radio galaxy |
| M83 Group | 13.62 | −29.87 | 4.8 | 0.089 [cat] | 0.40 [est] | — | southern subgroup of the Cen A/M83 complex |
| Sculptor Group | 0.79 [anchor] | −25.29 | 3.8 | 0.36 [cat] | 0.70 [cat] | ~6 | **filament, loosely bound** |
| CVn I Cloud | 12.85 [anchor] | +41.12 | 4.2 | 0.39 [cat] | 0.63 [cat] | ~9 | **a "cloud", not a bound halo** |
| Maffei Group | 2.61 [anchor] | +59.65 | 5.7 | 0.20 [est] | 0.60 [est] | — | **distance contested (3.4–6.7 Mpc)**; values estimated |
| NGC 6946 Group | 20.58 [anchor] | +60.15 | 5.9 | 0.21 [cat] | 0.42 [cat] | ~8 | Fireworks galaxy + Cepheus 1 |
| M101 Group | 14.05 [anchor] | +54.35 | 7.0 | 0.30 [est] | 0.90 [cat] | — | Pinwheel; part of the M101–M51 filament |
| NGC 4631 Group | 12.70 [anchor] | +32.54 | 7.4 | 0.24 [cat] | 0.50 [est] | 5–28 | **membership author-dependent** |
| M51 Group | 13.50 [anchor] | +47.20 | 8.3 | 0.13 [est] | 0.40 [est] | — | Whirlpool + NGC 5195 |
| NGC 1023 Group | 2.67 [anchor] | +39.07 | 8.0 | 0.17 [est] | 0.50 [est] | — | **distance contested (6.3–10 Mpc)** |
| M96 / Leo I Group | 10.78 [anchor] | +11.82 | 10.7 | 0.18 [cat] | 0.54 [est] | — | hosts the Leo Ring; M105 is the centroid member |
| Leo Triplet (M66) | 11.34 [anchor] | +12.99 | 9.5 | 0.15 [est] | 0.20 [cat] | 3+ | M65+M66+NGC 3628 |
| NGC 5866 Group | 15.11 [anchor] | +55.76 | 13.5 | 0.17 [est] | 0.50 [est] | — | edge-on spiral group (M102) |

**Contested systems are kept and labelled honestly** in their `description`
text (Sculptor and CVn I are clouds/filaments, not bound; Maffei's distance
is disputed). That is educational, not a defect. Maffei is the one entry
whose radii are fully estimated rather than catalogued — flagged in its
seed comment; an alternative is to fold IC 342 + Maffei into a single
historical "IC 342 / Maffei" complex (15 entries) using the catalogued
combined values. Resolved during implementation.

## 7. Runtime integration (unchanged paths)

Groups are featured, so they flow through the **synchronous** static-anchor
path exactly as clusters/SC/voids do:

- `buildStaticAnchorPois` reads the seed JSON, builds a `group` POI per
  entry (`id = "group-<seed.id>"`, `featured: true`, `significance: 1`).
- `wireSlots` pushes them into `poiSubsystem.setPois`; deep-links
  (`#poi=group-m81`) resolve synchronously, same as `#poi=cluster-virgo-m87`.
- `produceMarkers` emits halo + ring descriptors for each (group is
  marker-bearing); `produceLabels` labels them (group is featured).
- Pick: `clusterMarkerRenderer.pickRing` gains a `group` bucket;
  `resolvePoiFromPick` resolves `Source.Group` hits via
  `getPoisForCategory('group')`.

No async loader, no `.ccat`, no R2 sync change (the seed JSON is bundled
into the shell at build time).

## 8. Testing

- `parseClusterSeed` accepts `'group'` and round-trips the new entries;
  rejects a malformed group entry loudly (existing validator extended).
- `buildStaticAnchorPois` produces 16 `group` POIs with `id` =
  `group-<seed.id>`, `featured: true`, `significance: 1`, and the correct
  `worldPos` from `raDecDistToEqCart`.
- `clusterMarkerRenderer` buckets a `group` descriptor into its own run and
  emits the right instance count (CPU-mode test, mirrors existing
  cluster/SC/void bucket tests).
- `resolvePoiFromPick` resolves a `Source.Group` pick to the right POI.
- `PoiCategory`-derived records (visibility, styles) include `group` —
  type-level, enforced by the `Record<PoiCategory, …>` totality.

## 9. Out of scope / future

- Bulk group catalog (a real UNGC/Kourkchi-Tully fetch → `.ccat` with a
  `group` byte) if we ever want hundreds of groups rather than 16 featured.
- Member-count → ring-weight mapping (deferred; uniform for now).
- Groups beyond ~13 Mpc (Dorado, Eridanus, NGC 3115, NGC 2997 …) — real
  but less well-constrained; trivially added later as seed rows.

## 10. Open decisions for review

1. **Group tint** — soft green (`#8FBF8F`) proposed; confirm or pick another
   hue that stays distinct from yellow/orange/cyan.
2. **Maffei** — keep as a separate 16th entry with estimated radii, or fold
   IC 342 + Maffei into one catalogued "IC 342 / Maffei" complex (15
   entries)?
3. **`Source.Group = 15`** — confirm the append slot (the enum has no gaps
   to reclaim; 15 is the next free POI code).
