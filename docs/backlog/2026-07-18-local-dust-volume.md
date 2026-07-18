# Local interstellar-dust volume (Edenhofer 2024)

**Status:** needs-design
**Area:** Rendering / volumes + data source

The 10¹⁹ "stars around the Sun" rung of the Powers-of-Ten ladder
(`docs/powers-of-ten/data.js`) is marked _buildable_ precisely because the
Gaia star field already renders and this dust volume is the missing half. It
is the natural companion to the near-field star bin: stars + the dust they
sit inside, at the Local-Bubble scale.

## The data is available and ideal

Edenhofer et al. (2023), "A parsec-scale Galactic 3D dust map out to 1.25 kpc
from the Sun." Zenodo DOI [10.5281/zenodo.8187943](https://doi.org/10.5281/zenodo.8187943).

- **Quantity:** differential dust _extinction density_ — magnitude per parsec
  (the Zhang–Green–Rix 2023 extinction unit). A genuine continuous density
  field, not integrated columns — exactly what a raymarch wants.
- **Native grid:** HEALPix × distance — 516 log-spaced shells 69→1250 pc,
  Nside 256, 12 posterior samples, **centered on the Sun**. A validation run
  extends to 2 kpc. The Local Bubble (~300 pc) sits well inside.
- **Also provided pre-resampled** to cartesian `xyz` (mean+std, 15.7 GB,
  2 pc voxels, |X|,|Y| ≤ 2100 pc, |Z| ≤ 700 pc) and galactic `lbd`. Full
  deposit is 122.7 GB — but we need almost none of it.
- **Light acquisition path:** the [`dustmaps`](https://dustmaps.readthedocs.io/)
  Python package. `Edenhofer2023Query` samples at arbitrary `(l, b, distance)`
  with `mode='mean'`; `fetch()` pulls only **~3.2 GB** (mean+std HEALPix) once
  on a build machine. Sample it onto whatever cartesian grid we choose — no
  15.7 GB download.

**This is the MCPM pattern, exactly.** MCPM already documents a Python +
domain-package extraction (`tools/volumes/extractMcpmCube.py`, "requires
Python + pyslime, once per VAC release; contributors curl the pre-extracted
`.npy` tiers from R2 and run `npm run build-mcpm`"). Replace pyslime with
`dustmaps` and the flow is identical.

A modest cube — 256³ at ~10 pc voxels (±1.25 kpc) — is **~32 MB as f16 SCFD**
(384³ ≈ 108 MB), trivial next to `glade-large.bin` (130 MB). Tier it
small/medium/large like MCPM.

**Pre-spec verification (one fact):** confirm the Zenodo record's reuse
licence before ingest — it is citable (Edenhofer et al. 2023) but the licence
was not confirmed during this survey.

## Rendering: most of the stack exists; one real engine gap

skymap already has a complete scalar-volume pipeline. Adding a scalar field is
a well-trodden ~12-site mechanical job (mirror MCPM/CF-4), no new format:

- **Format** — `src/data/volume/scalarFieldFormat.ts` (SCFD v3, 96-byte
  header, f16 voxels). Extent is **per-field** in the header
  (`origin` + `voxelSize` + `dims`); nothing in the format or
  `buildCubeModelMatrix` assumes a cosmological voxel size, so a sub-parsec
  cube encodes and places fine.
- **Builder** — new `tools/volumes/buildDustVolume.ts` mirroring
  `buildMcpmVolume.ts` (npy → f16 → `encodeScalarField`, tiered), fed by a
  new `extractDustCube.py` mirroring `extractMcpmCube.py`.
- **Registration surface** — Source enum (`src/data/source.ts`), registry
  entry (`src/data/sources/<id>.ts` + `SOURCE_REGISTRY` row), fetcher + slot
  (mirror `mcpmFetcher`/`mcpmSlot`), `AssetKey`, demand row
  (`assetWiring.ts`), raw-data registry, R2 allow-list (`tools/deploy/syncR2.ts`).
  Settings/UI need no edits — volume rows are keyed generically by
  `VolumeFieldId`.

**The load-bearing gap — the render slab.** The raymarch runs on the **COSMO**
slab (`scalarVolumeLayer.slab = COSMO`), whose near plane is hardcoded at
`COSMO_NEAR_MPC = 0.01` (**10 kpc**) in `src/services/engine/frame/slabs.ts`.
A ±1.25 kpc dust cube (≈0.0025 Mpc across) sits _entirely inside_ 10 kpc: to
look at it the camera is a few kpc from the Sun, so the whole cube is nearer
than the COSMO near-clip and gets thrown away. The volume _format/placement_
is scale-agnostic; the _render slab_ is not. Options: re-home the volume
offscreen target onto the **NEAR0** slab (today it carries Sun/Earth/stars/
orbits but not the volume target), or add a sub-kpc-near slab. Either is a
real engine change, and it overlaps the slab-restructuring theme in
[`2026-07-13-star-field-own-slab.md`](2026-07-13-star-field-own-slab.md) —
design them together.

**The aesthetic-vs-physical axis — compositing.** The existing pass
(`shaders/scalarVolume/fragment.wesl`) is **additive/emissive** — front-to-back
accumulation, palette LUT, bright-end exposure blow-out — tuned to make the
_cosmic web glow_. Dust is physically **absorptive**: it should dim and redden
the stars _behind_ it (dark nebulae), not glow.

- Cheapest: reuse the emissive pass with a warm/brown palette → glowing dust
  clouds. Looks fine, isn't physical.
- Right: a Beer–Lambert absorption / over-compositing mode, ordered against
  the star passes so the dust occludes them. Additional rendering-infra work,
  and it interacts with the slab/pass ordering above.

## Smaller, table-driven pieces

- **Fade band** — a `SCALE_FADE_BANDS` entry (#438) so the field fades in only
  around the Local-Bubble zoom (meaningless at cosmological _and_ planetary
  zoom); gate via `volumeLiveness`.
- **Colour ramp** — pick an existing palette or add one brown/absorptive
  branch in `src/data/volume/scalarFieldPalettes.ts` (+ `ScalarFieldPaletteId`).
- **densityScale/intensity** — tune per-cube on the registry entry; local-space
  math is [0,1]³ so per-step integration is extent-independent, only the data's
  dynamic range matters.

## Design questions

1. Slab: re-home the volume target to NEAR0, or a new sub-kpc slab? Resolve
   jointly with the star-field-own-slab item.
2. Compositing: emissive glow (ship-fast) vs Beer–Lambert absorption
   (physical) — and if absorption, the dust pass's order relative to the
   star/Earth passes and the HDR composite.
3. Cube resolution + tiers: 256³ vs 384³; voxel size vs the map's native
   ~2–10 pc effective resolution (don't oversample past the data).
4. Extent: full 1.25 kpc, or a tighter Local-Bubble crop for the small tier?

## References

- `docs/powers-of-ten/data.js` — the 10¹⁹ rung this completes
- `src/data/volume/scalarFieldFormat.ts` — SCFD format
- `tools/volumes/buildMcpmVolume.ts` + `extractMcpmCube.py` — the clone target
- `src/services/engine/frame/slabs.ts` — `COSMO_NEAR_MPC` = 0.01 (the gap)
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` — additive/emissive raymarch
- [`2026-07-13-star-field-own-slab.md`](2026-07-13-star-field-own-slab.md) — co-design the slab work
- Edenhofer et al. 2023, Zenodo [10.5281/zenodo.8187943](https://doi.org/10.5281/zenodo.8187943); [`dustmaps`](https://dustmaps.readthedocs.io/)
