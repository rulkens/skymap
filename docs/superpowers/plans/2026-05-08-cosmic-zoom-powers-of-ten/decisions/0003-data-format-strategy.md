# 0003 — One bespoke binary format per dataset, common 16-byte header

**Status:** Accepted (proposed by the cosmic-zoom plan author; awaiting team review)
**Date:** 2026-05-08
**Deciders:** the cosmic-zoom plan author (proposed); awaiting review

## Context

The cosmic-zoom plan introduces nine new datasets (see
[`../data/00-data-sources.md`](../data/00-data-sources.md)): a Solar System
ephemeris (~12 records), a Gaia DR3 stellar cut (~10⁷ records), a Milky Way
model (composite imagery + parametric), a Local Volume galaxy catalog (~10³
records), Tully galaxy-group memberships (~45 × 10³ rows), an Abell/ACO/MCXC
cluster merge (~5 × 10³ records), a Cosmicflows-4 density volume (a 256³
voxel grid, no records at all), a Cosmicflows-4 flow vector grid, a ROSAT
X-ray cluster sidecar, and a Planck CMB equirectangular image.

These datasets have almost nothing in common. The Solar System ephemeris is
12 fixed records of orbital elements; the Gaia cut is 10 million tightly-
packed point records; the CF-4 density volume is a flat 3D float texture;
the CMB map is a standard PNG. Each one is consumed by a *different*
renderer — orbit lines, instanced point sprites, `texture_3d<f32>`, an
equirectangular sphere shader. The on-disk representation needs to be shaped
for the GPU upload pattern of the consumer.

Skymap already has one production binary format: `pointCloudFormat.ts` (v4,
48 bytes/point, ~280 lines, zero deps, encodes/decodes in microseconds, GPU-
direct uploadable). It has been iterated since the first SDSS load and is the
benchmark any new format-strategy must beat.

The decision: should the nine new datasets share a single envelope schema
(Protobuf, FlatBuffers, Parquet, a hand-rolled TLV), or should each one ship
its own bespoke binary format following the `pointCloudFormat` recipe?

## Decision

We adopt **one bespoke binary format per dataset, all sharing a common
16-byte header.**

Concretely:

1. Every new format lives in its own module: `src/data/solarSystemFormat.ts`,
   `src/data/starsFormat.ts`, `src/data/localGroupFormat.ts`, etc. Each
   module exports `encode<Name>`, `decode<Name>`, and `empty<Name>`, mirroring
   the `pointCloudFormat.ts` API.
2. Every format begins with the same 16-byte header: `magic` (uint32, ASCII
   per format), `version` (uint32, monotonically increasing), `count` (uint32,
   meaning per format), `reserved` (uint32, zero). The header convention is
   the *only* shared schema.
3. Per-record (or per-voxel) payload is byte-laid-out to match the consumer's
   GPU upload pattern: interleaved per-vertex for instanced renderers, raw 3D
   array for `texture_3d<f32>`, equirectangular RGB8 for the CMB sphere.
4. Versioning is **per format**. A schema change in one binary bumps that
   binary's version and forces regeneration of *that one file*; nothing else
   is invalidated.
5. The CMB map ships as a standard PNG/JPEG, not a custom binary, because
   `createImageBitmap` + `copyExternalImageToTexture` already handle that
   path with zero parsing on our side.

The full byte layouts are catalogued in
[`../data/10-binary-formats.md`](../data/10-binary-formats.md).

## Alternatives considered

**(a) Generic Protobuf / FlatBuffers / Parquet schema.** A typed, self-
describing envelope that any new dataset could be serialised into. Industry-
standard, well-tooled, would make every new dataset "just" a `.proto`
definition. Rejected for three reasons. First, the schemas are radically
different — 12 fixed records of orbital elements vs. 10⁷ tightly-packed star
records vs. a 256³ voxel grid — and a generic envelope flexible enough to
hold all three either carries metadata overhead per record (expensive at
10⁷ records) or under-specifies the layout (forcing runtime dispatch on
every read). Second, the consumers are bespoke: each renderer wants the
bytes shaped for *its* GPU upload pattern, and a generic schema can't deliver
that without an intermediate shaping step we don't otherwise need. Third, the
existing `pointCloudFormat.ts` recipe already wins on every dimension we care
about (decode speed, GPU-direct upload, NaN handling, file size), and asking
each new format to *outperform* a generic schema on its native ground is a
high bar that none of them clear.

**(b) One giant unified file.** Bundle every shell's data into a single
`shells.bin` with a table-of-contents header. Conceptually clean (one fetch,
one loader path) but operationally hostile: every dataset refresh requires
rewriting and re-uploading the whole bundle, even if only the Solar System
ephemeris changed. Lazy loading per shell becomes impossible — the user who
zooms only to shell 8 still pays for the bytes of shells 1, 2, 9. R2 has no
problem with hundreds of small `.bin` files; bundling them buys nothing and
costs incremental update granularity. Rejected on operational cost.

**(c) Per-dataset bespoke (chosen).** Each dataset gets its own format
module, its own `tools/buildXyz.ts`, its own decoder, its own version. Pure
functions on both ends; no class hierarchy, no envelope, no abstract base
class. Each format file is ~30 lines of header-write and a fixed-stride
record loop. This is the path
[`../data/10-binary-formats.md`](../data/10-binary-formats.md) catalogues in
detail.

## Consequences

**Positive.**

- **Decode speed.** No schema interpretation at runtime. The decoder for each
  format is a fixed-offset typed-array view; decoding is microseconds and
  zero allocation beyond the output struct itself.
- **GPU-direct uploads.** Per-record byte layouts are chosen to match each
  consumer's vertex format or texture memory layout. A `Float32Array` view
  over the payload can be uploaded with `queue.writeBuffer` or
  `queue.writeTexture` *without an intermediate transpose or copy*. This is
  a real win for the Gaia cut (~30 MB) and the CF-4 density volume (~64 MB).
- **Local versioning.** A schema change to `cf4DensityFormat` does not
  invalidate `solarSystemFormat`; we don't have to regenerate the entire
  ~370 MB of new shell data every time we tweak one field. Build script
  failures are also local: `tools/buildClusters.ts` failing doesn't block
  `tools/buildStars.ts` from regenerating.
- **Per-format clarity.** Each format file is short, flat, and matches the
  same recipe as `pointCloudFormat.ts`. A new contributor reading
  `localGroupFormat.ts` does not need to learn an envelope abstraction
  first; they read the byte table at the top, then the encode/decode loops.
- **Loud failure modes.** Per-format magic numbers (`SKSS`, `SKST`, `SKLG`,
  ...) make file-mix-up bugs fail at decode time with a clear error, not at
  render time with a corrupted scene.

**Negative.**

- **More decoders to write and maintain.** Nine format modules instead of
  one envelope-shaped module. Each carries duplicated header-handling code
  (~30 lines per format). The duplication is intentional — flat, easy to
  read, no abstraction to learn — but it is duplication, and a refactor
  that touches the header convention has to touch nine files instead of one.
- **Test scaffolding repeats.** Every format gets at least three Vitest
  tests: round-trip, magic+version rejection, NaN preservation. Volumetric
  formats add a voxel-addressing test; sidecar formats add a sort-invariant
  test. That's a non-trivial test-file count, all following the same
  template, and template drift is a real risk over time.
- **No off-the-shelf tooling.** Protobuf has `protoc`, FlatBuffers has
  `flatc`, both ship language bindings for free. We get nothing of the sort
  — every consumer (today only the skymap runtime; theoretically a future
  Python notebook) writes its own decoder. We accept this because skymap is
  the only consumer and we are not shipping a public file format.
- **Versioning discipline is on the developer.** With a generic schema,
  field additions are typically backward-compatible by construction. With
  bespoke formats, *any* layout change must bump the version (the policy in
  [`../data/10-binary-formats.md`](../data/10-binary-formats.md) §4 is
  explicit about this). Forgetting a version bump produces silently
  mis-decoded data — the kind of bug that surfaces visually in production
  and is painful to diagnose.

## References

- [`../data/00-data-sources.md`](../data/00-data-sources.md) — master catalog of the nine new datasets and their per-shell roles.
- [`../data/10-binary-formats.md`](../data/10-binary-formats.md) — full byte layouts, magic numbers, versioning policy, decoder location, test strategy, R2-vs-commit cutoff.
- `src/data/pointCloudFormat.ts` (existing) — the prototype recipe every new format follows. ~280 lines, v4, zero dependencies; the benchmark for "good enough that we don't need an envelope".
- [`./0002-shell-discrete-vs-continuous.md`](0002-shell-discrete-vs-continuous.md) — coupled decision: per-dataset bespoke formats follow naturally from per-shell discrete renderers, each consuming a single tailored payload.
- [`CLAUDE.md`](../../../../CLAUDE.md) — Deploy workflow section, R2-vs-Workers-Assets storage policy that the per-format size cutoff (1 MB) inherits.
