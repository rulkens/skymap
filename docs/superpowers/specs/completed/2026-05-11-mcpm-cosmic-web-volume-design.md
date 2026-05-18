# MCPM Cosmic Web Volume — Design

**Status:** Draft (2026-05-11)

**Goal:** Ingest the SDSS DR17 Cosmic Slime Value-Added Catalog (Wilde et al. 2023, arXiv:2301.02719) `SDSS_z_44-476mpc` density cube, ship it as a tiered scalar-volume asset (`mcpm-{small,medium,large}.scfd`), and render it through the existing scalar volume renderer alongside the CF-4 dark-matter overlay.

## Background

Skymap already ships one published cosmological reconstruction as a volumetric overlay: the **CF-4 dark-matter density** cube (Courtois 2025), 128³, decoded by `decodeScalarField` and rendered by `scalarVolumeRenderer`. That pipeline — `.npy` → `.scfd` → R2 → `decodeScalarField` → `r16float` 3D texture → ray-marched overlay — was built generically and is the load-bearing infrastructure this spec rides on.

The **Cosmic Slime VAC** (Burchett, Elek, Wilde et al.) is a different reconstruction of the same large-scale-structure substrate, produced by the Monte Carlo Physarum Machine (MCPM) algorithm. Where CF-4 derives a Wiener-filtered dark-matter density from peculiar-velocity tracers, MCPM derives a continuous "cosmic web" trace density from galaxy *positions* using a slime-mould-inspired agent swarm. Both are valid scalar fields and complementary scientifically — CF-4 emphasises gravitational potential structure; MCPM emphasises the connectivity skeleton of the cosmic web at the resolution of bright galaxies.

The MCPM SDSS cube covers comoving radial distances 44–476 Mpc from the observer — the same volume where Skymap's SDSS point cloud lives. It is therefore the relevant cube for the local universe view; the eight LRG shells in the same VAC cover deeper redshifts where Skymap doesn't render galaxy points and are deferred.

## Scope

**In scope (one plan):**
- The single `SDSS_z_44-476mpc` cube, downsampled into three tiers.
- A one-shot Python extractor that consumes the published `trace.bin.bz2`.
- A pure-TS build script (`tools/buildMcpmVolume.ts`) that turns each tier's `.npy` into an SCFD file, modelled exactly on `tools/buildCf4Density.ts`.
- Runtime wiring: tier-aware loading via the existing `state.sources.tier` pipeline.
- One new UI toggle alongside the CF-4 toggle.

**Out of scope (deferred to future plans):**
- The two `LRG_{NGC,SGC}_z_0-1000mpc` cubes (same pipeline, different parameters; can be its own plan once the SDSS cube is in production).
- Running MCPM ourselves (PolyPhy / Polyphorm route).
- Cross-comparison views (MCPM vs CF-4 side-by-side, difference visualisation).
- Extracting filaments from the MCPM cube via DisPerSE-on-MCPM.

## Data source

The Cosmic Slime VAC is hosted on the SDSS Science Archive Server at:

```
https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/
├── README.txt
├── export_metadata.txt
├── mcpm_v1_0_0_datacube_SDSS_z_44-476mpc.sha1sum
└── trace.bin.bz2                                            (345 MB compressed)
```

Per `export_metadata.txt`:

| Parameter | Value |
|---|---|
| Input dataset | `sdssGalaxy_rsdCorr_dbscan_e2p0ms3_dz0p001_m10p0` (324,849 SDSS galaxies, redshift-corrected) |
| Agent count | 10 M |
| Grid resolution | 712 × 1200 × 728 voxels |
| Grid physical size | 556.288 × 937.564 × 568.789 Mpc |
| Grid center | (−239.469, −16.5618, 201.275) Mpc |
| Base voxel edge | ≈ 0.7813 Mpc |

The file format is **not FITS**; it is Polyphorm's native binary "trace" format. The canonical reader is the Python library [`pyslime`](https://github.com/jnburchett/pyslime), which decompresses the bz2 and parses the trace into a `numpy.ndarray`. The README in the SAS directory explicitly directs consumers to pyslime for this purpose. Reimplementing pyslime in TypeScript was considered and rejected — it adds surface area for zero user-facing benefit when the existing CF-4 pipeline already establishes "Python extracts once, contributors curl pre-extracted .npy".

## Architecture

Two-stage pipeline mirroring the CF-4 ingest precisely. Maintainer-only steps happen once per VAC release; contributor steps happen on every full data rebuild.

```
[one-time, maintainer]

  data/raw/mcpm/trace.bin.bz2 (curl from data.sdss.org, 345 MB)
    │
    └─▶ tools/extractMcpmCube.py
          ├─ pyslime decompresses + parses → np.float32 (712 × 1200 × 728)
          ├─ block-averages × {8, 4, 2}
          └─ writes data/raw/mcpm/mcpm_sdss_d{8,4,2}.npy
    │
    └─▶ npx wrangler r2 cp ...   (upload 3 .npy files to R2 once)

[contributor build]

  data/raw/mcpm/mcpm_sdss_d{8,4,2}.npy (curl from R2, gitignored)
    │
    └─▶ npm run build-mcpm  →  tools/buildMcpmVolume.ts
          ├─ readNpy (existing parser)
          ├─ float32 → f16 (existing helper, extracted from buildCf4Density.ts)
          ├─ assembles ScalarCube with origin / voxelSize / frame / rotation
          └─ encodeScalarField → public/data/mcpm-{small,medium,large}.scfd
    │
    └─▶ npm run sync-r2          (ship .scfd to R2 runtime distribution)

[runtime]

  state.sources.tier ∈ {small, medium, large}
    │
    └─▶ cloudLoader fetches mcpm-<tier>.scfd
    │
    └─▶ decodeScalarField → ScalarCube
    │
    └─▶ scalarVolumeRenderer registers field handle 'mcpm'
    │
    └─▶ SettingsPanel: "MCPM Cosmic Web" toggle → render on / off
```

## Tiers

Three downsample levels matching the existing tier scheme:

| Tier | Factor | Dims | Voxel count | f16 size | Voxel edge |
|---|---|---|---|---|---|
| small | 8× | 89 × 150 × 91 | 1.22 M | **2.4 MB** | 6.25 Mpc |
| medium | 4× | 178 × 300 × 182 | 9.72 M | **19.4 MB** | 3.13 Mpc |
| large | 2× | 356 × 600 × 364 | 77.7 M | **155.5 MB** | 1.56 Mpc |

Tier selection is unified with the existing point-cloud tier dropdown: a user who picks `small` for SDSS gets `mcpm-small.scfd` automatically, no separate volume-quality control. Switching tier mid-session triggers a reload of the MCPM volume the same way it triggers a point-cloud reload (existing path through `state.sources.tier`).

Downsampling is performed in Python with `skimage.transform.downscale_local_mean` (or numpy block-mean, equivalent), preserving total integrated density. The block-average produces a mathematically clean low-pass filter; nearest-neighbour or stride decimation would alias the high-frequency filament structure visible at native resolution and is explicitly avoided.

## Coordinate frame

The grid center in `export_metadata.txt` is given in **equatorial-cartesian comoving Mpc** with the observer at origin — the same frame SDSS spectroscopic positions are stored in and the same frame `decodeScalarField` already supports as `frameKind = 'equatorial-cartesian'` (id 1).

The cube is axis-aligned to that frame (rotation = identity). SCFD header values for tier `t` with factor `f_t`:

| Header field | Value |
|---|---|
| `frameKind` | `'equatorial-cartesian'` |
| `dims` | `[round(712 / f_t), round(1200 / f_t), round(728 / f_t)]` |
| `origin` | `(−517.613, −485.343, −83.119)` Mpc (= grid_center − grid_size / 2; tier-independent) |
| `voxelSize` | `0.78131 × f_t` Mpc |
| `rotation` | `[0, 0, 0, 1]` (identity quaternion) |
| `valueMin / valueMax` | computed at build time from the f16 voxel range |

Origin is tier-independent because downsampling preserves the box extents.

**Verification step (load-bearing).** Before locking the build script's constants, the maintainer runs a Python sanity check that loads the cube via pyslime and:

1. Confirms `arr.shape == (712, 1200, 728)` matches the metadata's axis order (pyslime may return axes in a different order than the metadata lists — CF-4 had exactly this surprise in commit `c6024d3`, "transpose numpy axes 0↔2 to match WebGPU x-fastest layout").
2. Samples the cube at the world origin `(0, 0, 0)`. The expected value is near the local-universe density peak (we sit close to the Local Group's filament); a near-zero sample would indicate the axis convention is wrong.
3. Prints `(min, max, mean, p99)` of the trace values so the build script's f16 conversion can be sanity-checked for overflow / underflow (Polyphorm trace values can span several decades).

The build script then applies any axis swap required by step 1. If pyslime returns x-fastest, no transpose; if it returns z-fastest like numpy default for FITS-shaped data, transpose 0↔2 like CF-4 does.

## Component breakdown

| File | Action | Responsibility |
|---|---|---|
| `tools/extractMcpmCube.py` | new (Python) | pyslime-based one-shot: decompress → parse → block-average × {8,4,2} → write 3 `.npy` files |
| `tools/buildMcpmVolume.ts` | new (TS) | reads one `.npy` (CLI flag: `--factor=8\|4\|2` or `--all`), assembles `ScalarCube`, writes `.scfd` |
| `tools/parsers/floatToHalf.ts` | new or extracted | f32 → f16 IEEE-754 packing helper, extracted from `buildCf4Density.ts` so MCPM and CF-4 share it (DRY) |
| `data/raw/mcpm/` | new dir | gitignored input dir, contributors curl `.npy` here |
| `src/data/volumeFieldDefaults.ts` | modify | add `'mcpm'` entry with palette, contrast, densityScale, envelope |
| `src/services/engine/wiring/...` (volume registry) | modify | register MCPM as a tier-aware volume source, fetcher returns `mcpm-<tier>.scfd` |
| `src/components/SettingsPanel.tsx` | modify | one new checkbox row, "MCPM Cosmic Web", under the existing overlays section |
| `tools/syncR2.ts` | modify | extend the ALLOW filter with `mcpm-small.scfd`, `mcpm-medium.scfd`, `mcpm-large.scfd` |
| `package.json` | modify | add `"build-mcpm": "tsx tools/buildMcpmVolume.ts --all"` |
| `CLAUDE.md` | modify | one paragraph in the data pipeline section: MCPM ingest path |

The exact wiring point for the volume registry depends on how CF-4 is registered today — Task 5 (runtime wiring) verifies the precedent before mirroring it. If CF-4 uses a generic volume-source registry, MCPM joins it; if CF-4 is registered ad-hoc, the plan generalises the registry first.

## Presentation defaults

The `'mcpm'` entry in `volumeFieldDefaults.ts`:

| Field | Value | Rationale |
|---|---|---|
| `paletteId` | `'inferno'` | Visually distinct from CF-4's `'coolwarm'`; if both overlays are on, the user can read them as separate layers |
| `contrast` | `1.5` | MCPM trace densities are heavy-tailed (slime-mould agent density spans decades); modest windowing brings filament structure forward without crushing low-density voids |
| `densityScale` | `4.0` (initial; visually tuned in the implementation phase) | Starting point matching CF-4's tuned value; final number locked after dev-server visual check |
| `envelope` | `{ inner: 0.85, outer: 1.05 }` | Same spherical falloff posture as CF-4 — the cube corners hold sparse void anyway, and hiding the bounding-box silhouette lets the overlay blend with the surrounding sky |

## Error handling

- **Build script, missing raw `.npy`:** `tools/buildMcpmVolume.ts` exits non-zero with a curl command in the error message. Matches `buildCf4Density.ts` exactly.
- **Build script, wrong dims:** if `readNpy` returns dims that don't match the expected `[712/f_t, 1200/f_t, 728/f_t]`, fail with a "regenerate via extractMcpmCube.py" message — same pattern as the SCFD decoder's "regenerate" hint for version mismatches.
- **Runtime 404 on `mcpm-<tier>.scfd`:** log a warning and continue without the MCPM overlay. Matches the existing "filaments missing" behaviour; never blocks the rest of the scene.
- **Runtime decode failure:** `decodeScalarField` already throws on bad magic / unsupported version / dim mismatch. The volume loader wraps in try/catch and logs; same posture as existing fields.
- **Tier change race:** if the user switches tier while a previous MCPM fetch is in flight, the previous fetch is cancelled (existing tier-change pattern handles this for point clouds; MCPM joins the same path).

## Testing

Following the project's TDD convention; tests mirror the src tree.

**Pinning the build pipeline:**
- `tests/tools/buildMcpmVolume.test.ts` — feed a tiny synthetic `.npy` (e.g. 8 × 8 × 8 float32 with known values), run the build, decode the output `.scfd`, assert: dims correct, origin matches `gridCenter − gridSize/2`, voxelSize = baseEdge × factor, frame = equatorial-cartesian, valueMin/Max recovered from voxels, f16 round-trip within 0.1% of expected.

**Anti-drift on the real SDSS cube constants:**
- `tests/data/mcpmAnchors.test.ts` — pin the expected origin `(-517.613, -485.343, -83.119)` and voxelSize `0.78131 × factor` for each tier. Mirrors the role of `tools/auditCf4Anchors.ts` for CF-4: if a future maintainer re-runs the extractor with different downsample math, this test fails loudly rather than silently shipping a misaligned cube.

**Presentation defaults pinned:**
- `tests/data/volumeFieldDefaults.test.ts` — extend the existing test (or add a new `mcpm` block) pinning the `'mcpm'` entry against accidental edits.

**Geometric invariants:**
- `tests/data/mcpmGeometry.test.ts` — load a small precomputed real-data sample (checked into `tests/fixtures/` as a tiny SCFD), sample at world `(0, 0, 0)`: expect non-zero density (Local Group neighbourhood). Sample at a far corner: expect lower density. Wide tolerance (the test is "axes aren't mirrored"; not "density values are physically correct").

**Visual smoke test (manual, blocking before PR merge):**
- Dev server: enable MCPM toggle. Confirm an orange/red smoky overlay appears centered on the SDSS galaxy region. Toggle CF-4 on alongside: both should be visible as distinct layers (different palettes). Switch tiers small ↔ medium ↔ large: the MCPM overlay should swap without visual artefacts and intensify with the higher-res cube.

## Deploy workflow

Standard catalog-refresh deploy per `CLAUDE.md`:

1. (one-time per VAC release) `tools/extractMcpmCube.py` → 3 `.npy` files → upload to R2.
2. (per contributor) `curl <r2 url>/mcpm_sdss_d{8,4,2}.npy > data/raw/mcpm/...`
3. `npm run build-mcpm` → 3 `.scfd` files in `public/data/`.
4. `npm run sync-r2` ships the `.scfd` files to R2 runtime distribution (idempotent, picks up the extended ALLOW filter).
5. `npm run deploy` (= `git push origin main`) — Cloudflare GitHub integration rebuilds the static shell.

`public/data/mcpm-*.scfd` is gitignored (the same `public/data/*.bin` rationale extended; SCFD files are build artefacts of the deterministic Python+TS pipeline, not source data, and inflating clones with hundreds of MB of binary buys nothing).

## Open questions resolved during brainstorming

1. **Which cubes?** SDSS only. LRGs deferred — they cover redshifts where Skymap has no galaxy points anyway.
2. **FITS parser in TS?** Rejected — the files are not FITS; they are `trace.bin.bz2`, read by Python `pyslime`. We use the CF-4 pattern (Python extracts once, contributors curl pre-extracted `.npy`).
3. **One toggle or per-cube toggles?** One toggle. Since we're shipping a single cube, this is trivially answered; multi-cube toggling can be revisited when the LRG plan lands.
4. **Tier strategy?** Three downsampled tiers (8× / 4× / 2×), driven by the existing `state.sources.tier`. No separate volume-quality control.
5. **Coordinate frame?** Equatorial-cartesian, observer at origin. Axis convention verified at extraction time via a Python sanity check; transpose applied if pyslime returns axes in a different order than the metadata implies (CF-4 precedent).

## References

- Wilde, M.C., Burchett, J.N., Elek, O., et al. 2023, "SDSS DR17: The Cosmic Slime Value Added Catalog", arXiv:[2301.02719](https://arxiv.org/abs/2301.02719)
- Elek, O., Burchett, J.N., Prochaska, J.X., Forbes, A.G. 2021, "Polyphorm: Structural Analysis of Cosmological Datasets via Interactive Physarum Polycephalum Visualization", IEEE TVCG, arXiv:[2009.02441](https://arxiv.org/abs/2009.02441)
- Elek, O., Forbes, A.G. 2022, "Monte Carlo Physarum Machine: Characteristics of Pattern Formation in Continuous Stochastic Transport Networks", Artificial Life, arXiv:[2204.01256](https://arxiv.org/abs/2204.01256)
- SDSS DR17 Cosmic Slime VAC landing page: `https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold`
- VAC data location: `https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/`
- pyslime: `https://github.com/jnburchett/pyslime`
- Polyphorm: `https://github.com/CreativeCodingLab/Polyphorm`
- PolyPhy (Python successor): `https://github.com/PolyPhyHub`
