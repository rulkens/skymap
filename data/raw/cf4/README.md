# CF-4 raw data — DM density cube

This directory stores intermediate artefacts for the Valade et al. 2024 "HAMLET"
256³ CF-4 DM density reconstruction. None of these files are committed to git
(see `.gitignore`); the small ones live on R2 and are pulled by `curl`, the
large ones are regenerable from the upstream `.sav`.

## Files

| File | Size | Purpose | How to obtain |
|------|------|---------|---------------|
| `CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav` | ~64 MB | Upstream IDL .sav (maintainer only) | Download from <https://projets.ip2i.in2p3.fr/cosmicflows/> (Valade 2024 release) |
| `cf4_density_256.npy` | ~64 MB | Flat f32 cube produced by the Python ingest | `curl` from R2 (see below) — or regenerate from .sav |
| `cf4_density_256.meta.json` | <1 KB | Cosmology + provenance sidecar | `curl` from R2 (see below) — or regenerate from .sav |

The runtime artefact is `public/data/cf4_density.scfd` (~32 MB f16), produced
from the `.npy` via `npm run build-cf4-density`. That `.scfd` is also synced
to R2 and is what the browser fetches at runtime.

License: CF-4 data is free for research and visualisation use; cite Valade et
al. 2024 (Nature Astronomy) and Tully et al. 2023 (CF-4 catalog) in any
derived work.

## `.sav` variable name

The variable name inside the IDL `.sav` is undocumented in Valade 2024.
**Maintainer pre-flight:** download the `.sav` once and run

```
python -c "import scipy.io; print(list(scipy.io.readsav('CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav').keys()))"
```

Record the discovered key here for future maintainers, then hard-code it
into `tools/cf4DensityIngest.py`'s `SAV_VARIABLE_NAME` constant.

**Discovered variable name:** `<TODO: maintainer fills in after first run>`

## Contributor path (no Python required)

Pull the pre-built intermediates from R2:

```
curl -L -o data/raw/cf4/cf4_density_256.npy \
  https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.npy
curl -L -o data/raw/cf4/cf4_density_256.meta.json \
  https://skymap-data.rulkens.com/data/raw/cf4/cf4_density_256.meta.json
```

Then build the runtime `.scfd`:

```
npm run build-cf4-density
```

This reads the `.npy`, converts f32 → f16, builds the SG→equatorial rotation,
and writes `public/data/cf4_density.scfd` (~32 MB) — pure Node/TS, no Python.

If you don't even need to rebuild the `.scfd` (because you're not modifying
the format or the build pipeline), just curl the `.scfd` itself:

```
curl -L -o public/data/cf4_density.scfd \
  https://skymap-data.rulkens.com/data/cf4_density.scfd
```

## Maintainer path (Python required, run once per upstream release)

1. Download the `.sav` from the URL above.
2. Set up a venv with `scipy`:
   ```
   python -m venv .venv-cf4 && source .venv-cf4/bin/activate && pip install scipy numpy
   ```
3. Run the ingest:
   ```
   python tools/cf4DensityIngest.py
   ```
   Produces `cf4_density_256.npy` and `cf4_density_256.meta.json` in this directory.
4. Sync to R2:
   ```
   npm run sync-r2
   ```
   Uploads the `.npy` + `.meta.json` (EXTRA_FILES) and any rebuilt `.scfd` (ALLOW).
