# Milky Way shape — findings record

**Status: LIVING FOLDER.** Work on the Milky Way's representation is in flight on branch
`milky-way-analytic-field`; append to the file for the subsystem you are touching as it
continues. If none fits, add a new file AND an index line for it below, in the same change.
It exists so that a post-mortem and a research write-up can both be derived from one place,
without re-deriving anything or re-walking a dead end.

**Scope.** What has been learned about _representing the Milky Way's shape_ — the sampling
statistics, the calibration errors found in our own preset, the fade's anchor bug, and the
external models that do and do not exist. It is not a rendering-primitive survey; that is
[`../2026-07-30-galaxy-rendering-primitives.md`](../2026-07-30-galaxy-rendering-primitives.md)
(currently on branch `docs-galaxy-rendering-research`, unmerged). This folder cites that survey
and records only what is **new** or what **corrects** it.

## The organising rule

Every claim carries exactly one tag. The tag is the point of the document.

| Tag            | Means                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **MEASURED**   | Observed from a run, a simulation, or read off our source with `file:line`. Arithmetic over cited code constants is shown. |
| **LITERATURE** | Published, cited precisely enough to re-find. Nothing is tagged this way unless the citation was checked.                  |
| **INFERRED**   | Reasoning we have _not_ confirmed against a run or a source. **A future reader gets misled here.**                         |

If a claim in the source material carried no attribution, it is INFERRED, and says so.

---

## Files

- [`goal-and-history.md`](goal-and-history.md) — the sprite-density diagnosis that started the
  rework, the aggregate/leaf partition bug it left behind, and the user's DELETE-not-shrink goal.
- [`sampling-and-noise.md`](sampling-and-noise.md) — shot noise is Poisson regardless of the cull,
  the σ²N invariance, the immersion-measure derivation, and the arm-ridge blob/ring sampling rules.
- [`measurement.md`](measurement.md) — cost regimes differ by camera pose, and why the app harness
  cannot resolve the Milky Way's perf numbers.
- [`analytic-field.md`](analytic-field.md) — no MGE exists for the Milky Way, the closed-form
  Gaussian ray integral and its self-absorption limit, and the per-component shear that measured
  wrong.
- [`preset-calibration.md`](preset-calibration.md) — the disc scale length, bar angle, warp and
  vertical profile constants that disagreed with themselves or the literature.
- [`approach-fade.md`](approach-fade.md) — the Sun-anchored approach fade never fires at the
  galactic centre, and the two jobs it braids together.
- [`arms.md`](arms.md) — arms as a flux-field term over a star population, and the measured ridge
  width, flux and per-arm age split.
- [`dust.md`](dust.md) — the dust column model (erfc split, screen-space network architecture) and
  the beaded-lane resolution-mismatch debugging chain.
- [`hii-regions.md`](hii-regions.md) — filling the reserved HII-knot slot: the luminosity function,
  size-from-luminosity, and the firefly bug from sharing the field's render target.
- [`sf-map.md`](sf-map.md) — the SSPSF cellular-automaton decision for ISM structure, and its
  calibrated percolation threshold.
- [`data-model.md`](data-model.md) — why `GalaxyFieldTuning` and `GalaxyDustCloudParams` got
  regrouped by the contributor that reads them.
- [`literature.md`](literature.md) — the verified-citation table, what couldn't be supported, and
  whether F98 and SSPSF are still current.
- [`decisions.md`](decisions.md) — the 2026-08-01 decisions log: splat-only renderer, storage-buffer
  comps, de-featured rings, colour architecture.

## Related

- [`../2026-07-30-galaxy-rendering-primitives.md`](../2026-07-30-galaxy-rendering-primitives.md) —
  the primitive survey (billboards / splats / raymarch), SBF statistics, dust ordering, prior art,
  and the Milky Way parameter lookup tables. On branch `docs-galaxy-rendering-research`.
  Section 7 (control variates), Section 8 (MGE) and Section 10 (dust ordering) are the sections
  this folder corrects or extends.
- [`../../RENDERER.md`](../../RENDERER.md) — the frame graph and the WebGPU landmines.
- [`../../../.claude/skills/perf/SKILL.md`](../../../.claude/skills/perf/SKILL.md) — read before
  quoting any number from `npm run perf`; Section 6 is why.
