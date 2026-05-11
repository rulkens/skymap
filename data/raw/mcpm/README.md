# `data/raw/mcpm/` — MCPM Cosmic Web ingest

Three downsampled `.npy` tiers of the SDSS DR17 Cosmic Slime VAC
`SDSS_z_44-476mpc` cube (Wilde et al. 2023). Used by
`tools/buildMcpmVolume.ts` to emit `public/data/mcpm-{small,medium,large}.scfd`.

This directory is gitignored. Contributors download the pre-extracted
`.npy` files from R2; only the maintainer runs the extractor.

## Contributor (every full data rebuild)

```bash
mkdir -p data/raw/mcpm
for f in mcpm_sdss_d8.npy mcpm_sdss_d4.npy mcpm_sdss_d2.npy; do
  curl -L -o "data/raw/mcpm/$f" "https://skymap-data.rulkens.com/data/raw/mcpm/$f"
done
npm run build-mcpm
```

## Maintainer (once per VAC release)

We isolate the Python toolchain in a project-local venv so the maintainer
flow doesn't pollute the system Python or conda base environment.  The
venv lives at `.venv/` at the repo root and is gitignored — recreate it
by re-running step 1 on a fresh checkout.

```bash
# 1. One-time: create the venv and install deps (~150 MB incl. scipy)
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install pyslime numpy scikit-image astropy
# astropy is a transitive dep of pyslime that pyslime forgets to declare

# 2. Download the upstream blob (~345 MB)
mkdir -p data/raw/mcpm
curl -L -o data/raw/mcpm/trace.bin.bz2 \
  https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/trace.bin.bz2

# 3. Extract + downsample (peak RAM ≈ 10 GB for the 712×1200×728 f32 cube)
.venv/bin/python tools/extractMcpmCube.py

# 4. Build the .scfd files locally
npm run build-mcpm

# 5. Upload .npy tiers + .scfd outputs to R2 (idempotent)
npm run sync-r2
```

### Why a project-local venv (not conda, not system pip)

Conda's solver pulls a heavy scientific stack on every change to a single
package; a fresh venv is the lightest possible isolation.  Putting it at
the repo root (rather than under `data/raw/mcpm/.venv`) means the
relative path from the project root works in every shell snippet without
extra `cd`-ing, and matches the convention you'll find in the other
data-pipeline scripts when they grow Python helpers.

## Format references

- VAC landing page: https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold
- pyslime: https://github.com/jnburchett/pyslime
- Design spec: `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`
