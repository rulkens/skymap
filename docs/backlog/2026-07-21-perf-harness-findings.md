# Perf-harness findings — first measured hotspots (2026-07-21)

First real data out of `npm run perf` (PR #464), captured at 1400×900 @dpr2 on the M-series dev
machine, 20–30 frames per sample, merged (production-shape) strategy. Each is a candidate
optimization target; none was chased. Reproduce with the commands shown — the harness is
deterministic enough that medians land within ~0.5 ms run-to-run.

## 1. `large` tier ≈ 3× `medium` — blows the 60fps budget on its own

`npm run perf -- --scenario full-survey --compare-tiers --frames 20`

| pass         | small | medium | large |
| ------------ | ----- | ------ | ----- |
| hdr·COSMO    | 4.9   | 4.0    | 14.8  |
| hdr→swap     | 2.3   | 2.0    | 5.8   |
| swap·COSMO   | 2.1   | 1.2    | 2.7   |
| volume·COSMO | 0.9   | 0.8    | 1.0   |
| **TOTAL**    | 10.0  | 7.8    | 21.8  |

Per-layer attribution at `--tier large`: `point-sprites` ≈ 11.9 ms real (floor-subtracted) — the
survey point pass dominates. The known survey-perf levers (focus gate, compute cull for
partial-view, overdraw reduction — see `project_point_renderer_perf` memory) now have a number to
beat and a harness to verify against.

## 2. `small` tier measurably SLOWER than `medium` (10.0 vs 7.8 ms)

Counterintuitive — small loads fewer points. Unexplained. Hypotheses worth testing with the
harness before believing any of them: the milky-way procedural point cloud regenerates per tier
switch with tier-dependent counts; GLADE-small's brighter-cut population may produce larger
sprites (more overdraw per point); first-context warm-up (small is measured first in
`--compare-tiers` order). Cheap experiment: reverse the tier order in `TIERS` locally and see if
the anomaly follows the order or the tier.

## 3. solar-system sits just over budget: 16.9 ms, `hdr·NEAR0` = 60%

`npm run perf -- --scenario solar-system --frames 30`

TOTAL (merged) 16.9 ms/frame → ~59 fps ceiling. `hdr·NEAR0` alone is 10.2 ms; per-layer
attribution puts `star-catalog` ≈ 6.1 ms and `star-upsample` ≈ 6.0 ms real. The `--sweep`
classifier measured `hdr·NEAR0`/`star-catalog` as **vertex/CPU-bound** (exponent ≈ 0.25), so
resolution-scaling won't help — the cost is per-star work, not fill. Candidate levers: star-count
culling at NEAR0, or moving per-star computation out of the vertex path.
