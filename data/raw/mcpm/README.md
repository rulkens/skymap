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

```bash
# 1. Install Python deps (one-time)
pip install pyslime numpy scikit-image

# 2. Download the upstream blob (~345 MB)
mkdir -p data/raw/mcpm
curl -L -o data/raw/mcpm/trace.bin.bz2 \
  https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/trace.bin.bz2

# 3. Extract + downsample
python tools/extractMcpmCube.py

# 4. Upload .npy tiers to R2 (idempotent; sync also picks up the .scfd build outputs)
npm run build-mcpm
npm run sync-r2
```

## Format references

- VAC landing page: https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold
- pyslime: https://github.com/jnburchett/pyslime
- Design spec: `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`
