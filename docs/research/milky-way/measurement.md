# Measurement

## Cost regimes differ by pose

**MEASURED.**

| pose                                                       | behaviour                                                                                                                                     | dominant lever                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **`milky-way-outside`** (22 kpc)                           | nearly every sprite pinned at the `starPxMin` floor; fill ≈ `count × π × pxMin²`, flat across the field                                       | `pxMin` (1→2 is 4x, 1→4 is 16x). `starSizeScale` does nothing below ~10x. `lodApparent` pays. |
| **`milky-way-close`** (17.8 kpc, disc overflows the frame) | near sprites blow past the `starPxMax` cap; a capped sprite is 48 target px ≈ 7,240 texels, so ~43 of them is one screen of additive overdraw | `pxMax`. `starSizeScale` genuinely quadratic. `lodApparent` nearly useless.                   |

`aggregateDivisor` trades against `pxMin` **exactly**: a sprite of half-extent P at divisor D
covers `P·D` screen px and costs `πP²` texels, so doubling D and halving P gives an identical
on-screen blob at a quarter the cost. The divisor is therefore strictly better than `pxMin` for
reaching a given blob size — **but only once nothing sharp is left in that buffer**, i.e. after
the partition of [the design error](goal-and-history.md#the-design-error-the-split-copied-the-target-without-the-partition).

## Measurement A — the instrument is the finding

**MEASURED, 2026-07-31.** Paired alternating A/B on `milky-way-outside`, `starPxMin` 1 vs 4 (a
16x fill change). Within-pair deltas: **−0.8 ms and +3.2 ms**. No consistent sign. The spread is
larger than the Milky Way's entire ~5 ms of a ~30 ms frame.

**MEASURED.** An earlier sequential sweep that looked like a clean monotonic win was **drift** —
reverting to baseline read **26.7 ms**, below every point in the sweep.

**MEASURED.** Per-pass slots cannot rescue it. Baseline read `milky-way-aggregate` 2.9, `bloom`
2.4, `hdr→swap` 2.4, `labels` 2.4, `star-catalog` 2.1, against a ~1.2 ms floor. Slots clustered
that tightly are reporting the **shared retire interval** — the Apple Silicon TBDR tell recorded
in the perf-harness notes — so "2.9 stayed 2.9" does **not** prove the pass is insensitive to
fill.

**CONCLUSION: do not re-run Milky Way perf work in the app harness.** It asks a ~5 ms subject to
show up in a ~30 ms frame with ±3 ms of between-run noise, and more `--frames` does not help
(that figure is within-run variance). The galaxy tool (`tools/galaxy-renderer`, :5400) draws the
cloud and nothing else, runs the app's own shaders and post chain since #521, and has
`?gpuTimings`. **That is where these measurements belong.** Caveat carried forward: the slot-sum
inflation gets _worse_ in the tool, not better, because there are fewer passes — add a wall-clock
rAF ms/frame readout and treat per-pass slots as ordinal only.

**MEASURED, harness blind spot.** `mw-aggregate·NEAR0` never appeared in the harness's merged
slot list, so a merged total can silently **exclude** a reduced-resolution offscreen pass —
flattering any change that moves work into one. Check the merged slot list covers your new pass
before quoting a merged delta.

Measurement B (the 192-step raymarch cost probe, primitives survey Section 12) is **dropped**: it only
decided whether mixed dust geometry is affordable, and [closed form](analytic-field.md#closed-form-and-its-limit) settles that independently.
