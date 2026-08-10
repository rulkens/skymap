# ADR 0004 — Famous-galaxy Calibration Lives on `famous_meta.json`, Not `famous.bin`

- **Status:** Accepted
- **Date:** 2026-06-01
- **Decision-makers:** Alexander Rulkens (with Claude)
- **Supersedes:** —
- **Superseded by:** —
- **Related:** [spec 2026-05-31-famous-galaxy-thumbnail-calibration-design](../superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md); [plan index](../superpowers/plans/2026-05-31-famous-galaxy-thumbnail-calibration-INDEX.md)

## Context

A hand-curated famous-galaxy WebP frames its galaxy arbitrarily: the disk
may fill only part of the frame, the nucleus may sit off-centre, and the
image may have been deprojected to face-on. To place the thumbnail
correctly the runtime needs per-galaxy _placement calibration_ — the
nucleus position (normalised), the disk radius as a fraction of the
image, the position angle, an optional axis-ratio override, and a
`deprojected` flag. (See `FamousCalibration` in
`src/@types/loading/FamousCalibration.d.ts`.)

This data has three awkward properties for the existing catalog pipeline:

- **It is famous-only.** SDSS / 2MRS / GLADE rows never carry it. Of the
  catalog sources, only the ~couple-hundred curated famous galaxies have
  a calibration, and most of _those_ don't (the field is optional — an
  absent calibration falls back to catalog geometry).
- **It is optional and sparsely present.** Forcing every row to carry the
  fields wastes space and invents "no calibration" sentinel values.
- **It is variable-shape.** `axisRatio` is optional; `deprojected` is a
  boolean; the natural representation is a small struct, not a fixed run
  of floats.

The galaxies are already described by two artefacts that ship together:

- `famous.bin` — the fixed-stride `GalaxyCatalog` binary (position,
  magnitudes, `diameterKpc`, orientation, …) consumed by the
  point/billboard renderer. Same v9 64-byte stride as every other tier,
  with [only a few spare bytes per row](../../src/data/galaxyCatalog/galaxyCatalogFormat.ts).
- `famous_meta.json` — the string + per-galaxy-metadata sidecar
  (`FamousMetaEntry[]`: id, names, description, type), produced by
  `buildFamous.ts` and already routed to the runtime
  (`state.sources.famousMeta`, read by `texturedDiskSubsystem`).

So the question: where does `FamousCalibration` live?

## Decision

**Famous-galaxy placement calibration is an optional `calibration` field
on the existing `famous_meta.json` entry (`FamousMetaEntry`), not a field
in `famous.bin` and not a new sidecar file.**

Concretely:

- `FamousMetaEntry` gains `calibration?: FamousCalibration`. The build
  pipeline (`buildFamous.ts` via `deriveFamousCalibration`) computes it
  from the curator's source-pixel disk annotation and writes it onto the
  meta entry. Absent on a row → the runtime uses catalog geometry,
  unchanged.
- The runtime already loads `famous_meta.json` into
  `state.sources.famousMeta` and threads it into `texturedDiskSubsystem`'s
  per-frame input. Reading `famousMeta[i].calibration` in the disk
  planner therefore added **zero** new load or routing plumbing.

**What this ADR is NOT deciding:** the `FamousCalibration` field set
(spec §components), the source-pixel → normalised derivation
(`deriveFamousCalibration`), or how the runtime applies the calibration
(the nucleus offset rides the shader's disk-plane basis — see the runtime
plan). Those are feature decisions in the spec + plans. This ADR records
only _where the data lives_.

## Alternatives considered

- **(a) A new `famous_calibration.json` sidecar.** Rejected: it
  duplicates the fetch + parse + merge path that `famous_meta.json`
  already has, for data that is 1:1 with a meta entry the runtime is
  _already_ holding. A second famous-only JSON keyed by the same id is
  pure overhead — two files to keep in lockstep where one suffices.
- **(b) A `famous.bin` v7 format bump.** Rejected on three counts:
  - The fields don't fit. The v6 stride has only a few spare bytes per
    row; `center` (2 floats) + `diskRadiusFrac` + `paDeg` + `axisRatio` +
    a `deprojected` flag overflow them, forcing a wider stride.
  - A stride change is a **regenerate-all**: the on-disk format header is
    shared across every tier, so bumping it invalidates `2mrs.bin`,
    `glade-*.bin`, `sdss-*.bin` too, even though none of them carry
    calibration. That couples famous-only data to an all-tiers rebuild +
    R2 re-sync.
  - It is a semantic mismatch: `famous.bin` is a galaxy _vertex-buffer_
    consumed by the GPU point renderer; calibration is a curator render
    _hint_ consumed CPU-side by the thumbnail planner. Optional,
    variable-shape metadata belongs with the strings, not in the
    fixed-stride vertex format.

## Consequences

### Positive

- **Zero new load plumbing.** `famous_meta.json` is already fetched,
  parsed, and routed to `texturedDiskSubsystem`; calibration rode that
  path for free.
- **Fully backward-compatible.** `calibration?` is optional — every
  existing famous galaxy without it renders exactly as before, and old
  `famous_meta.json` files parse unchanged.
- **No all-tiers rebuild.** Re-deriving calibration regenerates only
  `famous.bin` / `famous_meta.json`; the other tiers' `.bin` files are
  untouched.
- **A clear home.** `famous_meta.json` is now the established place for
  famous-only render hints; the next such hint (e.g. a per-galaxy
  brightness or crop note) follows the same precedent instead of
  inventing a third artefact.

### Negative

- `FamousMetaEntry` now mixes pure presentation metadata (names,
  description) with a render-placement hint (`calibration`). The sidecar's
  scope widened slightly from "strings" to "famous-only per-galaxy data".
- Calibration is JSON, not the binary pipeline — so it is not subject to
  the loud-fail-on-version-bump discipline the `.bin` formats enforce. A
  malformed `calibration` is caught by `deriveFamousCalibration` /
  `parseRecipe` validation at build time rather than a format header.

### Neutral / forward-looking

- Mirrors the binary+sidecar split already used for clusters
  (`clusters.ccat` + `clusters_meta.json`, [ADR 0003](0003-cluster-catalog-loading.md)):
  numeric vertex data in the binary, variable-shape strings/metadata in
  the JSON sidecar.
- The sidecar is the natural home should famous galaxies later gain more
  curator-authored render hints.

## References

- [ADR 0003 — Cluster catalog loading](0003-cluster-catalog-loading.md) —
  the binary+sidecar precedent this follows.
- `src/data/galaxyCatalog/galaxyCatalogFormat.ts` — the v6 fixed-stride format a bump
  would have disturbed.
- `tools/famous/buildFamous.ts` + `tools/famous/deriveFamousCalibration.ts`
  — where calibration is derived and written onto the meta entry.
- `src/services/engine/subsystems/texturedDiskSubsystem.ts` — the runtime
  consumer that reads `famousMeta[i].calibration`.
