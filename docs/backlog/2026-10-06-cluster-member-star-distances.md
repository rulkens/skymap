# Cluster member stars smear into a radial finger

**Seen:** 2026-10-06, with the globular-cluster rings on screen. M13 and M22 sit on a line of Gaia stars several kpc long that points at the Sun. Each member is placed at its own noisy distance.

**Rewritten 2026-10-14** around the published method after the user's ruling: placement must be physically accurate, no random draws. The earlier recommendation (a depth drawn from the cluster's density profile) is withdrawn.

## Summary

- **Method:** place each member at its Bayesian posterior-mean distance. The posterior combines the star's own parallax with a cluster prior (cluster distance D, depth s). Pang et al. and Kalkayotl (below) use this for cluster 3D maps. It is deterministic. With a Gaussian prior it has a closed form in parallax space.
- **What it gives (tested on 14 clusters, below):**
  - Within ~200 pc it keeps the measured 3D shape and halves the per-star error.
  - At 300–450 pc it pulls stars toward the centre, by exactly as much as each parallax is uncertain.
  - Beyond ~450 pc it puts members at the cluster's distance on their own sky directions. The cluster then reads as a disc facing the Sun.
- **The limit is physical, not a method choice:** "the 3D structure of an open cluster cannot be properly studied beyond about 500 pc" with any parallax-to-distance method (Piecka & Paunzen 2021). No survey measures per-star depth inside a globular.
- **Cost:** add `parallax` and `parallax_error` to the Gaia fetch, add a Hunt & Reffert 2024 member + cluster table, a one-function helper at the distance-resolve step, one re-bake. No format or runtime change.

## 1. Literature

- **Bayesian distances with a cluster prior.** Pang et al. 2021 (ApJ, doi:10.3847/1538-4357/abeaac, https://arxiv.org/abs/2102.10508) and 2022 (ApJ 931, 156) model members as Gaussian in distance and the field as an exponentially decreasing density, and take the posterior mean as the corrected distance; 3D morphology for clusters within 500 pc. Fractal-dimension follow-up: https://arxiv.org/pdf/2412.08710; methods summary: https://iopscience.iop.org/article/10.3847/1538-4357/ac674e. Meingast et al. 2021 use a 3D Gaussian-mixture prior instead (as cited in Xu et al. 2025).
- **Kalkayotl** (Olivares et al. 2020, https://arxiv.org/pdf/2010.00272): open-source hierarchical code that fits the cluster's distance and size together with every member's distance. It models Gaia's spatially correlated parallax errors; ignoring them underestimates uncertainties. Cluster distances are reliable to ~5 kpc. **Kalkayotl 2.0** (A&A 693, A12, 2025; https://arxiv.org/pdf/2411.16012) does full 3D/6D for systems of ≲ 1000 stars. Applied to the Carina complex: https://arxiv.org/pdf/2201.09097.
- **The 500 pc limit.** Piecka & Paunzen 2021 (https://arxiv.org/abs/2107.07230; 1,229 clusters, DR2): inverse parallax and Bayesian distances give the same needle-like elongation within 2 kpc. Their conclusion is the quote in the summary. Xu et al. 2025 (A&A 698, A156, https://arxiv.org/abs/2504.17744) restrict 3D King-profile fits to clusters within 500 pc. Even there they keep only eight with minimal line-of-sight distortion (Blanco 1, Melotte 20, Pleiades, Praesepe, NGC 7092, NGC 1662, Roslund 6, Melotte 111). Blanco 1's line-of-sight extension was judged an artefact (https://arxiv.org/pdf/1912.06657).
- **Globulars.** No per-star depth reconstruction was found. Their distances are cluster-level: mean parallaxes, HST, kinematic and literature distances (Baumgardt & Vasiliev 2021, https://academic.oup.com/mnras/article/505/4/5957/6283731).
- **Estimators for the spread** (statistics, not astronomy): posterior means under-disperse. Constrained Bayes (Louis 1984, JASA 79, 393; Ghosh 1992, JASA 87, 533) rescales them so the spread matches the prior. It is tested below and rejected.

## 2. The estimator

Parallax space, where Gaia's likelihood is Gaussian. Per member i with parallax ϖᵢ ± σᵢ, in a cluster at distance D (ϖ₀ = 1000/D mas) with depth s (pc):

- τ = s·ϖ₀²/1000, the cluster's depth expressed in parallax
- ϖ̂ᵢ = (ϖ₀/τ² + ϖᵢ/σᵢ²) / (1/τ² + 1/σᵢ²)
- distance = 1000/ϖ̂ᵢ, along the star's exact sky direction
- posterior depth uncertainty = (1000/ϖ₀²)·(1/τ² + 1/σᵢ²)^(−½) pc
- `absMag` is recomputed from the new distance; the build already derives it from whatever distance it resolves.

Inputs in the test: D = Hunt & Reffert `dist50`. Each star's parallax is shifted by the catalogue's own offset (1000/`dist50` − cluster `Plx`, ~0.04 mas for the Pleiades), so the mean sits at D. s = the cluster's per-axis sky-plane dispersion (robust), which assumes a spherical cluster.

## 3. Test on 14 clusters (2026-10-14)

Data: Hunt & Reffert 2024 members via VizieR TAP (`J/A+A/686/A42/members`, `clusters`): Prob ≥ 0.5, RUWE < 1.4, inside the tidal radius (`inrt`).

Columns:
- s: sky-plane dispersion per axis (pc).
- σ_d: median per-star distance error (pc).
- resolved: fraction of members with σ_d < s.
- LOS raw / post: robust line-of-sight spread with raw distances / posterior means.
- Mock: the same stars with the same errors, true depths drawn from N(0, s). It shows per-star RMS depth error for raw distances, the posterior mean and snapping to D, and ρ, the correlation of the posterior depth with the true depth.

| Cluster | D (pc) | stars | s | σ_d | resolved | LOS raw | LOS post | mock RMS raw | RMS post | RMS snap | ρ post |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Hyades | 47 | 295 | 2.8 | 0.1 | 100 % | 2.8 | 2.8 | 0.1 | 0.15 | 2.6 | 1.00 |
| Pleiades | 135 | 939 | 2.2 | 1.1 | 84 % | 2.9 | 2.0 | 2.0 | 1.2 | 2.4 | 0.87 |
| Praesepe | 183 | 734 | 2.7 | 1.8 | 61 % | 3.5 | 1.6 | 5.3 | 1.7 | 2.6 | 0.75 |
| M7 | 276 | 876 | 2.7 | 2.5 | 55 % | 5.9 | 2.0 | 6.8 | 2.1 | 2.7 | 0.66 |
| NGC 752 | 434 | 182 | 2.5 | 4.5 | 1 % | 7.6 | 1.1 | 10 | 2.1 | 2.5 | 0.58 |
| M6 | 452 | 516 | 1.6 | 8.9 | 0 % | 10 | 0.2 | 19 | 1.6 | 1.6 | 0.21 |
| M41 | 715 | 543 | 2.7 | 15 | 0 % | 20 | 0.4 | 51 | 2.7 | 2.8 | 0.25 |
| M67 | 837 | 780 | 2.0 | 21 | 0 % | 26 | 0.2 | 61 | 2.0 | 2.0 | 0.08 |
| M37 | 1402 | 1202 | 2.5 | 63 | 0 % | 71 | 0.1 | 329 | 2.5 | 2.5 | 0.11 |
| M4 (glob) | 1771 | 11969 | 2.3 | 354 | 0 % | 325 | 0.0 | 4600 | 2.3 | 2.3 | 0.00 |
| h Persei | 2280 | 401 | 2.3 | 134 | 0 % | 92 | 0.0 | 339 | 2.2 | 2.2 | 0.00 |
| NGC 6397 (glob) | 2385 | 13344 | 3.5 | 706 | 0 % | 610 | 0.0 | 28 000 | 3.5 | 3.5 | 0.02 |
| ω Cen (glob) | 5274 | 41580 | 18.7 | 5082 | 0 % | 2716 | 0.1 | 51 000 | 18.7 | 18.7 | 0.02 |
| M13 (glob) | 7934 | 5734 | 10.4 | 8114 | 0 % | 4292 | 0.0 | 69 000 | 10.5 | 10.5 | 0.01 |

Readings:

- **≤ ~200 pc (Hyades, Pleiades):** depth is measured. The posterior keeps the shape (Pleiades LOS 2.0 vs sky 2.2) and beats raw distances per star (1.2 vs 2.0 pc). A free fit of the depth from parallaxes alone returns the sky size (Pleiades 2.7 pc, Hyades 3.5 pc), so Gaia constrains it.
- **~200–450 pc (Praesepe, M7, NGC 752):** depth is partly measured (ρ 0.58–0.75). Posteriors are the most accurate per star but compress the cluster along the line of sight (Praesepe 1.6 vs 2.7 pc): the cluster looks flattened.
- **≥ ~450 pc:** depth is not measured (ρ ≤ 0.25). The posterior equals snapping to D (RMS post = RMS snap), and the cluster renders as a disc facing the Sun. Raw distances err by 10–30 000× the cluster size.
- **Constrained Bayes** (posterior spread rescaled to s) is worse than the posterior mean everywhere: Pleiades 1.17 vs 1.15, M7 2.26 vs 2.05, M67 2.67 vs 1.96, M13 14.7 vs 10.5 pc. Beyond ~450 pc it scales parallax noise up to look like depth, so it is not used.
- **Gaia errors look underestimated beyond ~400 pc.** The free depth fit grows with distance where the sky size does not: M67 16 pc, M37 29 pc, M4 128 pc, against 2–3 pc on the sky. That fits Vasiliev & Baumgardt's 10–20 % error underestimate in dense regions plus the spatially correlated systematics Kalkayotl models. Where depth is unmeasured it doesn't matter, since the posterior already sits at D. In the 200–450 pc band, inflating σᵢ would pull stars slightly further toward the centre.

The test script (`posterior_test.py`) and the side-view figure were run from a scratch directory and are not committed. To reproduce: query the member table as above, then apply §2.

## 4. Repo touch points (verified 2026-10-14)

- Fetch: `tools/fetch/fetchGaia.ts:128` selects from `gaiadr3.gaia_source_lite` without `parallax` / `parallax_error`; both need adding (the GCNS query at `:141` already fetches `parallax`). Hunt & Reffert members + clusters need a new `rawDataRegistry` key and VizieR TAP fetch.
- Resolve: `tools/stars/buildStars.ts:213` (`resolveStarDistancePc`) is where a member's posterior distance replaces Bailer-Jones; `absMag` follows at `:235`. `selectStars` strips `source_id` later, so the join cannot move downstream.
- Positions are final before `buildOctreeCatalog` (`:325`), so the octree and format are untouched. The 12 kpc cap (`:76`, applied at `:293`) stays; members whose noisy distance fell past it come back.
- `tools/stars-rs` still builds the v1 tiers; mirror the change there only if v1 is still shipped when this lands.
- New one-function helper, e.g. `tools/utils/stars/clusterPosteriorDistance.ts`, with a focused test:
  - σ ≪ τ returns the star's own distance;
  - σ ≫ τ returns D;
  - the result never leaves the line between the two.

## 5. Open choices

- **Prior depth s:** the sky-plane dispersion (spherical assumption, used in the test) or Hunt & Reffert `r50pc` / King radii. The papers use a Gaussian.
- **Error inflation:** a fixed factor in the 200–450 pc band, or none.
- **Scope:** all Hunt & Reffert clusters (7,167, globulars included), or only the seed's structures. Members outside the tidal radius (`inrt` = 0, often tidal tails) keep their own distance.
- **Membership threshold** (the test used Prob ≥ 0.5).
- **Faint members:** whether the G ≥ 14 members beyond the current cut join the bake. Under a "measured depth only" rule, 3,014 qualify in the seed's clusters and ~39 k across all clusters (σ_d < `r50pc`, RUWE < 1.4). Under posterior-mean placement, every member can join, since far ones sit at D.
- **UI:** whether a cluster's info card says that member depth beyond ~450 pc is unmeasured, i.e. why it looks flat side-on.
