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

| Data changed           | 1. Fetch                                                                                   | 2. Build                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| CF4 distances          | `fetch-cf4`                                                                                | `build-tiers` (`2mrs.bin`, `glade-*.bin`)                                      |
| Clusters/superclusters | `fetch-structures` (CDS VizieR, verifies `.sha256`)                                        | `build-structures` (after `build-tiers`) → `structures.*`                      |
| DESI                   | `fetch-desi` (four DR1 LSS `.fits`)                                                        | `build-tiers` (`desi-deep.bin`, the CrB deep cone)                             |
| Planet textures        | `fetch-textures` (~1.1 GB; `--dev` = 2k subset)                                            | `build-textures` → `public/data/images/textures/`                              |
| Earth surface tiles    | `fetch-textures` (the 8 BMNG quadrants, ~421 MB) + `fetch-eox` (populates `data/raw/eox/`) | `build-earth-tiles` → `earth-tiles/` (hours; `--dev` = z5, skips the EOX band) |

Raw files and built artefacts are gitignored; only provenance `README.md` + `.sha256` sidecars are committed. Full-res texture pull/build/sync runs post-merge from the main worktree.

Earth's whole-globe base texture and its surface tile pyramid are two publications of ONE Blue Marble month (a 21600×10800 equirect and eight 21600×21600 quadrants). The month is chosen in `tools/utils/io/bmngVintage.ts` and every registry path, upstream URL and attribution string reads it from there — because the tile layer falls back to the base outside its baked window, so a vintage split draws a seasonal seam along the tile frontier.

### MCPM Cosmic Web volume

The SDSS DR17 Cosmic Slime VAC cube ships as three tiered SCFDs (`mcpm-{small,medium,large}.scfd`). The Python + pyslime extract happens once per VAC release; contributors curl the pre-extracted `.npy` tiers from R2 and run `npm run build-mcpm` locally. The runtime fetches `mcpm-<tier>.scfd` per the tier dropdown (`state.sources.tier`). See `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`.

### Polyphorm volume exports (polyphorm-2mrs)

A locally-run Polyphorm (native MCPM app) export — `bin/export/<timestamp>/` with raw `trace.bin` (headerless f16, z-slowest/x-fastest) + `export_metadata.txt` — is converted by `tools/volumes/extractPolyphormExport.py <export-dir> <out-prefix>` into d8/d4/d2 `.npy` + `polyphy-trace` v1 sidecars under `data/raw/polyphorm/` (registry key `polyphorm.dir`, gitignored). Each tier is then imported with `npx tsx tools/volumes/buildRhizomeVolume.ts <npy> --out public/data/scalar-field/v3/polyphorm-2mrs-{small,medium,large}.scfd --clamp 0.2` (small=d8, medium=d4, large=d2, mirroring MCPM's tiering) followed by `npm run build-data-manifest`. `--clamp` zeroes packed voxels below the given f16 threshold (in the [0,1] log-normalised domain); 0.2 sits below the renderer's default-settings visibility deadband (contrast 1.7/trim 0.3 → 0.41) and shrinks the gzipped large tier from 194 MB to 2.3 MB by turning 99.1% of voxels into exact zeros, at no visible cost. Registered as source `polyphorm-2mrs` (`Source.Polyphorm2MRS`), tiered like MCPM, hidden by default. Current dataset: the 2026-08-13 2MRS run (34,974 galaxies, 4M agents, grid 1200×752×960, ~1.22 Mpc native voxels, equatorial-cartesian frame).

### MCPM workbench promotion (mcpm-workbench)

A durable, dedicated home for cubes promoted from the MCPM workbench dev tool (`tools/mcpm-workbench/`), separate from the one-off polyphorm-2mrs test field above. Operator steps: export a run in the workbench UI (writes a `polyphy-trace` v1 `.npy`+`.json` pair via `emitTraceSidecar.ts`, `provenance.producer: 'mcpm-workbench'`); move the pair into `data/raw/mcpm-workbench/` (registry key `mcpm-workbench.dir`, gitignored); run `npm run promote-mcpm-workbench -- --stem <stem>`, which validates the sidecar's provenance, imports it via the shared `buildRhizomeVolume()` to `public/data/scalar-field/v3/mcpm-workbench.scfd`, copies the sidecar to the committed pointer `data/seeds/mcpm_workbench_promoted.json` (registry key `mcpm-workbench.promoted` — mirrors the `famous.curated` precedent, so git history records exactly which run/params produced the live cube), and rebuilds the data manifest; then `npm run sync-r2-secure`. Registered as source `mcpm-workbench` (`Source.McpmWorkbench`), untiered (one cube per run, no d8/d4/d2 triple), **hidden** (`visible: false`) pending a promotion decision — no UI toggle ships with the registry row.

The workbench's trace-mass total sits a uniform ~9.28× below the reference SDSS DR17 Cosmic Slime VAC. A three-stage investigation eliminated every ported quirk flag, every structural cause (deposit scaling, step count, data-point weighting), and f16 trace accumulation as explanations, leaving a uniform scale difference pointing at the reference VAC's own provenance. Ruled a documented offset, not a workbench bug — see [`docs/research/mcpm-trace-mass-offset.md`](research/mcpm-trace-mass-offset.md) for the full elimination trail.

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

## Contributor: building the galaxy catalogs locally

`npm run fetch-data` (see the root README) pulls the deployed binaries directly and is the fastest path to real data. Everything below is for building those binaries yourself from raw catalog downloads — useful if you're changing a parser, adding a source, or want a build that isn't on R2 yet.

### 1. Download the raw catalogs

| Survey      | Source                                                                                                            | File / notes                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDSS        | [SkyServer SQL](https://skyserver.sdss.org/dr18/SearchTools/sql) or [CasJobs](https://skyserver.sdss.org/casjobs) | Run the query below; export as CSV to `data/raw/sdss/`.                                                                                                      |
| 2MRS        | [VizieR J/ApJS/199/26](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26)                        | `table3.dat`, 233-byte fixed-width, 44,599 rows, ~10 MB. Drop into `data/raw/2mrs/2mrs_table3.dat`.                                                          |
| GLADE       | [VizieR VII/281](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281)                                    | `glade2.3.dat`, 256-byte fixed-width, 3.26M rows, ~838 MB. Drop into `data/raw/glade/glade2.3.dat`.                                                          |
| Milliquas   | [quasars.org](https://quasars.org/milliquas.htm)                                                                  | `npm run fetch-milliquas` — pulls the 31 MB zip, verifies SHA-256, unpacks to `data/raw/milliquas/milliquas.txt`.                                            |
| Gaia DR3    | [ESA Gaia archive (TAP)](https://gea.esac.esa.int/archive/)                                                       | `npm run fetch-gaia` — pages the `G<14` main catalog + Bailer-Jones distances via ADQL into `data/raw/gaia/`. ~2 GB total; gated behind a size confirmation. |
| GCNS        | same TAP service                                                                                                  | Fetched automatically by `npm run fetch-gaia` — the 100 pc nearby-star supplement.                                                                           |
| Hipparcos-2 | [VizieR I/311](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=I/311)                                        | Fetched automatically by `npm run fetch-gaia` — `hip2.dat` (~33 MB) + Gaia cross-match.                                                                      |

GLADE alone subsumes 2MPZ and 6dFGS — the GLADE team has already cross-matched and deduplicated 2MPZ + 2MASS XSC + HyperLEDA + GWGC + SDSS-DR12Q, so a single download replaces what would otherwise be three.

#### SDSS query — and the 500,000-row trap

```sql
SELECT
  p.objID, p.ra, p.dec, s.z,
  p.modelMag_u, p.modelMag_g, p.modelMag_r, p.modelMag_i, p.modelMag_z,
  p.expAB_r, p.expPhi_r, p.deVAB_r, p.deVPhi_r, p.fracDeV_r,
  p.petroR50_r, p.petroR90_r
FROM SpecObj AS s
JOIN PhotoObjAll AS p ON s.bestObjID = p.objID
WHERE
  s.class = 'GALAXY'
  AND s.zWarning = 0
  AND s.z BETWEEN 0.001 AND 0.3
```

This query matches roughly 970k spectra. The interactive **SqlSearch** tool at the URL above silently caps output at 500,000 rows — no error, no warning — and the dropped rows follow plate/database order, which carves a survey-geometry-shaped hole out of the result (a real 2026-08 pull this way put a hole at Dec +14°..22° straight through the Coma-supercluster bridge). Two ways around it:

- **CasJobs** (linked above) has no row cap and a much larger result quota — run the same query there and export the full result.
- If you do use SqlSearch, split the query into plate-range batches (`AND p.field BETWEEN … AND …`, or similar) small enough to stay under 500k rows each, and concatenate the resulting CSVs before dropping the file into `data/raw/sdss/`.

Columns break down into three groups: **photometry** (`modelMag_u/g/r/i/z`, five colour bands, drives the colour ramp), **shape/orientation** (`expAB_r`, `expPhi_r`, `deVAB_r`, `deVPhi_r`, `fracDeV_r` — axis ratio and position angle from two profile fits, blended by `fracDeV_r`), and **size** (`petroR50_r`, `petroR90_r` — half-light and 90%-light radii in arcsec, converted to physical kpc using each galaxy's redshift).

### 2. Build the binary files

```bash
npm run build-all
```

With no flags, the builder auto-detects every input from `tools/utils/io/rawDataRegistry.ts`'s default paths — the newest `Skyserver_*.csv` under `data/raw/sdss/`, `data/raw/2mrs/2mrs_table3.dat`, `data/raw/glade/glade2.3.dat`, `data/raw/milliquas/milliquas.txt` — and skips whichever aren't present, so downloading just SDSS (or any subset) is a fine single-survey workflow. Override any input explicitly with `--sdss <path>`, `--twomrs <path>`, `--glade <path>`, `--milliquas <path>`, or redirect the output with `--out-dir <path>` (default `public/data`).

The tool parses each catalog, runs cross-match dedup using priority **SDSS > 2MRS > GLADE**, then writes v9 binary files under `public/data/galaxy-catalog/v9/` with content-hashed names (see the family/epoch layout above).

### 3. Optional: real galaxy orientations

2MRS and GLADE don't ship shape/orientation columns, so by default those galaxies render with deterministic-but-fake orientations (random per galaxy, stable across reloads). Two optional enrichment fetchers add real ones, picked up automatically by the next `npm run build-all`:

```bash
npm run fetch-2mass-xsc    # ~5 minutes; adds PA + axis-ratio for 2MRS galaxies
npm run fetch-hyperleda    # multi-hour; adds PA + axis-ratio for GLADE galaxies
```

`fetch-2mass-xsc` queries the 2MASS Extended Source Catalog and writes `data/raw/2mrs/2mass_xsc_pa.csv`. `fetch-hyperleda` queries HyperLEDA at 4 concurrent requests across the unique GLADE PGCs, writes `data/raw/hyperleda/hyperleda_pa.csv`, and is resumable if interrupted.

The pre-computed cache shipped from R2 is **deliberately partial** (roughly 52k of GLADE's ~1.5M unique PGCs, not a full crawl — see the `hyperleda.pa` entry in `rawDataRegistry.ts`), so don't treat an incomplete local run as broken, and don't auto-refetch it as a matter of routine. To use it instead of running the fetcher yourself:

```bash
mkdir -p data/raw/hyperleda
curl -L -o data/raw/hyperleda/hyperleda_pa.csv.gz \
  https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz
gunzip data/raw/hyperleda/hyperleda_pa.csv.gz
```

Both fetchers are entirely optional; the renderer works without them.

### 4. Famous galaxies (curated atlas)

A separate small catalog of well-known galaxies (Messier + NGC greatest-hits) ships alongside the survey data. Entries appear with their curated names in the InfoCard and are searchable via Cmd+K. Their thumbnails are pre-processed transparent WebPs — most hand-curated from press and astrophotography sources via the famous-galaxy curator (`npm run curate-famous`), with a Wikipedia → DESI Legacy auto-fetch fallback for the rest. Per-image credits and licences are recorded in `data/seeds/famous_curated_overrides.json` and summarised in [ATTRIBUTIONS.md](../ATTRIBUTIONS.md). Skip this section entirely if you only want the survey data — it works fine without the famous-galaxies bin.

Run order:

```bash
npm run build-all             # produces 2mrs.bin + glade.bin, needed for cross-match
npm run fetch-famous-images   # downloads + processes thumbnails (~30 s); idempotent, --force to re-fetch
npm run build-famous          # produces famous.bin + famous_galaxies_meta.json
```

To add more galaxies, edit `data/seeds/famous_galaxies.seed.json` — each entry needs `id` (URL-safe lower-case identifier), `names` (string array, first is the headline), `ra`/`dec` (degrees), `distanceMpc`, `diameterKpc`, `type` (free-form Hubble type), and `description` (1-3 sentence editorial blurb) — then re-run `npm run fetch-famous-images && npm run build-famous`.

### 5. Cosmic-web filaments (DisPerSE)

The filament skeleton is computed offline by [DisPerSE](https://disperse.readthedocs.io/) (Sousbie 2011), which extracts the persistent ridges of the Delaunay-tessellation density field. The default build runs `delaunay_3D → mse → skelconv` with a 5σ persistence cut and 2 smoothing passes, against the **2MRS + GLADE** subset of the catalogue — SDSS is excluded by default because its wedge footprint dominates the density field at the survey edges and DisPerSE locks onto those boundaries instead of the actual cosmic web (confirmed empirically via an SDSS-only diagnostic build, `--sources sdss`).

```bash
# Install DisPerSE following its upstream instructions; ensure
# delaunay_3D, mse, and skelconv are on $PATH.
npm run build-all          # so the .bin catalogues exist first
npm run build-filaments    # writes public/data/filament/v1/filaments.bin
```

CLI flags: `--cut N` (persistence sigma, default 5), `--smooth N` (skelconv smoothing passes, default 2), `--sources csv` (subset of `sdss,2mrs,glade`, default `2mrs,glade`), `--output path` (write elsewhere so diagnostic builds don't clobber the canonical file). Skip this step entirely if you don't want filaments — the renderer treats a missing `filaments.bin` as optional and silently no-ops the toggle.

The filament skeleton is shared across all three dataset tiers (small/medium/large), unlike the per-tier galaxy `.bin`s — the cosmic web extends well beyond what the small tier's decimated point sample shows, and drawing the full structure there is more informative than a tier-matched skeleton would be.

### 6. Milky Way star field (Gaia DR3)

```bash
npm run build-stars
```

Consumes `data/raw/gaia/` — the paged Gaia DR3 CSVs, the GCNS 100 pc supplement, and the Hipparcos-2 bright-star patch — and emits the per-tier binaries under `public/data/star-catalog/v1/`. The full build holds the ~16.8M-row Gaia superset in memory at once, so run it on a machine with roughly 16 GB of free RAM (the npm script raises Node's heap limit accordingly).

For real-scale runs the canonical builder is the Rust port `tools/stars-rs/`, invoked with `npm run build-stars-rs` (requires a Rust toolchain). It emits byte-identical `.bin` files far faster and with a lower memory ceiling; the TypeScript `buildStars.ts` stays the reference implementation the Vitest suite covers. See `tools/stars-rs/README.md` for the bit-parity contract.

### Cosmic-web volumes (CF-4 + MCPM)

Both volumes' contributor and maintainer flows — including the R2 curl shortcuts — live in their own directory READMEs: [`data/raw/cf4/README.md`](../data/raw/cf4/README.md) and [`data/raw/mcpm/README.md`](../data/raw/mcpm/README.md). See also the "MCPM Cosmic Web volume" and "Polyphorm volume exports" sections above.
