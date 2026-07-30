# Fold star-upsample into the hdr→swap composite

**Surfaced:** 2026-07-21, during the star-catalog frustum-cull PR (#470) perf
verification. **Readiness:** needs-design (one ordering question below).

## The cost

`star-upsample` is a standalone fullscreen pass inside hdr·NEAR0: one bilinear
sample of the half-res star-aggregate offscreen target + the aggregate
intensity knee + an additive blend into the RGBA16F hdr target, paid per hdr
pixel. Floor-subtracted real cost ≈ **1.0 ms** at the star-field pose on the
post-cull branch (per-layer rows read ~4 ms, but that includes the ~1.5–2.4 ms
instrumented pass-overhead floor — quote the EST. PER-PASS FLOOR attribution,
not the raw per-layer row).

## The lever

Sample the aggregate target and apply the knee inside the `hdr→swap` tonemap
shader instead of running a separate additive round-trip over the hdr target.
That deletes the pass entirely: saves most of the ~1.0 ms of RGBA16F
read-modify-write bandwidth plus the pass's share of encoder overhead.

## The design question (why needs-design)

Whether anything between star-upsample and tonemap must see the composited
aggregate field **in the hdr target** — bloom is the candidate. If bloom (or
any other hdr consumer) reads hdr after star-upsample writes it, folding the
composite into tonemap changes what bloom sees: the aggregate glow would no
longer feed bloom. Resolve by tracing the hdr·NEAR0 layer order and the
hdr→swap input bindings; if bloom does consume it, the fold either moves the
sample into bloom's input path too, or is not a free move and should be
re-costed.

## Relation to the sibling levers

Independent of the existing "Lower-res offscreen star-aggregate pass" item
(`STAR_AGGREGATE_DIVISOR` 2 → 4): that one cuts the *aggregate draw* fill at
source resolution; this one cuts the *composite*, whose cost is
destination-resolution-bound (one sample per hdr pixel regardless of source
size). The two compose.

The `2026-07-21-bloom-mip-count-perf.md` item targets the SAME tonemap pass: the
bloom fold (`bloom0 → hdr`) is also a full-viewport composite that fuses into
`hdr→swap`. The two folds are not symmetric — the bloom fold is the LAST hdr write
so it moves cleanly, but this star-upsample fold is gated on bloom's bright
prefilter still seeing the star glow (bloom reads `hdr` before tonemap). Note the
bloom fold was spiked 2026-07-22 and came back **marginal** (~0.7 ms, no 60 fps),
the bloom fold alone was measured a **wash** on a clean interleaved A/B (its
read-modify-write relocates 1:1 into tonemap rather than disappearing). So the
shared-tonemap fusion only conceivably pays if BOTH folds ride one pass and two
fullscreen passes collapse to zero; measure this star-upsample fold's own delta
(interleaved, quiet machine) before committing to the shared-pass rework.
