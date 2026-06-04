# CF-4 raw data

This directory holds two largely independent CF-4 products:

- **DM density cube** — Courtois 2025 *CF4++* ensemble, used by Skymap's
  scalar-volume renderer to draw the cosmic web.
- **Local-volume distance table** — Tully 2023 *Cosmicflows-4* compilation
  (`table2.dat`), used to override galaxy positions inside 30 Mpc where
  peculiar velocities dominate the cz signal.

Both come from the same Cosmicflows-4 program but live as separate files,
ship through separate pipelines, and are gitignored except for this
README and the `table2.dat.sha256` sidecar.

---

## DM density cube (CF4++)

Stores the intermediate `.npy` slice of the Courtois 2025 **CF4++**
release that feeds Skymap's CF-4 DM density volume. Nothing in this part
of the directory is committed to git; the runtime artefact lives on R2
and is pulled by `curl`, the intermediate is regenerable from the
upstream `.npz`.

### Why CF4++ (and not Valade 2024 HAMLET 256³)?

The original 2026-05-10 spec assumed the Valade 2024 256³ HAMLET cube as
the data source, but that exact file is not publicly distributed.  The
nearest equivalent on the public IP2I page is the Courtois 2025 CF4++
ensemble — a 128³, 1000 Mpc box reconstruction in supergalactic Cartesian
that ships the mean and standard deviation across 10 000 HMC posterior
steps for density, Cartesian velocity, and radial velocity (six arrays
total).

We consume only the `d_mean_CF4pp` mean-density array.  The std cube is
the natural future input for an uncertainty-aware overlay; that's a
separate plan.

### Density-cube files

| File | Size | Purpose | How to obtain |
|------|------|---------|---------------|
| `CF4pp_mean_std_grids.npz` | ~167 MB | Upstream Courtois 2025 ensemble (maintainer only) | Download from <https://projets.ip2i.in2p3.fr/cosmicflows/> |
| `d_mean_CF4pp.npy` | ~8 MB | Flat f32 128³ mean-density slice | `curl` from R2 (see below) — or extract from `.npz` |

The runtime artefact is `public/data/cf4_density.scfd` (~4 MB f16),
produced from the `.npy` via `npm run build-cf4-density`.  That `.scfd`
is also synced to R2 and is what the browser fetches at runtime.

License: CF-4 data is free for research and visualisation use; cite
Courtois et al. 2025 (A&A, arXiv:2502.01308) and Tully et al. 2023 (CF-4
catalog) in any derived work.  If you swap in the Valade 2024 HAMLET cube
later (e.g. by personal request to the IP2I group), also cite Valade et
al. 2024 (Nature Astronomy, arXiv:2409.17261).

### Contributor path (no Python, no unzip required)

Pull the pre-extracted slice from R2:

```
curl -L -o data/raw/cf4/d_mean_CF4pp.npy \
  https://skymap-data.rulkens.com/data/raw/cf4/d_mean_CF4pp.npy
```

Then build the runtime `.scfd`:

```
npm run build-cf4-density
```

This reads the `.npy`, converts f32 → f16, builds the SG→equatorial
rotation, and writes `public/data/cf4_density.scfd` (~4 MB) — pure
Node/TS, no Python.

If you don't even need to rebuild the `.scfd` (because you're not
modifying the format or the build pipeline), just curl the `.scfd`:

```
curl -L -o public/data/cf4_density.scfd \
  https://skymap-data.rulkens.com/data/cf4_density.scfd
```

### Maintainer path (run once per upstream release)

1. Download the upstream archive:
   ```
   curl -L -o data/raw/cf4/CF4pp_mean_std_grids.npz \
     https://projets.ip2i.in2p3.fr/cosmicflows/CF4pp_mean_std_grids.npz
   ```
2. Extract just the mean-density array (no Python required — `.npz` is
   a plain ZIP archive of `.npy` files):
   ```
   unzip -j data/raw/cf4/CF4pp_mean_std_grids.npz d_mean_CF4pp.npy \
     -d data/raw/cf4/
   ```
3. Sync both the intermediate and any rebuilt `.scfd` to R2:
   ```
   npm run build-cf4-density   # produces public/data/cf4_density.scfd
   npm run sync-r2             # uploads .npy (EXTRA_FILES) + .scfd (ALLOW)
   ```

The upstream `.npz` itself is **not** synced to R2 — contributors should
never need to handle the 167 MB ensemble.  Only the ~8 MB `d_mean_CF4pp.npy`
slice goes up.

---

## Velocity field (flow viz)

The same `CF4pp_mean_std_grids.npz` ensemble is the source for Skymap's
animated **flow-field** layer — drifting / streamline ribbons that trace
the CF4++ peculiar-velocity reconstruction over the galaxy field.  It is
registered once as `cf4.vfield-npz` (path `data/raw/cf4/CF4pp_mean_std_grids.npz`)
and consumed by a *second* extractor alongside the density slice above:
one upstream file, two consumers.  Registering it under a parallel
`cf4pp/` directory would have duplicated the 167 MB download and this
provenance doc, so it lives here with the rest of the CF4++ ensemble.

### npz keys

The extractor (`tools/flow/extractFlowField.py`) packs two of the six
ensemble arrays:

| npz key | Array | Shape | Units | Role |
|---------|-------|-------|-------|------|
| `v_mean_CF4pp` | Cartesian peculiar velocity, posterior mean | `(3,128,128,128)` or `(128,128,128,3)` | km/s | RGB = (vx, vy, vz) |
| `d_mean_CF4pp` | Overdensity δ, posterior mean | `(128,128,128)` | dimensionless | A = δ (drives density-weighted seeding) |

The full ensemble holds **six** 128³ arrays — posterior **mean and std**
for density, Cartesian velocity, and radial velocity.  The flow extractor
uses only the two mean arrays above; the exact remaining key names are
printed by the extractor at run time (`print("npz keys:", …)`).  The std
cubes are the natural future input for an uncertainty-aware overlay — a
separate plan, same as for the density cube.

### Box geometry & frame

128³ grid over a **1000 Mpc** cube (**physical** Mpc, not Mpc/h — matching
the density build's `CF4PP_VOXEL_SIZE_MPC = 1000/128`; the spike's
`boxMpcPerH` sidecar key is a misnomer) in **supergalactic Cartesian**
coordinates.  Unlike the throwaway cosmic-flow spike (which labelled the
array axes arbitrarily because flow *coherence* is frame-invariant), the
production extractor replicates the density cube's frame handling: the same
numpy-C-order → WebGPU-x-fastest memory transpose, the same observer-centred
`origin` (`-voxelSize · dims/2`), and `frameKind: 'supergalactic-cartesian'`,
so the flow cube co-registers with the galaxies and the CF-4 density volume
by construction.  The velocity components ride along in native SG order
(`v_mean_CF4pp` is SG-Cartesian, aligned with the grid position axes — the
same axis-0 = SGX convention the density build assumes); the memory
transpose relocates each vector without rotating its basis.

### Build

```
npm run build-flow-field    # extracts → public/data/flowfield.{bin,json}
```

`flowfield.bin` is a 128³ RGBA16F cube (vx, vy, vz, δ), stored in the
version-3 scalar-field format (`channels = 4`).  Like the density `.scfd`
it is a gitignored build artefact synced to R2, not committed.  Citation
is the same as the density cube above (Courtois et al. 2025).

---

## Local-volume distance table (Tully 2023)

Source: CDS Vizier table [J/ApJ/944/94](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJ/944/94),
Tully et al. 2023, *Cosmicflows-4*.

### Distance-table files

| File | Size | Purpose | How to obtain |
|------|------|---------|---------------|
| `table2.dat.gz` | ~2.5 MB | Gzipped fixed-width ASCII as shipped by CDS | `npm run fetch-cf4` |
| `table2.dat` | ~10.6 MB | Decompressed table; byte layout matches `ReadMe` | Auto-produced by fetcher |
| `ReadMe` | ~20 KB | CDS column-offset spec — source of truth for byte ranges | `npm run fetch-cf4` |
| `table2.dat.sha256` | 1 line | Checksum of decompressed table (committed) | Auto-produced by fetcher |

Each row of `table2.dat` is one galaxy (55,877 total) with a homogenised
redshift-independent distance modulus + uncertainty, cross-IDed against
PGC and 2MASS XSC. The parser in `tools/parsers/cosmicflows4.ts` (sub-plan
02) reads byte ranges according to the `ReadMe` byte-offset spec; if CDS
ever re-issues the table with a different layout, re-download both files
together — the ReadMe is the source of truth.

### How the distance table is used

CF4 supplies redshift-independent distance moduli for ~55k local-volume
galaxies. The build pipeline applies them as a position override for
galaxies inside 30 Mpc (where peculiar velocities dominate the cz signal).
See `docs/superpowers/specs/2026-05-27-local-volume-distances.md` and
`docs/superpowers/plans/2026-05-27-local-volume-distances.md` for the
full design.

### Citation

Tully, R. B., Kourkchi, E., Courtois, H. M., et al. 2023, ApJ, 944, 94.
DOI: [10.3847/1538-4357/ac94d8](https://doi.org/10.3847/1538-4357/ac94d8).
