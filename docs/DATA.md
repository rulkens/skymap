# Skymap — data pipeline & catalogs

Read this before touching `tools/` parsers, catalog builders, or fetchers, or anything under `data/`.

## Data pipeline (mental model)

```
data/raw/*  ─parsers─▶ ParsedRecord[] ─crossMatch─▶ GalaxyCatalog ─encode─▶ public/data/*.bin
  ─fetch─▶ decodeGalaxyCatalog ─▶ GPU vertex/index buffers ─pointRenderer─▶ WGSL ─▶ canvas
```

Binary format is in `src/data/galaxyCatalogFormat.ts` — currently v6, 64 bytes/galaxy. Bumping the version means regenerating bins via `npm run build-all`; the `magic + version + count` header makes old bins fail loudly. (The PointCloud → GalaxyCatalog code rename did NOT bump the on-disk format.)

### Local-volume distance override

Inside `CUTOFF_MPC = 30` the pipeline replaces the cz-derived position with a Cosmicflows-4 (or HyperLEDA `mod0`) measured distance; the catalogued spectroscopic z is stored separately on the .bin (v6, byte 54) so the InfoCard shows the published value. See `docs/superpowers/specs/2026-05-27-local-volume-distances.md`. Coverage: ~2,030 of CF4's 2,159 PGCs via GLADE-by-PGC; 2MRS rows get CF4 distances via the `2MASX → PGC` patching step in `buildAllBins`; famous/SDSS rows without PGCs fall through to the cz path.

### Data-refresh re-run orders

All refreshes share one 3-step shape: fetch, build, then `npm run sync-r2-secure` from the **main worktree only** (memory `project_worktree_data_isolation`). The sync step is the deploy path — see [docs/DEPLOY.md](DEPLOY.md).

| Data changed           | 1. Fetch                                            | 2. Build                                                   |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| CF4 distances          | `fetch-cf4`                                         | `build-tiers` (`2mrs.bin`, `glade-*.bin`)                  |
| Clusters/superclusters | `fetch-structures` (CDS VizieR, verifies `.sha256`) | `build-structures` (after `build-tiers`) → `structures.*`  |
| DESI                   | `fetch-desi` (four DR1 LSS `.fits`)                 | `build-tiers` (`desi-deep.bin`, the CrB deep cone)         |
| Planet textures        | `fetch-textures` (~1.1 GB; `--dev` = 2k subset)     | `build-textures` → `public/data/images/textures/`          |
| Earth surface tiles    | `fetch-textures` (the 8 BMNG quadrants, ~421 MB)    | `build-earth-tiles` → `earth-tiles/` (hours; `--dev` = z5) |

Raw files and built artefacts are gitignored; only provenance `README.md` + `.sha256` sidecars are committed. Full-res texture pull/build/sync runs post-merge from the main worktree.

Earth's whole-globe base texture and its surface tile pyramid are two publications of ONE Blue Marble month (a 21600×10800 equirect and eight 21600×21600 quadrants). The month is chosen in `tools/utils/io/bmngVintage.ts` and every registry path, upstream URL and attribution string reads it from there — because the tile layer falls back to the base outside its baked window, so a vintage split draws a seasonal seam along the tile frontier.

### MCPM Cosmic Web volume

The SDSS DR17 Cosmic Slime VAC cube ships as three tiered SCFDs (`mcpm-{small,medium,large}.scfd`). The Python + pyslime extract happens once per VAC release; contributors curl the pre-extracted `.npy` tiers from R2 and run `npm run build-mcpm` locally. The runtime fetches `mcpm-<tier>.scfd` per the tier dropdown (`state.sources.tier`). See `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`.

## Catalog gotchas

- **2MRS** (Huchra 2012) has only near-IR (J/H/K) photometry — we map J→magG, H→magR, K→magI to fit the SDSS-shaped slot. Local Group galaxies have _negative_ cz; do **not** filter `cz > 0`.
- **GLADE v2.3** has no orientation columns. PGC numbers in col 1-7 are the cross-match key into HyperLEDA.
- **2MRS** has `b/a` but no PA. The 2MASS XSC (the underlying source) has `sup_phi` — cross-match by 2MASS ID.
- **SDSS** CSV column set is whatever was in the SkyServer SQL query — check the CSV header before assuming a column exists.
- **2MRS `objID` in the .bin IS the PGC number** (patched in `buildAllBins` from the GLADE 2MASX→PGC crosswalk); `objID = 0` means no PGC. A synthesized `2MASX J<RA><Dec>` InfoCard name that is absent from `2mrs_table3.dat` is wrong-place coordinates dressed up as an ID.
- **Blueshifted rows without a measured distance** are placed in their TRUE direction at `|cz|/H0` via the curated `data/seeds/local_volume_distances.seed.json` (registry key `localvolume.distances`). Never let negative-z rows mirror to the antipode.

Always consult the upstream ReadMes (alongside each catalog, e.g. `data/raw/2mrs/J_ApJS_199_26_ReadMe`, `data/raw/glade/VII_281_ReadMe`) for byte offsets when extending parsers. Every raw-data path goes through `tools/utils/io/rawDataRegistry.ts` — `rawDataPath('<key>')`, never hard-coded paths.

## Adding a new raw data source

1. **Per-catalog subdir** under `data/raw/<catalog>/` (lowercase, single word). No loose files at `data/raw/` root.
2. **Register every file** in `tools/utils/io/rawDataRegistry.ts`. Keys are dotted-lowercase `<catalog>.<artifact>` (e.g. `'cf4.table2'`); dynamically-named outputs register the directory as `<catalog>.dir` and consumers `join()` the rest. Fill in `source: 'committed' | 'gitignored'`, a one-line `description`, optional `upstream` URL + `fetcher`.
3. **Consume via the registry**: `rawDataPath('<catalog>.<artifact>')`, never `resolve('data/raw/...')`. For a relative path (e.g. `wrangler --file`), use `RAW_DATA['<key>'].path`.
4. **`.gitignore` exception** only for a _non-standard_ committed file. The `/data/**` block already re-includes `data/raw/**/README.md`, `data/raw/**/*.sha256`, `data/raw/fonts/*.ttf`, and `data/seeds/*.json`, so a new catalog's README + checksum sidecar track with a plain `git add`. Add a `!` line (with a comment) only for a file none of those cover.
5. **Provenance README** at `data/raw/<catalog>/README.md`: upstream URL, columns / byte layout, fetch date, checksum.

Reference fetchers: `tools/fetch/fetchHyperLeda.ts`, `tools/fetch/fetch2massXsc.ts` (both registry-migrated).
