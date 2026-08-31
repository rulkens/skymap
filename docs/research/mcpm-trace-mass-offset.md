# MCPM workbench trace-mass offset vs the reference VAC

The MCPM workbench (`tools/mcpm-workbench/`, the Polyphorm→WebGPU port) produces
trace volumes whose **total mass is a uniform ~9.28× below** the reference
SDSS DR17 Cosmic Slime VAC (`data/raw/mcpm/trace.bin`):

| quantity                                            | value            |
| --------------------------------------------------- | ---------------- |
| reference VAC total (f32)                           | 9,924,877,491.65 |
| workbench total, f16 accumulation (shipped default) | 1,069,616,093.47 |
| workbench total, f32 accumulation (forced A/B)      | 1,069,261,340.81 |
| ratio, reference ÷ workbench (f16)                  | **9.2789×**      |
| ratio, reference ÷ workbench (f32)                  | 9.2820×          |

Both totals sum the same statistic — every voxel of the `trace` grid, plain
unweighted order-independent sum, identical 712×1200×728 dims on both sides,
same voxel order (independently checked against the fork's own export code).
A closed three-stage investigation (2026-08-18 → 2026-08-21) ruled this an
**accepted, documented offset**, not a workbench bug.

## Elimination trail

**Ported quirk flags** — the one flag with a measured mass-ratio effect
(`QUIRK_DITHERED_TRACE_DECAY`, `decay.wesl:85-89`) moves the ratio the
_wrong_ way when disabled: 9.28× → 10.11×. No quirk flag closes the gap; the
one that's measurable widens it.

**Structural causes** — a static audit found `trace` is written from exactly
one call site, `propagate.wesl:239`:
`addTrace(wc, (1.0 / sim.normalizationFactor) * distanceScalingFactor)`. This
amount is a pure function of the agent's own RNG draw
(`distanceScalingFactor`, `propagate.wesl:109`) and `sim.normalizationFactor`
(pinned to 1.0 by the default preset) — independent of agent weight,
`sim.depositValue`, and catalog data. Catalog data points return before
reaching `addTrace` at all (`propagate.wesl:81-89`), so the deposit-scaling
constant (`10.0 * weight`, `propagate.wesl:86`), the fork step-count, and
data-point weight/count each fail to reach the buffer the 9.28× statistic
sums — each hypothesis resolves to "no factor found" by direct code-path
tracing, not absence of evidence.

**f16 trace accumulation** — the workbench runs its 800-step accumulation in
f16 while the reference VAC is f32; this is a real asymmetry, but an A/B
(same protocol, `element` forced to `'f32'` in `createMcpmHarness.ts:115`,
streaming-sum readback to avoid a >2 GiB CPU allocation ceiling) measured
its actual effect: **9.2820× vs 9.2789× — a 0.03% shift**, the same
direction but two orders of magnitude too small to explain any meaningful
fraction of the gap. This closes the one open item from the static audit's
denormal/underflow-flooring hypothesis, which could only be bounded
analytically until the volume-integral total was actually measured.

## Uniform-scale evidence

`meanLogTraceAtPoints` (mean of `log1p(trace)` sampled at the 324,901
catalog-point locations) agrees across f16 and f32 representations to
within ~0.0016 — noise-floor magnitude, the same as step-to-step
convergence noise within a single run. If the 9.28× lived in a
representation artifact, this dense-region, log-space statistic would show
it; it doesn't. Combined with the mass ratio holding at the same value
across resolutions (9.28× full-res vs 9.3× downsampled) and the structural
independence from every ported parameter, every measured signal is
consistent with a single **uniform multiplicative scale difference**
between the two simulations, not a shape or distribution difference.

## Surviving explanation

With quirks, structure, and f16 all eliminated, the remaining candidate is
**reference-side provenance**: the published VAC's own
`normalizationFactor`, agent count, or export/step-count convention in the
original Polyphorm fork run — none of which the SDSS DR17 Cosmic Slime VAC's
`export_metadata.txt` records, and none of which is reproducible from this
codebase without the fork's own run parameters. This is not directly
verified (it would need the fork's methods paper or source run
configuration); it is the only hypothesis space left standing after
everything reachable from the workbench's own code and data was ruled out.

## Practical consequence

Any quantitative comparison of workbench trace-mass output against the
reference VAC — total mass, or any statistic derived from total mass —
**must normalize by ~9.28×** to be meaningful. The offset is a uniform
scale factor: it does not affect field **shape**. Statistics computed in
log space or at fixed point locations (`meanLogTraceAtPoints`, TV distance
on histograms, axis marginals) are unaffected and need no correction — the
`compareTraceCubes.ts` validator (which reports exactly those statistics,
not total mass) is unaffected by this offset.
