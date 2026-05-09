# CF-4 Dark-Matter Density Volume Render — Plan Index

> **SUPERSEDED 2026-05-10.** Re-scoped against the scalar-volume-renderer primitive that landed 2026-05-09. New spec: [`docs/superpowers/specs/2026-05-10-cf4-dm-volume-content-design.md`](../../specs/2026-05-10-cf4-dm-volume-content-design.md). New plan to follow. The two sub-plans in this directory (`01-build-pipeline`, `02-renderer`) are preserved for historical context but should not be executed.

---

This feature implements the design at
[`docs/superpowers/specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../specs/2026-05-07-cf4-dark-matter-volume-render-design.md).

It is split into two independently shippable sub-plans. Each one produces working,
demoable software that the user can review before the next plan starts.

## Why a CF-4 dark-matter volume layer

Cosmicflows-4 (Valade et al. 2024 "HAMLET" 256³) reconstructs the local-universe
DM density field from ~56k peculiar velocities. Volume-rendering it produces the
canonical cosmography aesthetic: Laniakea, the Local Void, the Great Attractor
visible as glowing blobs and dark cavities around the existing GLADE galaxies.

This is the first time Skymap renders a continuous 3D scalar field rather than
discrete points or lines. The pipeline established here is intended to be reusable
for later DM-related layers (BORG-SDSS, future CF-4++ ensembles).

## Sub-plans

| # | Plan | What it ships | Prereqs |
|---|------|---------------|---------|
| 01 | [Build pipeline](./2026-05-07-cf4-dm-volume-01-build-pipeline.md) | Maintainer-only Python ingest + pure-Node TS build script + binary format + decoder + `superGalacticTransform` helper, all with tests. `cf4_density.bin` exists on R2; the `.npy`/`.meta.json` intermediates are also on R2 (HyperLEDA-style) so contributors never need Python. Nothing renders. | none |
| 02 | [Renderer + UI](./2026-05-07-cf4-dm-volume-02-renderer.md) | `cf4DensityLoader`, `cf4DensityRenderer`, `cf4Density.wgsl` ray-march pass, engine wiring, SettingsPanel toggle + intensity slider, CommandPalette entry. Volume renders behind galaxies; toggle works. | 01 |

## Dependency graph

```
01 build-pipeline
       │
       ▼
02 renderer + UI
```

## Stop-anywhere guarantees

Each plan finishes with working, demoable software:

- **After 01:** Run `npm run build-cf4-density` against a manually-prepared
  `data/raw/cf4/cf4_density_256.npy` and observe a 32 MB `public/data/cf4_density.bin`.
  Encode/decode round-trip tests are green. SG→equatorial transform is anchored
  against Virgo/Coma. No rendering yet.
- **After 02:** Toggle "Dark Matter (CF-4)" in the SettingsPanel. Laniakea
  lights up around the existing GLADE galaxies as a translucent fog. Toggle off
  → scene returns to the current Skymap. Intensity slider modulates opacity 0→2.

## Cross-plan resource: `superGalacticTransform`

Plan 01 introduces `src/data/superGalacticTransform.ts`, a small pure helper for
supergalactic-Cartesian → equatorial-Cartesian rotation. The existing
`2026-05-05-cf4-01-build-pipeline.md` (streamline plan) also needs this transform.

Whichever plan lands first ships the helper; the other consumes it. This plan's
Task 1 includes the transform; if the streamline plan has already landed it,
that task collapses to a verification-only step.

## Contributor vs maintainer paths

Building the runtime `cf4_density.bin` is **pure Node/TS** — no Python needed.
This follows the precedent set by `hyperleda_pa.csv.gz`: the slow/exotic
toolchain (HyperLEDA fetch, scipy `.sav` reader) is a maintainer-only step,
and the processed intermediate is hosted on R2 via `tools/syncR2.ts`'s
`EXTRA_FILES` mechanism. Contributors `curl` the intermediate and rebuild
forward from there, or skip the rebuild entirely and consume the `.bin`
directly from R2.

Plan 01 wires both the `.bin` (ALLOW) and the `.npy` + `.meta.json`
(EXTRA_FILES) into the R2 sync. See `data/raw/cf4/README.md` (created in
Plan 01 Task 0) for the explicit curl invocations.

## Open questions

- **`.sav` variable name** — undocumented in Valade 2024. Plan 01 Task 5
  includes a one-shot Python REPL probe to discover the actual key inside the
  file before the ingest script is hardened. Maintainer-only; contributors
  using the curl-from-R2 path never run this.
- **Default off vs on** — v1 ships `cf4DensityEnabled: false`. After visual
  verification we may flip the default; out of scope for these plans.
