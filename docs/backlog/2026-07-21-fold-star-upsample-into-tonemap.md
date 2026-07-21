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

## Relation to the sibling lever

Independent of the existing "Lower-res offscreen star-aggregate pass" item
(`STAR_AGGREGATE_DIVISOR` 2 → 4): that one cuts the *aggregate draw* fill at
source resolution; this one cuts the *composite*, whose cost is
destination-resolution-bound (one sample per hdr pixel regardless of source
size). The two compose.
