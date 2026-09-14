# T19 — paired A/B perf measurement of the cameraRuntime single-writer refactor

**Verdict: NEUTRAL.** No scenario moves outside run-to-run noise on either the GPU
harness or the wall-clock rAF probe. The bar for this task was neutral; it is met.

## What was measured

| side | URL | commit | tree |
| --- | --- | --- | --- |
| **A** (before) | `http://localhost:5175` | `24182c2c3` (`docs(camera-pivot): cameraRuntime single-writer — spec ground section + plan`) | this worktree, detached at the plan's base commit, `node_modules` + `public/data` symlinked to the main checkout |
| **B** (after) | `http://localhost:5174` | `e0985c5d4` | the `camera-pivot` worktree, server already running |

`git diff 24182c2c3 e0985c5d4` touches 130 files (+6917/−3423) and **does not touch
`tools/perf/` or `src/state/perf/`** — the harness, the perf hook and the scenario poses are
byte-identical on both sides, so the comparison is apples-to-apples and the poses have not
drifted.

Harness flags: the default scenario set (10 scenarios), `--frames 30`, `--dpr 2`, tier
`medium` — identical to the Task 1 baseline. Runs 1–6 used `--json`; runs 7–8 used the
human-readable formatter (the "raw text of one A and one B").

Because a single run drifts ±3–6 ms on an unchanged tree (the Task 1 finding), this is a
**paired A/B**, alternated across two live servers, never a diff against the T1 file.

## Run schedule

```
warm-up  A (solar-system, 10 frames)     — sanity + thermal warm-up, not scored
warm-up  B (solar-system, 10 frames)     — sanity + thermal warm-up, not scored
run 1    A  --json
run 2    B  --json
run 3    A  --json
run 4    B  --json
run 5    A  --json
run 6    B  --json
run 7    A  (text)
run 8    B  (text)
rAF probe  3 pairs, A-then-B per pair
rAF probe  3 pairs, order REVERSED (B-then-A) — counter-balances the thermal drift
```

Four A/B pairs of the full scenario set, plus six counter-balanced rAF pairs.

## GPU harness — MERGED totals (`TOTAL (merged, production)`, median ms/frame)

Δ is B − A, so **negative = HEAD faster**. "runs" are the four values in schedule order.

| scenario | A median | B median | Δ (B−A) | A runs | B runs | A spread | B spread |
| --- | --- | --- | --- | --- | --- | --- | --- |
| earth-surface | 23.4 | 22.8 | **−0.6** | 23.1, 23.8, 19.5, 26.9 | 23.9, 21.7, 24.2, 19.9 | 7.4 | 4.3 |
| solar-system | 20.9 | 20.4 | **−0.5** | 24.0, 19.3, 20.5, 21.3 | 21.6, 20.4, 20.4, 20.2 | 4.7 | 1.4 |
| star-field | 22.4 | 21.7 | **−0.8** | 22.0, 22.9, 21.2, 23.4 | 18.6, 18.3, 26.0, 24.7 | 2.2 | 7.6 |
| milky-way | 21.9 | 22.1 | **+0.3** | 21.8, 21.5, 22.4, 21.9 | 21.2, 22.7, 21.5, 25.8 | 0.9 | 4.6 |
| milky-way-outside | 25.4 | 25.5 | **+0.0** | 25.3, 25.6, 25.1, 25.6 | 25.3, 25.0, 25.7, 25.8 | 0.5 | 0.8 |
| milky-way-close | 29.4 | 29.3 | **−0.0** | 29.3, 29.1, 29.5, 30.5 | 29.4, 28.2, 29.3, 29.7 | 1.4 | 1.5 |
| galactic-centre | 10.2 | 10.1 | **−0.1** | 9.8, 10.0, 11.0, 10.3 | 10.2, 9.9, 9.6, 10.2 | 1.3 | 0.6 |
| sgr-a-star-lens | 11.5 | 11.4 | **−0.0** | 36.7, 11.4, 11.4, 11.5 | 11.5, 11.4, 11.4, 11.9 | 25.3 | 0.5 |
| local-group | 22.4 | 24.2 | **+1.7** | 21.0, 24.4, 23.8, 19.9 | 23.5, 24.2, 24.9, 24.1 | 4.5 | 1.4 |
| full-survey | 23.4 | 23.3 | **−0.1** | 23.2, 23.4, 23.9, 23.3 | 19.0, 24.0, 22.6, 24.4 | 0.7 | 5.4 |

Sum of scenario medians: **A 210.8 ms, B 210.8 ms, Δ −0.0 ms** (mean Δ per scenario −0.0 ms).

Spread (max − min of the four runs on one side) ranges 0.5–25.3 ms, **median 1.5 ms** — i.e.
the noise floor here is around 1.5 ms per scenario, three times the skill's nominal ~0.5 ms at
30 frames, consistent with the T1 finding. Every Δ in the table is inside its own side's
spread:

- `local-group` +1.7 ms is the largest Δ, and A's own four runs span 19.9–24.4 ms (4.5 ms).
  The Δ is a third of the within-side spread. Not a result.
- `sgr-a-star-lens` A run 1 read 36.7 ms against 11.4/11.4/11.5 — a single cold-start outlier
  (first scored run of the session, lens shader compile). It is why medians, not means, are
  quoted; it does not move the median.
- `star-field` −0.8 ms sits against a 7.6 ms B-side spread. Also not a result.

### Apple Silicon slot-sum inflation — present, and present identically on both sides

The tell (adjacent MERGED slots with identical medians) fires on **every** scenario in both A
and B, always in the same cluster:

```
run 1 (A) earth-surface:  bloom = hdr→swap @ 2.00 | hdr→swap = swap·COSMO @ 2.03 | swap·COSMO = swap·NEAR0 @ 2.06
run 2 (B) earth-surface:  bloom = hdr→swap @ 2.13 | hdr→swap = swap·COSMO @ 2.16 | swap·COSMO = swap·NEAR0 @ 2.16
run 1 (A) milky-way-close: hdr→swap = swap·COSMO @ 3.67 | swap·COSMO = swap·NEAR0 @ 3.67
```

So the 21–30 ms MERGED totals above are **not real per-frame GPU time** — the small back-to-back
composite passes each report the shared TBDR retire interval. They are quoted only as an
ordinal, paired A-vs-B signal, which is valid because the inflation is the same shape on both
sides. They are not summed across slots and not converted to fps. The honest total is the rAF
probe below, which reads 9–16 ms for the same poses.

## Wall-clock rAF probe (the measurement that can actually see a CPU-side change)

The refactor is CPU-side; the GPU harness is structurally blind to it. So the skill's honest
probe was run: boot `?perf`, `setStrategy('merged')`, `setPose` to a harness pose, 30 warm-up
frames, then 240 rAF deltas. Driven from
[`perf-T19-rafProbe.mjs`](perf-T19-rafProbe.mjs) (a scratch Playwright script in this folder;
no repo file was added or modified). Four poses: `earth-surface`, `solar-system`,
`milky-way-outside`, `full-survey`.

**The first arm exposed a confound worth recording.** With every pair ordered A-then-B, both
sides drift monotonically upward across pairs as the machine heats (A `milky-way-outside`:
11.45 → 13.80 → 15.80 ms; B: 14.40 → 15.70 → 15.65 ms), which systematically penalises
whichever side is measured second. The naive forward-arm Δ was +1.85 ms on
`milky-way-outside` — pure order bias. So a second arm was run with the order reversed, and
the two arms averaged.

Δ is HEAD − base, so **negative = HEAD faster**:

| scenario | fwd arm Δ (p1,p2,p3) | rev arm Δ (p1,p2,p3) | counter-balanced Δ (all 6 pairs) | counter-balanced Δ (thermally saturated p2+p3) |
| --- | --- | --- | --- | --- |
| earth-surface | +1.40, +0.80, −0.50 | −0.80, +0.25, +0.50 | **+0.27** | **+0.26** |
| solar-system | +0.20, −0.30, +0.20 | +0.10, −0.20, +0.10 | **+0.02** | **−0.05** |
| milky-way-outside | +2.95, +1.90, −0.15 | −5.20, −0.75, −0.15 | **−0.23** | **+0.21** |
| full-survey | +1.20, +2.00, −0.60 | −0.90, +0.00, −0.25 | **+0.24** | **+0.29** |

Pooled absolute medians (n = 6 per side, both arms):

| scenario | base rAF median | HEAD rAF median |
| --- | --- | --- |
| earth-surface | 10.90 ms | 10.85 ms |
| solar-system | 9.55 ms | 9.65 ms |
| milky-way-outside | 15.78 ms | 15.60 ms |
| full-survey | 14.15 ms | 13.93 ms |

Every counter-balanced Δ is **≤ 0.3 ms on a 9.5–15.8 ms frame (≤ 2–3%)**, against individual
pair-to-pair swings of ±2 ms and a within-arm thermal ramp of up to 5 ms. Pooled medians put
HEAD within 0.2 ms of base on all four poses, three of four fractionally *faster*. There is no
per-frame cost signal from rebuilding the camera state as a value object.

Incidental: rAF medians of 9.5–15.8 ms against MERGED slot sums of 20.9–25.5 ms for the same
poses is a fresh, independent confirmation of the ~2× slot-sum inflation the skill warns about.

## Raw outputs (all in this folder)

| file | content |
| --- | --- |
| `perf-T19-run-1-A.txt` … `perf-T19-run-6-B.txt` | runs 1–6, `--json` (10 scenarios each) |
| `perf-T19-run-1-A.stderr` … `perf-T19-run-6-B.stderr` | the harness's stderr progress for those runs |
| `perf-T19-run-7-A.txt` | run 7, A, full human-readable report (the raw text A) |
| `perf-T19-run-8-B.txt` | run 8, B, full human-readable report (the raw text B) |
| `perf-T19-rafprobe.txt` | rAF probe, forward arm (A-then-B), 3 pairs |
| `perf-T19-rafprobe-reversed.txt` | rAF probe, reversed arm (B-then-A), 3 pairs |
| `perf-T19-rafProbe.mjs` | the probe script, kept for provenance |

## Verdict

| scenario | GPU MERGED Δ | rAF Δ | verdict |
| --- | --- | --- | --- |
| earth-surface | −0.6 | +0.26 | NEUTRAL |
| solar-system | −0.5 | −0.05 | NEUTRAL |
| star-field | −0.8 | — | NEUTRAL |
| milky-way | +0.3 | — | NEUTRAL |
| milky-way-outside | +0.0 | +0.21 | NEUTRAL |
| milky-way-close | −0.0 | — | NEUTRAL |
| galactic-centre | −0.1 | — | NEUTRAL |
| sgr-a-star-lens | −0.0 | — | NEUTRAL |
| local-group | +1.7 | — | NEUTRAL (Δ is a third of A's own 4.5 ms spread) |
| full-survey | −0.1 | +0.29 | NEUTRAL |

**Overall: NEUTRAL.** Sum of GPU medians identical to 0.1 ms (210.8 vs 210.8); every
counter-balanced wall-clock Δ ≤ 0.3 ms on a 10–16 ms frame. The single-writer camera runtime
costs nothing measurable per frame, in either the GPU pass shape or real wall-clock.

Golden traces — the other half of the bar — were **not** re-run here; they were verified
byte-identical on HEAD by the task reviews.

## Concerns

- The GPU harness cannot see a CPU-side change by construction, so its NEUTRAL is weak
  evidence on its own. The rAF probe is the load-bearing half of this verdict.
- Noise on this machine is ~1.5 ms per scenario median at 30 frames (median within-side
  spread), not the ~0.5 ms the skill nominally quotes. A future claim finer than ~1.5 ms on
  MERGED needs more frames or more pairs, not a single run.
- The thermal ramp inside the rAF probe is large (up to 5 ms across three pairs on
  `milky-way-outside`). Any single-arm A/B probe on this box will manufacture a ~1–2 ms
  regression for whichever side runs second. Counter-balance the order.
- Servers were `npm run dev` (unminified, Vite-transformed dev modules) on both sides — a
  production build could weight CPU-side work differently, though the change is structural,
  not a hot-loop micro-optimisation.
