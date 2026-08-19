# Task 7 report — Stage 3: spend the savings (volume scale 3 → 2)

## Status: REVERT (deliberate no-op)

Flipped the `volume` render-target row's `scale` from `3` to `2` in
`src/services/gpu/renderTargets.ts`, measured paired (alternating scale
in place, same session, dev server `http://localhost:5175`), and applied
the brief's decision rule. `volume-inside` regresses TOTAL merged by
**~1.3 ms**, over the 1 ms budget — so the file is reverted back to
`scale: 3`, matching the current HEAD exactly (`git diff` on the file is
empty). This report is the record of the measurement.

## Measurement discipline

Single `npm run perf` runs on this machine swing wildly — a first pass at
`volume-inside` alone read 63–65 ms TOTAL merged on two back-to-back
invocations, settling to a stable ~10 ms after the GPU/session state
warmed up (see "Noise note" below). Rather than trust any single run, I
measured **paired**: for each scenario, alternate `scale: 3` / `scale: 2`
in place (edit the constant via a scratch script, `sleep 1.5` for the dev
server to pick it up, run `npm run perf -- --url http://localhost:5175
--scenario <name> --frames 30 --json`, flip back), repeated across
multiple rounds, same session, back-to-back. Catalog tier: **medium**
(this branch's boot default), mcpm field on, polyphorm-2mrs field off —
the shipped-config defaults the brief asks the regression budget to be
judged against.

Quoted numbers are `totals.merged.median` (TOTAL MERGED) and the
`volume·COSMO` (or `hdr·COSMO`, when volume folds into it / is culled)
merged-group median, per the perf skill's interpretation rules.

## Per-pose paired table

### `volume-inside` — the decisive pose

First two rounds were a session warm-up transient (both scales spiked
together, non-monotonically — a system-noise artifact, not a code
effect; see Noise note). Rounds 3–8 are the stable, reproducible regime:

| round | scale 3 TOTAL | scale 2 TOTAL | scale 3 volume·COSMO | scale 2 volume·COSMO |
|---|---|---|---|---|
| 3 | 8.913 ms | 11.534 ms | 1.442 ms | 2.949 ms |
| 4 | 10.617 ms | 11.305 ms | 1.933 ms | 2.949 ms |
| 5 | 10.191 ms | 11.469 ms | 1.835 ms | 2.949 ms |
| 6 | 10.355 ms | 11.305 ms | 1.901 ms | 2.949 ms |
| 7 | 9.699 ms | 11.272 ms | 1.835 ms | 2.949 ms |
| 8 | 9.830 ms | 11.403 ms | 1.769 ms | 2.949 ms |
| **median** | **10.011 ms** | **11.354 ms** | **1.835 ms** | **2.949 ms** |

`scale: 2` is consistently slower every single round (6/6), and the
`volume·COSMO` group is a rock-stable 2.949 ms at scale 2 across all 6
rounds vs a noisier-but-clearly-lower 1.44–1.93 ms at scale 3 — this is a
real, reproducible signal, not noise. Including the two warm-up-contaminated
rounds (1–2, both scales spiked to 63–72 ms together) doesn't change the
verdict either: median TOTAL delta across all 8 rounds is +1.16 ms, still
over budget.

**TOTAL merged delta (stable rounds, median): +1.343 ms — over the 1 ms budget.**

### `local-group`

| round | scale 3 TOTAL | scale 2 TOTAL |
|---|---|---|
| 1 | 22.217 ms | 22.610 ms |
| 2 | 22.512 ms | 22.315 ms |
| 3 | 23.560 ms | 22.381 ms |
| **median** | **22.512 ms** | **22.381 ms** |

No `volume·COSMO` slot appears in the merged output at this pose (the
volume raymarch is culled entirely — confirmed by inspecting the full
merged-slot list). **TOTAL delta: −0.131 ms — no regression.**

### `full-survey`

| round | scale 3 TOTAL | scale 2 TOTAL |
|---|---|---|
| 1 | 23.822 ms | 24.019 ms |
| 2 | 23.298 ms | 21.823 ms |
| 3 | 19.300 ms | 21.004 ms |
| **median** | **23.298 ms** | **21.823 ms** |

Volume also culled at this pose. **TOTAL delta: −1.475 ms — no regression**
(within this pose's own run-to-run noise, ~4 ms across 3 rounds; the
volume scale change cannot plausibly explain a *negative* delta here since
the volume pass doesn't render at all).

### `void-inside` (extra context — not part of the binding decision rule)

| round | scale 3 TOTAL | scale 2 TOTAL | scale 3 volume·COSMO | scale 2 volume·COSMO |
|---|---|---|---|---|
| 1 | 8.552 ms | 9.175 ms | 0.983 ms | 1.442 ms |
| 2 | 10.060 ms | 10.453 ms | 1.147 ms | 1.737 ms |
| 3 | 11.010 ms | 9.798 ms | 1.147 ms | 1.507 ms |
| **median** | **10.060 ms** | **9.798 ms** | **1.147 ms** | **1.507 ms** |

Skip-favorable MCPM pose per its name — the volume group cost is present
but small and TOTAL delta is negative (−0.262 ms), well within noise.

### `volume-inside` at `--tier large` (extra context, n=1/side)

| scale | TOTAL | volume·COSMO |
|---|---|---|
| 3 | 21.234 ms | 1.442 ms |
| 2 | 29.655 ms | 5.669 ms |

Single round each, not paired-repeated (large-tier boot is slow, ~2 min),
so treat as directional context rather than a clean measurement — but the
direction (scale 2 markedly worse) reinforces the medium-tier verdict
rather than complicating it: at large tier the regression is far larger
(+8.4 ms TOTAL, +4.2 ms volume·COSMO), consistent with `matrix-report.md`'s
finding that the scale lever multiplies absolute cost by the fragment-count
model without changing per-pose direction.

## Decision-rule arithmetic

Brief's rule: **keep `scale: 2` iff the TOTAL MERGED regression is under
1 ms at every one of the three poses** (volume-inside, local-group,
full-survey), summed against the post-Task-6 (scale 3) numbers.

| pose | TOTAL delta (scale 2 − scale 3, median) | under 1 ms? |
|---|---|---|
| volume-inside | **+1.343 ms** | **NO** |
| local-group | −0.131 ms | yes |
| full-survey | −1.475 ms | yes |

One pose (`volume-inside`) regresses ≥ 1 ms, consistently across 6
paired rounds. Per the rule: **revert to `scale: 3`.**

## Decision: REVERT

`src/services/gpu/renderTargets.ts`'s `volume` row stays at `scale: 3`
(unchanged from post-Task-6 HEAD). No code diff results from this task —
the file was flipped to `scale: 2`, measured, and flipped back to its
original value, which is identical to what `git diff` already shows
(empty). This report is committed as the record of the measurement and
decision per the brief's checklist.

## Noise note

This machine's GPU measurements show large session-scale drift
independent of the code under test: the first two rounds of every fresh
measurement chain this session spiked 6–7× above the eventual stable
value, on **both** scale configurations simultaneously (round 1:
scale 3 = 63.2 ms, scale 2 = 72.5 ms; round 2: scale 3 = 65.0 ms,
scale 2 = 17.2 ms — note the non-monotonic inversion, ruling out a
simple "warming up" story and pointing instead to external GPU
contention, e.g. other dev-server/editor GPU processes on this shared
machine per prior tasks' reports). Once past that transient, both
configs settled into tight, reproducible bands (scale 3: 8.9–10.6 ms;
scale 2: 11.3–11.5 ms) that stayed stable across 6 further rounds and
survived a scenario switch (local-group/full-survey measured immediately
after, without a repeat of the transient). The decision above rests on
the stable regime; including the transient rounds does not flip the
verdict (see the "all 8 rounds" note above).

## Verification

- `npm run typecheck` — green (`tsconfig.json` + `tsconfig.tools.json`).
- `npx vitest run tests/services/gpu/renderTargets.test.ts` — 14/14 passed.
- `npm test` — **1046 test files / 7025 tests passed**, no failures.
- `git status` — working tree clean (no diff from HEAD; the revert is a
  true no-op on `renderTargets.ts`).

## Concerns

- The measurement session confirms (again, per Task 6's report) that this
  machine cannot be trusted for single-shot `npm run perf` readings — any
  future perf claim on this branch/machine needs the same paired,
  multi-round protocol, not a single invocation.
- `full-survey`'s and `local-group`'s per-round noise (~4 ms swing across
  3 rounds) is large relative to the 1 ms decision threshold; the negative
  medians there are comfortably clear of the budget so it doesn't change
  the outcome, but a future task revisiting the volume scale on a pose
  where volume *does* render and the margin is closer to 1 ms should use
  more than 3 rounds, as `volume-inside` did here.
- Task 7 was the last renderer-touching task in this plan and ends in a
  no-op; whoever runs `/feature-done` on this plan should note the volume
  row is staying at `scale: 3` — Stage 3's "spend the savings" payoff did
  not clear its own bar at this camera pose, and the plan's Task 5/6
  reports (large-tier addenda, `matrix-report.md`) already document why:
  `volume-inside` is the pose where the acceleration structures themselves
  are net-negative (no empty space to skip), so raising resolution on top
  of that per-step overhead compounds rather than "spending savings" that
  don't exist at this specific pose.
