# Spike: fatter octree leaves (`STAR_LEAF_CAPACITY`) — does raising it cut the star renderer's CPU frame cost?

Date: 2026-07-23. Branch: `worktree-spike-fat-leaves`. Status: spike complete, **recommendation: hold (no-go for now)**.

## TL;DR

Raising `STAR_LEAF_CAPACITY` (currently 64) does cut CPU frame cost roughly in
proportion to the shrink in cut-node count: ~**halved at 256, ~third at 512** at
the 89 pc star-field pose. Precision cost is negligible at every capacity. But
the CPU win is **redundant with the planned cull-in-walk change** (which attacks
the same cut-size cost ~6× harder and independently), while the fat-leaf **costs
do not go away** with cull-in-walk: at mid zoom (2 kpc) fatter leaves inflate
on-screen instance count 3–6× (a sub-pixel fat leaf draws its whole star set
instead of one cheap aggregate), and LOD pops get ~3× lumpier. **Recommend
landing cull-in-walk first, then re-measuring**; do not adopt 512 at all.

## Method

Throwaway CPU-timing harness (`spike-harness/`, git-excluded, not in `src/` or
the suite). It imports the **real** `walkStarOctreeCut`, `starOctreeIndex`,
`sphereOutsideFrustum`, `frustumPlanesFromViewProj`, and `writeStarNodeParams`
unmodified, and faithfully replicates the two remaining CPU stages from
`starCatalogLayer.computeStarCut` (fade + partition, passes 1/2, `NODE_FADE_MS`
250) and `starCatalogRenderer.draw` (frustum cull + 32-byte `NodeParams` pack +
exclusive prefix sum). Flat typed arrays, no per-node allocation. 40 warmup +
120 measured frames on a slowly orbiting camera (0.003 rad/frame, churns the
fades) at three heliocentric poses. Budget `{typical:1_500_000,
hardCap:2_500_000}`, threshold 0.16, viewport 2560×1440, FOV_Y 60°.

**Variant generation — in-memory fold (not a real rebuild).** Folding is
monotonic in the threshold: a real cap-N build (N ≥ 64) emits a fat leaf for
every maximal subtree with real-star count ≤ N and deletes that subtree's
descendant nodes. `foldCatalog.mts` reproduces the exact cap-N **node topology**
from the shipped cap-64 catalog by collapsing each maximal ≤N subtree into one
synthetic fat leaf. This is provably exact for node counts / cut size / walk /
fade / pack cost. It does **not** re-quantize the 10-bit in-cell offsets, so the
record blob is meaningless for a folded node. **These variants are for CPU
timing + node counts ONLY — never a visual or GPU-upload claim.** No `.bin`
files were rebuilt or committed.

**Validation.** At cap 64 / 89 pc the harness reproduces the reference table:
cut 43,860 nodes (ref 44,021), leaf 20,324 / agg 23,542 (ref 20,846 / 23,753),
instances 1.50M (budget-capped). Per-stage proportions match
(walk:fade:pack ≈ 1.9:1.2:0.6, ref 2.5:1.7:0.8). Absolute times run ~2× faster
than the reference machine (this machine anchors the reference 8 ms at ~3.7 ms),
so reference-machine estimates below multiply harness ms by ~2.17.

## Result — capacity × pose

Loaded `stars-large.bin`: starCount 12,853,984, nodeCount 628,176,
cellEdgePc 23.243, level-0 offset quantum 0.0227 pc.

Harness ms (median over 120 frames); "ref" = ×2.17 to the reference machine.

| cap | nodeTable | pose | walk | fade | pack | total | ref total | cut nodes | leaf/agg | instances | drawn (post-cull) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **64** | 10.05 MB | 89 pc | 1.84 | 1.22 | 0.62 | **3.68** | **~8.0** | 43,860 | 20.3k/23.5k | 1.50M | 398k |
| | | 2 kpc | 0.99 | 0.80 | 0.44 | 2.24 | ~4.9 | 29,930 | 20.6k/9.3k | 495k | 80k |
| | | 11.1 kpc | 0.07 | 0.08 | 0.12 | 0.28 | ~0.6 | 2,732 | 1.7k/1.0k | 38k | 28k |
| **128** | 5.73 MB | 89 pc | 1.49 | 0.89 | 0.48 | **2.85** | **~6.2** | 32,224 | 15.9k/16.3k | 1.50M | 383k |
| | | 2 kpc | 0.72 | 0.60 | 0.35 | 1.67 | ~3.6 | 23,097 | 16.9k/6.2k | 772k | 156k |
| | | 11.1 kpc | 0.06 | 0.06 | 0.04 | 0.16 | ~0.3 | 2,213 | 1.5k/0.7k | 61k | 48k |
| **256** | 3.10 MB | 89 pc | 1.19 | 0.56 | 0.31 | **2.06** | **~4.5** | 20,794 | 10.7k/10.1k | 1.50M | 360k |
| | | 2 kpc | 0.52 | 0.44 | 0.26 | 1.21 | ~2.6 | 17,027 | 13.0k/4.1k | 1.17M | 308k |
| | | 11.1 kpc | 0.04 | 0.04 | 0.03 | 0.12 | ~0.3 | 1,705 | 1.1k/0.6k | 93k | 79k |
| **512** | 1.55 MB | 89 pc | 0.82 | 0.30 | 0.18 | **1.31** | **~2.8** | 11,804 | 6.4k/5.4k | 1.50M | 339k |
| | | 2 kpc | 0.33 | 0.27 | 0.17 | 0.77 | ~1.7 | 10,929 | 8.6k/2.3k | 1.50M | 481k |
| | | 11.1 kpc | 0.03 | 0.03 | 0.03 | 0.09 | ~0.2 | 1,353 | 0.9k/0.4k | 154k | 135k |

Every stage scales linearly with cut-node count, as hypothesized. The lever
works: cut nodes at 89 pc fall 43.9k → 32.2k → 20.8k → 11.8k, and CPU total
tracks it (~8 → 6.2 → 4.5 → 2.8 ms reference-scaled).

### Budget quantization / instance inflation (the GPU-cost proxy)

At **89 pc the cut is budget-limited** — instances stay pinned at ~1.5M for all
capacities, and post-cull drawn instances actually *drop* slightly
(398k → 339k) because there are fewer aggregate nodes. So at the problem pose
fatter leaves are pure win: less CPU *and* marginally less GPU fill.

At **2 kpc and 11.1 kpc the cut is threshold-limited** (well under budget), and
here fatter leaves inflate instances sharply: 2 kpc drawn instances 80k → 156k →
308k → **481k** (cap64→512, ~6×); 11.1 kpc 28k → 135k (~5×). Mechanism: a fat
leaf has `childMask == 0`, so the walk commits it as individual stars the moment
it is reached — it is **not** eligible for the sub-pixel→aggregate collapse that
a node-with-children gets. A fat leaf that is sub-pixel on screen still draws its
whole star set. The star renderer's full-view cost is fragment/blend-bound, so
this is a real GPU regression risk at intermediate zoom, exactly where CPU was
already cheap (2 kpc cap64 total was only ~4.9 ms reference).

## Cost assessment

**Position precision — negligible at all capacities.** Star-weighted offset
quantum (`cellEdge·2^level/1024`):

| cap | median | p90 | p99 | worst |
|---|---|---|---|---|
| 64 | 0.023 pc (L0) | 0.091 pc (L2) | 0.363 pc (L4) | 5.81 pc (L8) |
| 128 | 0.045 pc (L1) | 0.182 pc (L3) | 0.726 pc (L5) | 5.81 pc |
| 256 | 0.045 pc | 0.182 pc | 0.726 pc | 5.81 pc |
| 512 | 0.045 pc | 0.182 pc | 0.726 pc | 5.81 pc |

Precision degrades by exactly one octree level from 64→128 (median 0.023→0.045
pc) then **saturates** — 256 and 512 have identical star-weighted percentiles,
because the deepest folds only absorb the sparse tail (≤0.5% of stars land at
level ≥6). The error is scale-invariant against on-screen size: a level-L fat
leaf resolves into individual stars only when the camera is within ~12.5×(its
cell edge), at which distance its quantum subtends ~`1/(1024·12.5)` rad ≈ **0.1
px** against a 2.5 px star (~4% of a star's radius). The absolute worst case
(5.81 pc, sparse halo, level 8) already exists at cap 64 and does not worsen.
**Precision is not a blocker.**

**LOD pop size — the real visual cost.** A leaf fades in/out as one unit. Mean
stars per leaf in the 89 pc cut: 73 (cap64) → 93 (128) → 140 (256) → **234
(512)**, roughly tripling at 512. The fade is linear and flux-conserving over
250 ms (no hard pop), but a 234-star clump appearing as a unit is visibly
lumpier than a 73-star one. Catalog-wide mean leaf size grows 23 → 41 → 76 → 152
stars. Max leaf (1363, a dense core cell that cannot split) is capacity-independent.

**Bin size / star count — not measured (fold only).** Node table shrinks 10.05 →
5.73 → 3.10 → 1.55 MB (uncompressed, 16 B/node). In a *real* rebuild this frees
compressed budget: each tier truncates brightest-first to a fixed gzip budget
(large = 75 MB), so lower node overhead lets more stars survive. That secondary
gain (more stars per tier) was **not** quantified here because no bins were
rebuilt. It argues mildly *for* adoption, but does not change the recommendation.

## The decisive caveat: cull-in-walk supersedes the CPU benefit

The planned cull-in-walk change frustum-culls **during** the octree walk, so only
the ~1/6 of the working sphere that is on-screen is ever visited. It shrinks the
cut ~6× independently, cutting the same cut-size CPU cost this lever targets. The
two do **not** stack — they attack the identical quantity (cut-node count). After
cull-in-walk the 89 pc CPU cost drops to ~1.3 ms on its own; the fat-leaf lever's
marginal saving on top shrinks to a fraction of a millisecond, while its costs
(mid-zoom instance inflation, lumpier pops) remain fully in force. Adopting a
fat capacity now would lock in those costs for a benefit that largely evaporates
once cull-in-walk lands.

## Recommendation

**Hold. Do not raise `STAR_LEAF_CAPACITY` as a standalone change now.**

1. Land cull-in-walk first. Re-measure the 89 pc CPU cost afterward.
2. If CPU is still a problem post-cull-in-walk, revisit **128** — not higher.
   128 gives ~23% CPU cut, precision cost of one negligible level, the mildest
   pop growth (73→93), and the smallest mid-zoom instance inflation (2 kpc 80k→156k)
   of the candidates. **512 is out** regardless: biggest pop + up to 6× mid-zoom
   instance inflation, and its CPU edge is exactly what cull-in-walk erases.
3. If adopted later, the production change is exactly: edit the one constant
   (`tools/stars/buildStarOctree.ts:139`), `npm run build-tiers`, R2 sync. Not
   done here (spike).

### Notes / follow-ups

- `STAR_LEAF_CAPACITY` is **global across all tiers**. Small/medium tiers have a
  tighter byte budget and proportionally heavier node overhead, so they would
  gain more star-count headroom from fatter leaves, but they are also coarser
  already. If this is ever adopted, a per-tier capacity is the correct shape (the
  large tier can tolerate a different value than small) rather than one global
  constant. Flagged, not designed.
- **Not run (optional confirmation):** real rebuilds at 128/256/512 for actual
  gzipped bin sizes + the star-count-grows effect, a dev-server visual pass (pop
  lumpiness, far-field seams, near-camera sharpness), and `npm run perf
  --scenario star-field` before/after to confirm the 2 kpc instance-inflation
  GPU regression. The CPU + instance-count evidence above already points to the
  hold recommendation; these would harden the GPU-cost and bin-size claims if the
  decision is revisited.
```

Raw harness output: `spike-harness/sweep.txt`, `spike-harness/analyze.txt`.
