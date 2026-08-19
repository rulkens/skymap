# Perf matrix — dense vs. sparse pose, pre-accel vs. accel, scale 3 vs. 1

All runs: `--tier large`, `--frames 30`, from the feature worktree
(`tools/perf/perfScenarios.ts` + `measurePerf.ts` on this tree; only the
`--url` target changed between legs). Every JSON result's `"tier"` field
read back `"large"` — confirmed on all 28 runs, no silent medium-tier
fallback.

**Legs.** `C'` = `origin/main` (`a5c3527ae`, scratch worktree
`perf-main-tip`, port 5199) — pre-acceleration. `B` = this feature worktree
(`a3834fb9a`, port 5175) — carries the 14 commits `origin/main..HEAD` adds:
TF-adaptive empty-space skip, the per-field max-value mip pyramid, and
cone-footprint LOD + honest step sizing in the raymarch loop. Both trees ran
with `polyphorm-2mrs.visible: true` (uncommitted) and `renderTargets.ts`'s
`volume` row scale patched identically per phase; both patches were reverted
after the run (see Cleanup).

Poses: `volume-inside` (MCPM cube centroid — dense/filament-adjacent) vs.
`void-inside` (near-corner target, confirmed by direct `.scfd` sampling to
read 0% nonzero voxels along 5 of 6 axis rays out to 300 Mpc — sparse,
skip-favorable). 3 rounds per cell, alternated C'/B within each round.

## volume-inside (dense pose)

| | scale 3 | scale 1 |
|---|---|---|
| **C'** volume·COSMO MERGED | 2.16 ms | 17.01 ms |
| **C'** scalar-volume PER-LAYER | 2.16 ms | 19.14 ms |
| **C'** TOTAL merged | 14.39 ms | 51.41 ms |
| **B** volume·COSMO MERGED | 2.97 ms | 24.58 ms |
| **B** scalar-volume PER-LAYER | 2.98 ms | 26.51 ms |
| **B** TOTAL merged | 23.71 ms | 57.87 ms |
| **B/C' ratio (volume·COSMO)** | 1.38× (slower) | 1.44× (slower) |

B (accelerated) is **slower** than C' on the dense pose, at both scales, by
a consistent ~38-44%. Medians; ranges were wide (C' scale-3 14.3-22.3 ms
n=3; B scale-3 13.9-58.7 ms n=6 — see Noise below).

## void-inside (sparse pose)

| | scale 3 | scale 1 |
|---|---|---|
| **C'** volume·COSMO MERGED | 2.23 ms | 27.85 ms |
| **C'** scalar-volume PER-LAYER | 2.23 ms | 32.08 ms |
| **C'** TOTAL merged | 24.18 ms | 74.51 ms |
| **B** volume·COSMO MERGED | 1.25 ms | 18.22 ms |
| **B** scalar-volume PER-LAYER | 1.31 ms | 22.35 ms |
| **B** TOTAL merged | 18.71 ms | 67.70 ms |
| **B/C' ratio (volume·COSMO)** | 0.56× (faster) | 0.65× (faster) |

B is **faster** than C' on the sparse pose, at both scales, by a consistent
~35-44%. This is the mirror image of `volume-inside`: the acceleration only
pays for itself when its skip logic actually has something to skip.

## 2mrs on/off delta (leg B, scale 3, volume-inside, 2 rounds each)

| | TOTAL merged | volume·COSMO | hdr·COSMO |
|---|---|---|---|
| `polyphorm-2mrs.visible: true` | 22.51 ms | 1.93 ms | 14.09 ms |
| `polyphorm-2mrs.visible: false` | 18.55 ms | 2.10 ms | 11.60 ms |
| delta | **+3.96 ms (+21%)** | -0.17 ms (noise) | +2.49 ms |

Turning the second field on costs ~4 ms total, but the delta shows up in
`hdr·COSMO`, not `volume·COSMO` — the opposite of what "two fields drawn in
the same raymarch pass" would predict. With only 2 rounds/side (one round's
`2mrsOff` reading 24.05 ms — higher than any `2mrsOn` reading) this is not a
clean signal, just a directional "not free."

## Tier confirmation

All 28 `measurePerf.ts --json` results carry `"tier": "large"` — no run
silently fell back to the `medium` boot tier.

## Noise notes

Session-level GPU contention (this is a shared/multi-agent machine, per
`task-1-report.md`) was substantial and grew over the session: `uptime`
load averages ran 3.9-4.9 during the scale-3 phase and climbed to 7-13
during the scale-1 phase, visible in the widening min-max ranges above
(e.g. `void-inside`/scale-1/C' ranged 54.9-96.4 ms across 3 rounds, p90s up
to 152 ms). Two individual `measurePerf` invocations hung indefinitely
(>5 min, vs. a normal ~15-30 s) and were killed and re-run cleanly — not
reproducible, likely a one-off Playwright/navigation stall rather than a
renderer regression, since retries on the same URL/pose succeeded
immediately. Despite the noise, the C'-vs-B *direction* was consistent
across every round at both scales for both poses — the ratios above are
medians of a noisy but directionally unanimous set, not a single lucky
pairing.

## Interpretation

**Does the acceleration stack beat pre-accel on the sparse pose? Yes,
clearly** — ~35-44% faster on `void-inside` at both scales, consistent
across all 6 paired rounds. But it is not a free win: the same stack is
~38-44% *slower* on the dense `volume-inside` pose, at both scales. The
mip-pyramid lookup + TF-adaptive skip check + cone-LOD step sizing cost
something on every step regardless of whether a skip actually fires; on a
pose where rays neither early-saturate nor find long empty spans (dense,
near-uniform moderate density — exactly what `task-1-report.md` found made
`volume-inside` resistant to *any* pose-based differentiation on the
pre-accel renderer), that per-step overhead is pure loss.

**Scale-2 decision (Task 7).** The scale lever (3 → 1, i.e. dropping the
downsample) and the acceleration lever look independent: the B/C' ratio is
essentially the same at scale 3 and scale 1 for both poses (dense: 1.38× →
1.44×; sparse: 0.56× → 0.65×). Scale multiplies the *absolute* cost (scale
1 is ~3-9× scale 3's numbers, matching the fragment-count-squared model in
`renderTargets.ts`'s header) without changing which pose regime wins or
loses under acceleration. So the scale-2 call can be made on its own
fragment-budget terms without worrying that it will flip the
dense-regresses/sparse-improves story either direction.

**Multi-cube follow-up.** The 2mrs on/off test is the more concerning
result for a multi-cube future, even though it's underpowered (n=2): a
second active field cost ~21% more total frame time in this sample, and
that cost did NOT land in `volume·COSMO` where a shared-pass amortization
story would put it — it showed up in `hdr·COSMO` instead, suggesting the
two fields are not cheaply co-batched the way the render-target comment
implies. Before committing to a multi-cube architecture, this needs a
clean, higher-n, paired measurement (ideally isolating which pass the
second field's cost actually lands in) rather than reasoning from this
matrix's 2-round side test.
