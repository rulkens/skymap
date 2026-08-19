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
  15.7 GB download. Better still: the Zenodo record ships the authors' own
  `interp2box.py` (HEALPix → cartesian box at any chosen dims/extent, e.g.
  `-b '(256,256,256)::((-1250,1250),(-1250,1250),(-1250,1250))'`) — it
  interpolates in **log-density then exponentiates**, which is the correct
  resampling for this log-normal field. Prefer it over a hand-rolled
  resampler; the log radial spacing is exactly the aliasing trap it handles.

**This is the MCPM pattern, exactly.** MCPM already documents a Python +
domain-package extraction (`tools/volumes/extractMcpmCube.py`, "requires
Python + pyslime, once per VAC release; contributors curl the pre-extracted
`.npy` tiers from R2 and run `npm run build-mcpm`"). Replace pyslime with
`dustmaps` and the flow is identical.

A modest cube — 256³ at ~10 pc voxels (±1.25 kpc) — is **~32 MB as f16 SCFD**
(384³ ≈ 108 MB), trivial next to `glade-large.bin` (130 MB). Tier it
small/medium/large like MCPM.

**Licence: verified 2026-08-19 — CC-BY 4.0** (Zenodo API `license.id:
cc-by-4.0`). Cite Edenhofer et al. 2024, A&A 685, A82
(`10.1051/0004-6361/202347628`) + the dataset DOI. Published paper confirms
the survey above: Nside 256 (14′), 516 log-spaced radial bins 69→1250 pc
(widths 0.4→7 pc), quantity is **unitless ZGR23 extinction density per pc**
(× 2.8 ≈ A_V). `mean_and_std_healpix.fits` is 3.25 GB exact.

## Ingestion pitfalls (verified against the release readme + paper, 2026-08-19)

- **Inner 69 pc hole.** The main product starts at the first radial bin
  (69 pc); the innermost sphere ships only as a separate integrated-extinction
  patch. A raymarched density cube gets a hole around the Sun — decide to
  accept it (it IS the Local Bubble region, genuinely low-dust) or fill from
  the auxiliary map. `dustmaps` re-adds it only for `integrated=True` queries.
- **Mean ≠ typical realization.** The field is log-normal; the shipped mean is
  systematically brighter than any single posterior sample, most visibly in
  low-density regions. Fine for visualization, but don't stack tuning on top
  of the inflated floor — consider the median-ish look of one sample if the
  voids read hazy.
- **2 kpc edition** (`validation_with_less_data_but_2kpc_*`) exists but the
  authors explicitly caution against trusting small-scale structure at large
  distances in it. Default to the 1.25 kpc primary product.
- 256³ over ±1.25 kpc is ~9.8 pc voxels vs the map's 0.4–7 pc native radial
  bins — we are the coarse side, so no oversampling concern; 384³ (~6.5 pc)
  is the ceiling worth considering for the large tier.

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

1. Slab: **researched 2026-08-19 — answer: NEAR0, zero new slabs.** NEAR0 is
   now infinite-far reversed-Z (`computeForegroundViewProj.ts:145`, zFar
   omitted; spec `2026-07-20-reversed-z-near0-depth.md`), so its bracket is
   ratio-unlimited: adaptive near (`dist·1e-4`, floor 1e-19) + no far clip
   covers a Sun-centered ±1.25 kpc cube from every pose, and its
   origin-relative f64 vp is ideal for a cube whose origin IS the render
   origin. Precedent: the MW impostor made this exact move for the same
   10 kpc COSMO near-plane reason. The raymarch is depthless (no depth
   attachment on the volume target), so the depth convention doesn't bite.
   The star-field-own-slab item's motivation (far-plane sweep clipping
   anchors) was retired by reversed-Z, which post-dates it — that item
   should be re-audited, not co-designed; its residual value is two
   slab-independent refactors. Concrete shape: a `dust-volume` reduced-res
   target + a `(dust-volume, NEAR0)` render step before the `(hdr, NEAR0)`
   step, folded into HDR by a **multiplicative** upsample layer registered
   after `milkyWayUpsampleLayer`/`star-catalog` — the exact
   mw-aggregate→upsample pattern, with the blend state already shipping in
   `milkyWayCloudRenderer.ts` (`DUST_BLEND`: `dst·src` per-channel
   transmittance).
2. Compositing: emissive glow (ship-fast) vs Beer–Lambert absorption
   (physical) — and if absorption, the dust pass's order relative to the
   star/Earth passes and the HDR composite.
3. Cube resolution + tiers: 256³ vs 384³; voxel size vs the map's native
   ~2–10 pc effective resolution (don't oversample past the data).
4. Extent: full 1.25 kpc, or a tighter Local-Bubble crop for the small tier?
5. Seam with the procedural MW dust (2026-08-19, researched): the live app's
   MW dust is the v1 sprite pass (`milkyWayLayer`, multiplicative, NEAR0);
   the `ismMap/` shader tree is tool-only today but is the planned
   replacement. The handoff answer is **fade-band choreography, not
   geometry**: the MW impostor already dies on approach via
   `milkyWayApproach` (full at 2 kpc, gone at 200 pc) while Gaia fades in
   over 8–25 kpc. The dust field wants the inverse band — full inside
   ~2 kpc, gone by ~15–25 kpc — meeting the procedural dust the same way
   Gaia meets the procedural stars. **Blocker found:** `deriveVolumeLiveness`
   applies the `surveyDeepZoom` band (gone at 2 kpc) to EVERY field, which
   zeroes the dust cube exactly where it must live — fades must become
   per-field (registry-driven band choice) before this ships.
6. Sequencing vs the volume-raymarch-acceleration effort (in flight,
   2026-08-13 plan): it is rewriting the same raymarch pass (empty-space
   skipping via max-pyramid, LOD mips). A local dust cube is mostly empty —
   it benefits directly — but land this after that work settles to avoid
   editing a moving shader.

(Engine-gap claims re-verified 2026-08-19: volume target still renders on the
COSMO slab — `frameProgram.ts:98` — with `COSMO_NEAR_MPC = 0.01`; the
Milky Way impostor's move to NEAR0 is the precedent, per the comment in
`slabs.ts`. The scalar-volume fragment pass is still emissive-additive only.)

## Ground preparation (refactor-ground checkpoint, 2026-08-19 — awaiting user sign-off)

Ideal shape: one `VolumeSourceEntry` row (`edenhofer-dust`, NEAR0-rendered,
`absorptive: true`), with `VolumeFieldDefaults` growing two optional fields —
`absorptive?: boolean` (drives the dormant palette-slot conditional in
`VolumeFieldRow.tsx:214`) and `fadeBands?: readonly FadeBand[]` (default
`[surveyDeepZoom]`) — and `VolumeFieldSettings` growing `bands` seeded from it,
so band edges are generically tunable via `writeVolumeField` (discharges grill
Q8 "tunable" with zero dust-special code). `settings.dust = { rv, targetScale }`
mirrors the MilkyWaySettings/`MILKY_WAY_SLIDER_FIELDS` debug-section pattern.
Target row uses the live-scale precedent
(`scale: (s) => s.settings.dust.targetScale`, mw-aggregate style).

Verdicts: everything is growth at existing seams EXCEPT two missing joints →
**Prep 1** per-field fade bands (`volumeLiveness.ts` applies `surveyDeepZoom`
unconditionally; own PR, first — grill Q10); **Prep 2** extract the raymarch
skeleton (`intersectUnitAabb` + ray reconstruction + `sphericalEnvelope`,
inline in `scalarVolume/fragment.wesl`) to `shaders/lib/` — second-consumer
trigger; MUST sequence after the volume-raymarch-acceleration work settles
(NOTE 2026-08-19: that effort is PARKED, PR #556 closed — the file is free).
Growth-via-sibling (feature commits, not prep): `createMultiplyUpsample`
(the additive fold factories bake their blend by documented design; `Blend`
already has `'multiply'`, `DUST_BLEND` in `milkyWayCloudRenderer.ts:104` is
the pipeline precedent) and a `dustVolumeRenderer` sibling (shared additive
pipeline bakes blend + palette LUT).

Adjacent finding (default: backlog line, promotion is the user's call): the
dust fetcher would be the THIRD hand-copied tiered-SCFD fetcher
(`mcpmFetcher`, polyphorm's) — a `createTieredScfdFetcher(baseName)` factory
would collapse them.

Open asks at the checkpoint: (1) shape sign-off; (2) Prep-2 packaging — own
tiny PR vs first commit of the renderer-slice PR; (3) promote the fetcher
factory or leave as backlog.

## Data on disk (2026-08-19)

Fetched to MAIN checkout `data/raw/edenhofer/` (provenance README there):
`mean_and_std_healpix.fits` (3.25 GB, bake input), `samples_healpix.fits`
(19.5 GB, insurance), 2 kpc `mean_and_std` (4.12 GB), `interp2box.py` /
`interp2lbd.py` (verified: interpolates `np.log(data)`, exponentiates — line
318) + upstream readme as `zenodo_readme.md` (case-collision rename). `.md5`
sidecars = Zenodo's checksums. FITS payloads byte-identical v1.0→v1.0.2.
Bonus: the FITS carry "mean/std of integrated inner density" HDUs — the
inner-69 pc patch ships inside the files (option (c) fill data available).
NOT fetched: xyz/lbd pre-interpolations (re-derivable), stellar catalogs,
2 kpc samples (24.7 GB). The fetch script lives beside the data as
`data/raw/edenhofer/fetch_edenhofer.sh` — resumable (`curl -C -`), md5-verifies
everything; re-run it if any file is missing or truncated.

## References

- `docs/powers-of-ten/data.js` — the 10¹⁹ rung this completes
- `src/data/volume/scalarFieldFormat.ts` — SCFD format
- `tools/volumes/buildMcpmVolume.ts` + `extractMcpmCube.py` — the clone target
- `src/services/engine/frame/slabs.ts` — `COSMO_NEAR_MPC` = 0.01 (the gap)
- `src/services/gpu/shaders/scalarVolume/fragment.wesl` — additive/emissive raymarch
- [`2026-07-13-star-field-own-slab.md`](2026-07-13-star-field-own-slab.md) — co-design the slab work
- Edenhofer et al. 2023, Zenodo [10.5281/zenodo.8187943](https://doi.org/10.5281/zenodo.8187943); [`dustmaps`](https://dustmaps.readthedocs.io/)
