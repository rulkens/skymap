# Skymap — data pipeline & catalogs

Read this before touching `tools/` parsers, catalog builders, or fetchers, or anything under `data/`.

## Data pipeline (mental model)

```
data/raw/*  ─parsers─▶ ParsedRecord[] ─crossMatch─▶ GalaxyCatalog ─encode─▶ public/data/*.bin
  ─fetch─▶ decodeGalaxyCatalog ─▶ GPU vertex/index buffers ─galaxyPointRenderer─▶ WGSL ─▶ canvas
```

Binary format is in `src/data/galaxyCatalog/galaxyCatalogFormat.ts` — currently v9, 64 bytes/galaxy. Bumping the version means regenerating bins via `npm run build-all`; the `magic + version + count` header makes old bins fail loudly. (The PointCloud → GalaxyCatalog code rename did NOT bump the on-disk format.)

### Data layout: family/epoch folders

`public/data/` holds one folder per binary family, named after its format
module, with that family's **current** format version as an epoch segment —
a bumped family moves to a new folder, so a stale browser/CDN cache can
never pair mismatched code and bytes:

| folder                  | files                                                                              | format module (version)         |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------------------- |
| `galaxy-catalog/v9/`    | `sdss-*`, `2mrs`, `glade-*`, `milliquas-*`, `desi-*`, `famous` `.bin`              | `galaxyCatalogFormat.ts` (9)    |
| `star-catalog/v1/`      | `stars-{small,medium,large}.bin`                                                   | `starCatalogFormat.ts` (1)      |
| `structure-catalog/v1/` | `structures`/`clusters` `.ccat` + their `*_meta.json` (fetched as a pair)          | `structureCatalogFormat.ts` (1) |
| `scalar-field/v3/`      | `cf4_density`, `flowfield`, `mcpm-*`, `polyphorm-2mrs-*`, `mcpm-workbench` `.scfd` | `scalarFieldFormat.ts` (3)      |
| `filament/v1/`          | `filaments{,-sdss,-small}.bin`                                                     | `filamentBinaryFormat.ts` (1)   |

Some family-folder residents are deliberately untracked and stay at their
logical name forever — `allowDataFile` (`tools/deploy/r2/allowDataFile.ts`)
is the allow-list, and this boundary _is_ the drift guard's condition 3
(a tracked file still under its logical name means a builder skipped
`build-data-manifest`; an untracked one is just never supposed to be
hashed). In `galaxy-catalog/v9/`: `sdss.bin`/`glade.bin` are pre-tier
DisPerSE inputs, not runtime tiers. In `filament/v1/`: `filaments-sdss.bin`
is the matching pre-tier input. `clusters.ccat`/`clusters_meta.json` (superseded
by `structures.ccat`/`structures_meta.json`) are outside `allowDataFile`
entirely and are dead files (see the BACKLOG item), not a family resident.

Loose JSON (`famous_*_meta`, `constellations`, `pgc_aliases`) and `images/`
stay at the root — no version gate, schemas evolve compatibly. "Stay at the
root" is about the version gate only: the JSON still gets a content hash
(next section), `images/` does not. The rule: the folder name is the
family's format-module `VERSION`, exported as that module's epoch-prefix
constant — never hand-typed at a call site.

### Content hash + manifest

`public/data/` holds hashed filenames in every environment (dev included):
every tracked file — the five family folders above, plus the root JSON —
carries the first 8 hex characters of its SHA-256 content hash before its
extension (`sdss-large.a3f19c2e.bin`), and the build emits
`public/data/manifest.json`
mapping logical path → hashed path. The manifest is written **last**, after
every file it names, so a reload can never see a mixed-generation pairing
(a stale `famous_galaxies_meta.json` against a fresh `famous.bin`). Boot
fetches the manifest once with `no-cache` before any data load; `dataUrl()`
resolves every logical name through it. `images/` is excluded — unhashed,
path-stable. The tracked set is exactly `allowDataFile`'s: a file absent
from it is never hashed, never manifested, never uploaded. Every build
script ends with `npm run build-data-manifest` — a hand-run `tsx tools/…`
invocation must be followed by that pass, or `sync-r2` refuses to run
against an incomplete manifest.

### Local-volume distance override

Inside `CUTOFF_MPC = 30` the pipeline replaces the cz-derived position with a Cosmicflows-4 (or HyperLEDA `mod0`) measured distance; the catalogued spectroscopic z is stored separately on the .bin (v9, byte 56) so the InfoCard shows the published value. See `docs/superpowers/specs/2026-05-27-local-volume-distances.md`. Coverage: ~2,030 of CF4's 2,159 PGCs via GLADE-by-PGC; 2MRS rows get CF4 distances via the `2MASX → PGC` patching step in `buildAllBins`; famous/SDSS rows without PGCs fall through to the cz path.

### Data-refresh re-run orders

All refreshes share one 3-step shape: fetch, build, then `npm run sync-r2-secure` from the **main worktree only** (memory `project_worktree_data_isolation`). The sync step is the deploy path — see [docs/DEPLOY.md](DEPLOY.md).

| Data changed           | 1. Fetch                                            | 2. Build                                                   |
| ---------------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| CF4 distances          | `fetch-cf4`                                         | `build-tiers` (`2mrs.bin`, `glade-*.bin`)                  |
| Clusters/superclusters | `fetch-structures` (CDS VizieR, verifies `.sha256`) | `build-structures` (after `build-tiers`) → `structures.*`  |
| DESI                   | `fetch-desi` (four DR1 LSS `.fits`)                 | `build-tiers` (`desi-deep.bin`, the CrB deep cone)         |
| Planet textures        | `fetch-textures` (~1.1 GB; `--dev` = 2k subset)     | `build-textures` → `public/data/images/textures/`          |
| Earth surface tiles    | `fetch-textures` (the 8 BMNG quadrants, ~421 MB) + `fetch-eox` (populates `data/raw/eox/`) | `build-earth-tiles` → `earth-tiles/` (hours; `--dev` = z5, skips the EOX band) |

Raw files and built artefacts are gitignored; only provenance `README.md` + `.sha256` sidecars are committed. Full-res texture pull/build/sync runs post-merge from the main worktree.

Earth's whole-globe base texture and its surface tile pyramid are two publications of ONE Blue Marble month (a 21600×10800 equirect and eight 21600×21600 quadrants). The month is chosen in `tools/utils/io/bmngVintage.ts` and every registry path, upstream URL and attribution string reads it from there — because the tile layer falls back to the base outside its baked window, so a vintage split draws a seasonal seam along the tile frontier.

### MCPM Cosmic Web volume

The SDSS DR17 Cosmic Slime VAC cube ships as three tiered SCFDs (`mcpm-{small,medium,large}.scfd`). The Python + pyslime extract happens once per VAC release; contributors curl the pre-extracted `.npy` tiers from R2 and run `npm run build-mcpm` locally. The runtime fetches `mcpm-<tier>.scfd` per the tier dropdown (`state.sources.tier`). See `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`.

### Polyphorm volume exports (polyphorm-2mrs)

A locally-run Polyphorm (native MCPM app) export — `bin/export/<timestamp>/` with raw `trace.bin` (headerless f16, z-slowest/x-fastest) + `export_metadata.txt` — is converted by `tools/volumes/extractPolyphormExport.py <export-dir> <out-prefix>` into d8/d4/d2 `.npy` + `polyphy-trace` v1 sidecars under `data/raw/polyphorm/` (registry key `polyphorm.dir`, gitignored). Each tier is then imported with `npx tsx tools/volumes/buildRhizomeVolume.ts <npy> --out public/data/scalar-field/v3/polyphorm-2mrs-{small,medium,large}.scfd --clamp 0.2` (small=d8, medium=d4, large=d2, mirroring MCPM's tiering) followed by `npm run build-data-manifest`. `--clamp` zeroes packed voxels below the given f16 threshold (in the [0,1] log-normalised domain); 0.2 sits below the renderer's default-settings visibility deadband (contrast 1.7/trim 0.3 → 0.41) and shrinks the gzipped large tier from 194 MB to 2.3 MB by turning 99.1% of voxels into exact zeros, at no visible cost. Registered as source `polyphorm-2mrs` (`Source.Polyphorm2MRS`), tiered like MCPM, hidden by default. Current dataset: the 2026-08-13 2MRS run (34,974 galaxies, 4M agents, grid 1200×752×960, ~1.22 Mpc native voxels, equatorial-cartesian frame).

### MCPM workbench promotion (mcpm-workbench)

A durable, dedicated home for cubes promoted from the MCPM workbench dev tool (`tools/mcpm-workbench/`), separate from the one-off polyphorm-2mrs test field above. Operator steps: export a run in the workbench UI (writes a `polyphy-trace` v1 `.npy`+`.json` pair via `emitTraceSidecar.ts`, `provenance.producer: 'mcpm-workbench'`); move the pair into `data/raw/mcpm-workbench/` (registry key `mcpm-workbench.dir`, gitignored); run `npm run promote-mcpm-workbench -- --stem <stem>`, which validates the sidecar's provenance, imports it via the shared `buildRhizomeVolume()` to `public/data/scalar-field/v3/mcpm-workbench.scfd`, copies the sidecar to the committed pointer `data/seeds/mcpm_workbench_promoted.json` (registry key `mcpm-workbench.promoted` — mirrors the `famous.curated` precedent, so git history records exactly which run/params produced the live cube), and rebuilds the data manifest; then `npm run sync-r2-secure`. Registered as source `mcpm-workbench` (`Source.McpmWorkbench`), untiered (one cube per run, no d8/d4/d2 triple), **hidden** (`visible: false`) until Phase 4 validation clears — no UI toggle ships with the registry row.

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
