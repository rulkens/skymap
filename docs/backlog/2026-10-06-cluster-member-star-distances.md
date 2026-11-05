# Cluster member stars smear into a radial finger

**Seen:** 2026-10-06, with the globular-cluster rings on screen. M13 and M22 sit on a line of Gaia stars several kpc long that points at the Sun. The ring marks the cluster's real position; the line is its member stars, each placed at its own noisy per-star distance.

**Question asked:** would snapping members to the cluster distance be accurate, and can it be done properly? Short answer: per-star depth inside a distant cluster is not measured by any survey, so the accurate thing to do is to use everything that is measured (sky position, membership, cluster distance, density profile) and draw only the one unmeasured number.

## Summary

- No survey, current or planned, measures per-star line-of-sight positions inside a globular at 5+ kpc. Gaia is short by a factor of ~300 at G<14 (M13: ±780 pc per star against a 3.5 pc half-light radius); DR5 will still be short by ~100. The best standard candles (RR Lyrae) reach ~2-7 % per star, i.e. 150-500 pc at 7.4 kpc.
- What is known accurately: each star's sky position (two of three coordinates), which stars are members, the cluster's mean distance (1-2 %), and its 3D density profile.
- Recommended: join the Vasiliev & Baumgardt 2021 member list by `source_id`, place members at the cluster distance plus a depth drawn from the cluster's density profile at that star's projected radius (option b). Centre, size, shape and radial density come out right; only the individual depth is a draw.
- Cost is small: 119 MB download, ~10,000 affected stars out of 16.8 M at the repo's G<14 cut, one map lookup at the distance-resolve step, one full star re-bake.
- Nearby open clusters (Hyades, Pleiades) need no fix: Gaia resolves their depth already. Field-star rays at several kpc are a separate, larger problem.

Sourcing: every catalogue or paper figure below carries the URL it was read from. Lines marked "unverified" are from memory. Lines marked "computed" are my arithmetic on fetched numbers. Search-snippet figures (not read on the paper's own page) are marked "snippet".

## 1. What the repo does today

- Fetch: `tools/fetch/fetchGaia.ts:104` sets `G_MAG_LIMIT = 14.0`; the query at `:126-130` selects `source_id, ra, dec, phot_g_mean_mag, bp_rp, r_med_geo, r_med_photogeo` from `gaiadr3.gaia_source_lite` with a `LEFT OUTER JOIN external.gaiaedr3_distance USING (source_id)`. 16,844,156 rows (`fetchGaia.ts:305`; `data/raw/gaia/README.md`). 99.24 % have a Bailer-Jones row.
- Parallax and its error are not fetched. Only the two posterior medians are; the 16th/84th percentile columns are not.
- Distance choice: `tools/stars/resolveStarDistancePc.ts:53-58`, photogeo, then geo, then GCNS, else `null`.
- `source_id` survives to the resolve step: `GaiaMainRow.sourceId` (`buildStars.ts:164-172`) is in scope in the loop at `buildStars.ts:308-337`, where the distance is resolved (`:310`), turned into a position (`:331`) and into an absolute magnitude (`:332`). A join by `source_id` fits at `:310`. `selectStars` then strips the id (`selectStars.ts:103-114`), so the join cannot go later.
- No distance: the row is dropped and counted as `noBailerJones` (`buildStars.ts:315-319`). A missing G magnitude is also a drop (`:320-328`).
- Outliers: `MAX_STAR_DISTANCE_PC = 12_000` (`buildStars.ts:116-133`). The comment records p50 about 1 kpc, p99 about 7.3 kpc, and a few LMC/SMC and bad-parallax stars stretching the box to ~98 kpc. Stars past 12 kpc are dropped, not clamped (`:397-402`), before the grid is derived. So a cluster member whose noisy distance lands past 12 kpc disappears today, and globulars beyond 12 kpc have no stars at all.
- Order is single pass: resolve distance -> position -> `selectStars` dedup -> 12 kpc cap -> `deriveGrid` (`:419`) -> `quantizeStar` (`:422`) -> per-tier Morton sort and `buildStarOctree` (`:505-513`). Positions are final before the grid and octree exist, so moving stars at the resolve step needs no octree change.
- Absolute magnitude is derived from the same distance (`:332`). A smeared member therefore also carries a wrong luminosity. Any re-placement must recompute `absMag` from the new distance.
- The Rust port is the canonical real-scale builder (docs/DATA.md "Stars (Gaia DR3)"); the same resolve chain is at `tools/stars-rs/src/population.rs:317-319`, the cap at `:457`. Both builders need the change.
- Quantization is not a limit: 12 kpc cap -> box ~24 kpc / 1024 cells is ~23 pc per leaf, with a 10-bit in-cell offset (`buildStars.ts:631`), so ~0.02 pc position resolution (computed).

## 2. The physics limit

Gaia DR3 parallax uncertainty:

- Official medians: 0.02-0.03 mas for G<15, 0.07 mas at G=17, 0.5 mas at G=20, 1.3 mas at G=21 (https://www.cosmos.esa.int/web/gaia/dr3).
- Measured in real clusters, median `plxe` of members with probability >= 0.9 in the Vasiliev & Baumgardt files (computed from the downloaded Zenodo catalogue):

| G | M13 | M22 |
|---|---|---|
| 13 | 0.015 mas | 0.022 mas |
| 15 | 0.029 mas | 0.043 mas |
| 17 | 0.083 mas | 0.098 mas |
| 19 | 0.22 mas | 0.30 mas |

- The same paper finds formal uncertainties underestimated by 10-20 % in dense central regions, and a systematic floor of 0.01 mas on mean parallaxes (abstract, https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/505/5978/ReadMe).

Line-of-sight error, sigma_d = d^2 * sigma_parallax (d in kpc, sigma in mas, result in kpc; computed, using 0.029 / 0.083 / 0.22 mas):

| distance | G=15 | G=17 | G=19 |
|---|---|---|---|
| 2 kpc | 116 pc | 330 pc | 880 pc |
| 5 kpc | 725 pc | 2.1 kpc | 5.5 kpc (no constraint) |
| 10 kpc | 2.9 kpc | 8.3 kpc (no constraint) | 22 kpc (no constraint) |

For the repo's own stars (G<14, ~0.015 mas): M13 at 7.42 kpc gives ±0.8 kpc per star, M22 at 3.30 kpc gives ±0.24 kpc (0.022 mas). Bailer-Jones adds a prior pull on top. This is the finger.

True size of the clusters (Baumgardt database, https://people.smp.uq.edu.au/HolgerBaumgardt/globular/parameter.html, rows read directly from the page HTML):

| cluster | distance | core r_c | half-light r_h,l (projected) | half-mass r_h,m (3D) | tidal r_t |
|---|---|---|---|---|---|
| M13 (NGC 6205) | 7.42 ± 0.08 kpc | 1.75 pc | 3.47 pc | 5.21 pc | 130.27 pc |
| M22 (NGC 6656) | 3.30 ± 0.04 kpc | 0.88 pc | 3.18 pc | 5.21 pc | 76.82 pc |
| omega Cen (NGC 5139) | 5.43 ± 0.05 kpc | 4.30 pc | 7.56 pc | 10.42 pc | 208.60 pc |
| 47 Tuc (NGC 104) | 4.52 ± 0.03 kpc | 0.61 pc | 4.03 pc | 6.44 pc | 124.63 pc |

Per-star error against cluster size: 780 pc / 3.5 pc is about 220 for M13 at G<14, and over 1000 at G=17.

Does anything measure per-star depth inside a globular at 5+ kpc? No.

- Gaia DR3: short by ~200-300 for the brightest members (above).
- Gaia DR4 / DR5 predicted parallax errors: 10 / 7 micro-arcsec at G=13, 22 / 16 at G=15, 59 / 42 at G=17, 211 / 149 at G=19; a 10 / 7 micro-arcsec floor for G<13 (https://www.cosmos.esa.int/web/gaia/science-performance). At 7.42 kpc that is ±550 pc (DR4) and ±385 pc (DR5) for the very brightest stars (computed). Resolving 5 pc at 7.4 kpc needs ~0.09 micro-arcsec (computed), about 80 times better than the DR5 floor. Crowding makes real cluster-core performance worse than these sky averages.
- HST: gives proper motions and star counts in cluster cores, not per-star parallaxes. Baumgardt & Vasiliev 2021 use HST only for kinematic and star-count distances to the cluster as a whole (https://arxiv.org/abs/2105.09526).
- RR Lyrae: near-infrared period-luminosity scatter in M15 is 0.02-0.037 mag in Ks (snippet, https://iopscience.iop.org/article/10.3847/1538-4357/ac214d), which is 1-2 % in distance before systematics (computed: fractional error is 0.46 x the magnitude scatter). Spitzer 3.6 micron gives ~2.5 % per star, Pan-STARRS ~3 % (snippets via the same search). The infrared surface-brightness method on 14 RR Lyrae in M3 shows 7 % star-to-star scatter (https://arxiv.org/abs/2512.09119). At 7.42 kpc, 2 % is 150 pc and 7 % is 520 pc, still 40-150 times the half-light radius, and it applies to tens or hundreds of stars per cluster, not all of them.
- Eclipsing binaries: 47 Tuc from two detached binaries, 4.55 ± 0.03 kpc and 4.50 ± 0.07 kpc (snippet, Thompson et al. 2020, MNRAS 492, 4254, https://academic.oup.com/mnras/article-pdf/492/3/4254/32289292/staa032.pdf). The best single-object case is 0.7 %, about 30 pc: inside the tidal radius, still 7 times the half-light radius, and available for one or two systems per cluster.
- Kinematic distances: omega Cen at 5494 ± 61 pc from 1.4 M proper motions and 300 k radial velocities (snippet, Häberle et al. 2025, https://arxiv.org/abs/2503.04903). This is a statistical distance for the cluster, by construction not per star.

What is well measured is the cluster as a whole: mean distances agree across methods to about 2 %, and to 1 % or better for about 20 nearby globulars (https://arxiv.org/abs/2105.09526).

## 3. Membership catalogues with Gaia source_ids

EDR3 and DR3 share source_ids: "The source list for Gaia EDR3 and Gaia DR3 is identical" (https://www.cosmos.esa.int/web/gaia/dr3). DR2 ids differ; the same page points to a DR2-to-EDR3 match table. The repo's own distance join already relies on this (`external.gaiaedr3_distance` joined to `gaiadr3`).

**Vasiliev & Baumgardt 2021** (MNRAS 505, 5978; bibcode 2021MNRAS.505.5978V), globulars

- Download: https://zenodo.org/records/4891252 (v2, 2021-06-01), one file `clusters.zip`, 118,940,646 bytes, 329 MB unpacked. Licence CC-BY-4.0 (Zenodo record metadata). VizieR J/MNRAS/505/5978 holds only the 170-row cluster table and points to Zenodo for the stars.
- 170 clusters, one text file each. Columns from the bundled readme and file headers: `source_id ra dec x y plx pmra pmdec plxe pmrae pmdece pmcorr g_mag bp_rp Sigma qflag memberprob`. `x, y` are degrees from the cluster centre; `qflag` bit 2 marks stars that passed all quality filters.
- 2,343,282 rows in total, 959,417 with `memberprob >= 0.9`. At the repo's G<14 cut only 10,021 of those remain (computed from the files): M13 243, M22 579, omega Cen 1,992, 47 Tuc 1,983.
- Limits: only stars with 5- or 6-parameter astrometry (readme), so the most crowded core stars are absent, the same stars that have no Bailer-Jones distance either. The search region is a circle smaller than the tidal radius: 0.417 deg for M13, which is 54 pc at 7.42 kpc against a 130 pc tidal radius (computed).

**Hunt & Reffert 2023** (A&A 673, A114; VizieR J/A+A/673/A114) and **2024** (A&A 686, A42; VizieR J/A+A/686/A42), open clusters

- `members.dat`: 1,291,929 rows with `GaiaDR3` (source id) and `Prob` (0-1 membership probability); `clusters.dat`: 7,167 clusters. Member rows are 1,130-1,197 bytes wide, so the full table is about 1.5 GB as text (computed); a VizieR TAP query for the three needed columns is far smaller.
- Searched Gaia DR3 down to G~20. The abstract counts 7,200 clusters including 134 globulars; the 2024 table has a `Type` column with `g` for globular, plus `r50pc`, `rtpc`, `dist50` and Jacobi radii per cluster.
- The abstract warns that a few thousand entries look like unbound moving groups; the 2024 paper adds the Jacobi-radius test to separate them. Member lists often include tidal tails.
- No licence text in either ReadMe.

**Cantat-Gaudin et al. 2020** (A&A 640, A1; VizieR J/A+A/640/A1)

- `nodup.dat`: 234,128 members with `GaiaDR2` and `proba`; `table1.dat`: 2,017 clusters; photometry to G=18.
- DR2 source ids, so it needs the DR2-to-DR3 neighbourhood table before joining. Superseded for this purpose by Hunt & Reffert.

Recommendation for data: Vasiliev & Baumgardt for globulars (purpose-built, clear licence, small). Hunt & Reffert only if open clusters beyond ~400 pc are in scope; its 134 globulars would let one catalogue cover both, at the cost of a less specialised membership model.

Verification gap: the three VizieR ReadMe files were read through `curl`; the VizieR directory listing with real file sizes was blocked by a bot check, so Hunt & Reffert byte sizes are computed from row count times record length.

## 4. Options for placing members

Notation: D is the cluster distance, R the star's projected distance from the cluster centre (sky angle times D), z its line-of-sight offset from the cluster centre. The star is placed along its own observed sky direction at distance D + z.

**a. Snap to the mean distance (z = 0).**
Accurate: sky position, cluster centre, projected shape, luminosity. Wrong: the cluster becomes a disc one star thick, visibly flat from any viewpoint off the Sun's line of sight. For a half-light radius of 3.5 pc the error per star is a few pc, which is 200 times smaller than today's, but the flatness is a systematic artefact rather than noise.

**b. Mean distance plus a depth drawn from the cluster's density profile.**
Accurate: sky position of every star, centre, 3D size, shape and radial density of the cluster, luminosities. Not measured: which side of the cluster each individual star is on. That number does not exist in any catalogue (section 2), so this is the full extent of the available information.

Plummer sphere, density proportional to (1 + r^2/a^2)^(-5/2). The scale a equals the projected half-light radius (r_h,l in the Baumgardt table; the 3D half-mass radius is 1.305 a). Substituting r^2 = R^2 + z^2 and writing b^2 = a^2 + R^2:

- density along the line of sight: p(z | R) = (3 b^4 / 4) (b^2 + z^2)^(-5/2)
- this is a Student-t distribution with 4 degrees of freedom scaled by b/2: z = (b/2) T_4, standard deviation b / sqrt(2)
- cumulative: F(z) = 1/2 + (3/4)(u - u^3/3), with u = z / sqrt(b^2 + z^2)
- closed-form inverse for a uniform draw F in (0,1): u = 2 cos((arccos(1 - 2F) + 4 pi) / 3), then z = b u / sqrt(1 - u^2)
- check values: F = 0.5 gives z = 0; F = 0.75 gives z = 0.370 b
- truncation: redraw (or clamp) when R^2 + z^2 > r_t^2
- determinism: F comes from a hash of `source_id`, as `supplementTaper.ts` already does for its keep decision

(The derivation is mine, from the Plummer density; not taken from a paper.) For M13 at the centre, the spread is 3.47 / sqrt(2) = 2.5 pc.

King profile: the 1962 empirical profile has a closed-form space density in r_c and r_t (unverified, King 1962 eq. 27, from memory), but its line-of-sight conditional has no closed-form inverse. It needs a numeric table of the density along z from 0 to sqrt(r_t^2 - R^2) and an inverse-CDF lookup per star. It also needs r_c and r_t per cluster, both present in the Baumgardt table. The visible difference from Plummer is in the outer envelope, where few G<14 stars sit; Plummer truncated at r_t with a = r_h,l is a reasonable first cut.

**c. Bayesian per-star distance with membership as the prior.**
Posterior is the parallax likelihood times a mixture: memberprob x cluster profile + (1 - memberprob) x field prior. With Gaussians, the parallax moves the star away from the prior mean by the fraction s^2 / (s^2 + sigma^2), where s is the cluster depth and sigma the parallax distance error.

- M13 at G<14: s = 2.5 pc, sigma = 780 pc, fraction 1e-5 (computed). The parallax contributes nothing; the posterior is the prior. Taking its mean gives (a), sampling it gives (b). It also needs parallax and error columns the repo does not fetch.
- It only matters where sigma is comparable to s. For G<14 stars at ~0.02 mas, sigma_d = 0.36 pc at the Pleiades (135 pc) and 0.04 pc at the Hyades (47 pc) (computed), against a Hyades tidal radius of about 10 pc (snippet, https://arxiv.org/pdf/1811.06561; the same paper quotes a mean per-star distance error of 0.30 pc). Heyl et al. report a median distance uncertainty of 1.4 pc for the Pleiades in EDR3 and treat line-of-sight structure as real (snippet, https://iopscience.iop.org/article/10.3847/1538-4357/ac45fc; abstract at https://arxiv.org/abs/2110.03837 confirms ~1,300 members). There the Bailer-Jones distance the repo already uses is the measurement, and the prior adds little.
- Crossover (computed, 0.02 mas): per-star error equals a 3 pc open-cluster half-radius near 400 pc and a 10 pc tidal radius near 700 pc. Between roughly 300 pc and 1 kpc the Bayesian combination would give a real gain over both raw parallax and (b).

**d. Better methods in the literature.**

- Hyades and Pleiades have published per-star 3D maps from Gaia (Lodieu et al. 2019, A&A 623, A35, https://arxiv.org/abs/1901.07534: 710 candidates within 30 pc of the centre at 47.03 ± 0.20 pc; Heyl et al. above). These confirm that direct parallax is enough at that range.
- Kinematic (moving-cluster) parallaxes give per-star distances for nearby clusters with large proper motions; used for over a thousand Pleiades members (snippet, https://www.aanda.org/articles/aa/pdf/2017/02/aa29239-16.pdf). Not applicable to globulars, whose internal velocity dispersion swamps the perspective effect at 5 kpc (unverified reasoning).
- For globulars I found no published per-star 3D reconstruction. The kinematic-distance work on omega Cen and the Baumgardt N-body fits are statistical descriptions of the cluster, which is what (b) samples from.

Most accurate achievable, by regime:

- under ~300 pc: keep the per-star Gaia distance (today's behaviour).
- ~300 pc to ~1 kpc, open clusters: option (c) is the best estimate; (b) is a simpler approximation.
- beyond ~1 kpc, all globulars: option (b). It uses every measured quantity and invents only the one that cannot be measured.

## 5. Field stars

The same radial smear affects every star at several kpc; clusters only make it obvious because the true extent is known. At G<14 the fractional parallax error is about 0.015-0.02 mas times d in kpc: 8-10 % at 5 kpc, so ±400-500 pc (computed). Photogeometric distances, which the repo already prefers, "generally have higher accuracy and precision for stars with poor parallaxes" than geometric ones (https://arxiv.org/abs/2012.05220). StarHorse (Anders et al. 2022, A&A 658, A91; 362 M stars to G=18.5; data at data.aip.de/projects/starhorse2021.html) quotes typical precisions of 3 % at G=14 and 15 % at G=17 by adding multi-survey photometry (https://arxiv.org/abs/2111.01860). That would shorten the rays for the repo's G<14 sample but not remove them, and it is a different join over all 16.8 M rows. Gaia GSP-Phot distances are reported to be biased low beyond ~2 kpc (unverified, from memory). Out of scope for a cluster-only fix; a separate backlog line if wanted.

## 6. Cost for this repo

Data

- Globulars: `clusters.zip`, 119 MB, CC-BY-4.0, one new `rawDataRegistry` entry and a fetcher step. Only `source_id`, `x`, `y`, `memberprob` are read.
- Cluster parameters (centre, D, r_h,l, r_t): the Baumgardt parameter page, a 189 KB HTML table of about 160 clusters. No licence statement was seen on the page; a small committed seed with attribution is the usual pattern here. The structures feature in this branch may already carry distances for the same clusters; the two must agree or the stars will sit off the marker.
- Open clusters (optional): Hunt & Reffert members via VizieR TAP, three columns of 1.29 M rows.

Join

- A `Map<bigint, {clusterId, memberprob}>` built from the member files, filtered to `memberprob` above a threshold (0.9 is the cut one recent study uses, per search snippet). About 10,000 entries at G<14, far below the 2^24 Map cap that the build comments warn about.
- Looked up at `buildStars.ts:310`, before `resolveStarDistancePc`: a member gets D + z in place of the Bailer-Jones value. `absMag` at `:332` then follows from the new distance with no extra code.
- Members with no Bailer-Jones row become placeable instead of counting as `noBailerJones`, and members currently lost to the 12 kpc cap come back. Clusters beyond 12 kpc stay excluded unless the cap is revisited.
- Mirror in `tools/stars-rs/src/population.rs:317`. Two builders is the main maintenance cost.
- New pure helper, e.g. `utils/.../plummerLineOfSightOffset.ts`, one function, one test.

Re-bake

- Full re-bake of all three star tiers: positions change, so Morton order, leaf records and interior flux aggregates change, and the content-hashed filenames (`stars-large.aa3f92db.bin` today) change with them. No Gaia re-fetch. The format and the runtime are untouched. Tier star counts may shift by a few stars because gzip size moves.
- Grid bounds are set by the 12 kpc cap, not by cluster stars, so the grid is effectively unchanged.

Tests that would pin it

- Helper: for fixed R and a, the draw at F = 0.5 is 0 and at F = 0.75 is 0.370 sqrt(a^2 + R^2); the same `source_id` always gives the same z; no draw leaves the tidal sphere.
- Build (`tests/tools/stars/buildStars.test.ts` fixture): three member rows of one cluster with Bailer-Jones distances of, say, 4, 7 and 11 kpc all land within r_t of the cluster centre; each keeps its exact unit direction; a non-member at the same sky position keeps its Bailer-Jones distance; a member's `absMag` matches its new distance.
- A real-data assertion ("every M13 member within 130 pc of the centre") needs the 2 GB raw catalogue and belongs in the build log as a counter, not in the Vitest suite.

Open choices for the backlog item

- Plummer versus tabulated King.
- Membership threshold.
- Whether open clusters between 300 pc and 1 kpc are in scope (that is what pulls in Hunt & Reffert and option c, including fetching `parallax` and `parallax_error`).
- Whether the UI should say that in-cluster depth is statistical.
