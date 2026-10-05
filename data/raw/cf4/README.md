# CF-4 raw data

This directory holds two largely independent CF-4 products:

- **Flow-field source** — Courtois 2025 *CF4++* ensemble (mean velocity +
  mean density arrays), used by Skymap's flow-field builder to draw the
  cosmic-web peculiar-velocity overlay.
- **Local-volume distance table** — Tully 2023 *Cosmicflows-4* compilation
  (`table2.dat`), used to override galaxy positions inside 30 Mpc where
  peculiar velocities dominate the cz signal.

Both come from the same Cosmicflows-4 program but live as separate files,
ship through separate pipelines, and are gitignored except for this
README and the `table2.dat.sha256` sidecar.

---

## Flow-field source (CF4++)

Stores the intermediate `.npy` slices of the Courtois 2025 **CF4++**
release that feed Skymap's animated **flow-field** layer — drifting /
streamline ribbons that trace the CF4++ peculiar-velocity reconstruction
over the galaxy field. Nothing in this part of the directory is committed
to git; the runtime artefact (`flowfield.scfd`) lives on R2 and is pulled
by `curl`, the intermediates are regenerable from the upstream `.npz`.

### Why CF4++?

The Courtois 2025 CF4++ ensemble is a 128³, 1000 Mpc box reconstruction in
supergalactic Cartesian that ships the mean and standard deviation across
10 000 HMC posterior steps for density, Cartesian velocity, and radial
velocity (six arrays total).

We consume only the `v_mean_CF4pp` (velocity) and `d_mean_CF4pp` (density)
mean arrays — the density term drives the flow field's alpha channel. The
std cubes are the natural future input for an uncertainty-aware overlay;
that's a separate plan.

### Source files

| File | Size | Purpose | How to obtain |
|------|------|---------|---------------|
| `CF4pp_mean_std_grids.npz` | ~167 MB | Upstream Courtois 2025 ensemble (maintainer only) | Download from <https://projets.ip2i.in2p3.fr/cosmicflows/> |
| `d_mean_CF4pp.npy` | ~8 MB | Flat f32 128³ mean-density slice | `curl` from R2 (see below) — or extract from `.npz` |
| `v_mean_CF4pp.npy` | ~24 MB | Flat f32 (3,128,128,128) mean Cartesian velocity slice | `curl` from R2 (see below) — or extract from `.npz` |

The runtime artefact is `public/data/flowfield.scfd` (RGBA16F, ~4 MB),
produced from the two `.npy` slices via `npm run build-flow-field`. That
`.scfd` is also synced to R2 and is what the browser fetches at runtime.

License: CF-4 data is free for research and visualisation use; cite
Courtois et al. 2025 (A&A, arXiv:2502.01308) and Tully et al. 2023 (CF-4
catalog) in any derived work.

### npz keys

The pure-TS builder (`tools/flow/buildFlowField.ts`) packs two of the six
ensemble arrays:

| npz key | Array | Shape | Units | Role |
|---------|-------|-------|-------|------|
| `v_mean_CF4pp` | Cartesian peculiar velocity, posterior mean | `(3,128,128,128)` or `(128,128,128,3)` | km/s | RGB = (vx, vy, vz) |
| `d_mean_CF4pp` | Overdensity δ, posterior mean | `(128,128,128)` | dimensionless | A = δ (drives density-weighted seeding) |

The full ensemble holds **six** 128³ arrays — posterior **mean and std**
for density, Cartesian velocity, and radial velocity. The builder uses
only the two mean arrays above (the std cubes are the natural future input
for an uncertainty-aware overlay — a separate plan). The `.npz` is a plain
ZIP of `.npy` files, so listing its members
(`unzip -l CF4pp_mean_std_grids.npz`) shows the exact remaining key names.

### Box geometry & frame

128³ grid over a **1000 Mpc** cube (**physical** Mpc, not Mpc/h — the
spike's `boxMpcPerH` sidecar key is a misnomer) in **supergalactic
Cartesian** coordinates. The pure-TS builder transposes numpy C-order into
WebGPU's x-fastest memory layout and uses an observer-centred `origin`
(`-voxelSize · dims/2`), with `frameKind: 'supergalactic-cartesian'`, so
the flow cube co-registers with the galaxies by construction. The velocity
components ride along in native SG order (`v_mean_CF4pp` is SG-Cartesian,
aligned with the grid position axes — axis 0 = SGX); the memory transpose
relocates each vector without rotating its basis.

### Build

No Python required — pure Node/TS. The flow build needs **both** mean
slices (`v_mean` for the velocity RGB, `d_mean` for the δ alpha channel).

**Contributor path (no unzip):** both slices live on R2 — curl them:

```
curl -L -o data/raw/cf4/v_mean_CF4pp.npy \
  https://skymap-data.rulkens.com/data/raw/cf4/v_mean_CF4pp.npy
curl -L -o data/raw/cf4/d_mean_CF4pp.npy \
  https://skymap-data.rulkens.com/data/raw/cf4/d_mean_CF4pp.npy
npm run build-flow-field    # pure-TS → public/data/flowfield.scfd
```

**Maintainer path (run once per upstream release):**

1. Download the upstream archive:
   ```
   curl -L -o data/raw/cf4/CF4pp_mean_std_grids.npz \
     https://projets.ip2i.in2p3.fr/cosmicflows/CF4pp_mean_std_grids.npz
   ```
2. Extract the two needed arrays (no Python required — `.npz` is a plain
   ZIP archive of `.npy` files):
   ```
   unzip -j data/raw/cf4/CF4pp_mean_std_grids.npz \
     v_mean_CF4pp.npy d_mean_CF4pp.npy -d data/raw/cf4/
   ```
3. Build and sync:
   ```
   npm run build-flow-field   # produces public/data/flowfield.scfd
   npm run sync-r2            # uploads .npy (EXTRA_FILES) + .scfd (ALLOW)
   ```

The upstream `.npz` itself is **not** synced to R2 — contributors should
never need to handle the 167 MB ensemble. Only the two `.npy` slices
(~32 MB total) go up.

`flowfield.scfd` is a 128³ RGBA16F cube (vx, vy, vz, δ) in the v3
scalar-field format (`channels = 4`, `value_kind = 1`): the frame **and**
the velocity/δ stats live in the SCFD header, so it is a **single
self-describing file — no JSON sidecar**. Gitignored build artefact synced
to R2, not committed.

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
