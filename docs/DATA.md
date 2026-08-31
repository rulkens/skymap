# Skymap: data pipeline & catalogs

Read this before touching `tools/` parsers, catalog builders, fetchers, or anything under `data/`.

## Pipeline model

Raw catalog dumps under `data/raw/*` go through source-specific parsers in `tools/parsers/`, get cross-matched and deduplicated, and land in five binary formats under `public/data/`. The browser fetches a manifest at boot, resolves each logical filename to its content-hashed path, and streams the bytes into typed-array decoders that feed GPU buffers directly:

```
data/raw/*  ──parsers──▶  ParsedRecord[]  ──cross-match──▶  GalaxyCatalog  ──encode──▶  public/data/*.bin
                                                                                              │
                                                                                       manifest.json
                                                                                              │
                                                                                    R2 / static host
                                                                                              │
browser: fetch manifest ──▶ dataUrl() ──▶ decode*() ──▶ GPU vertex/index buffers ──▶ WGSL ──▶ canvas
```

Most sources also have a per-directory README under `data/raw/<source>/` with the byte-level provenance (upstream URL, licence, checksum, ReadMe). Where one exists this doc links it rather than repeating it.

## Binary formats

Five formats, each a magic + version header followed by fixed- or variable-size records. A version bump makes the decoder reject old files loudly with a "regenerate" error rather than misread stale bytes; the fix is always to re-run the matching build command.

| Format | Magic        | Version | Contents                                                                                                                                                          | Authority                                                                      |
| ------ | ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| SKMP   | `0x504D4B53` | 9       | Galaxy point cloud: position, photometry, shape, stellar mass. 16-byte header + 64 bytes/galaxy.                                                                  | [`galaxyCatalogFormat.ts`](../src/data/galaxyCatalog/galaxyCatalogFormat.ts)   |
| SKST   | `0x54534B53` | 1       | Stars in a spatial octree, cell-quantized to 6-byte records; interior nodes carry flux-weighted aggregates as a built-in LOD mip. 64-byte header + 16 bytes/node. | [`starCatalogFormat.ts`](../src/data/starCatalog/starCatalogFormat.ts)         |
| CCAT   | `0x54414343` | 1       | Featured structures (clusters, superclusters). 16-byte header + 28 bytes/record.                                                                                  | [`structureCatalogFormat.ts`](../src/data/structure/structureCatalogFormat.ts) |
| SCFD   | `0x44464353` | 3       | Self-describing scalar or vector field cube (density volumes, the CF4++ flow field). 96-byte header + f16 voxel array.                                            | [`scalarFieldFormat.ts`](../src/data/volume/scalarFieldFormat.ts)              |
| FILA   | `0x414C4946` | 1       | DisPerSE filament skeleton as variable-length polyline strips. 16-byte header + strip-offset table + vertex array.                                                | [`filamentBinaryFormat.ts`](../src/data/filament/filamentBinaryFormat.ts)      |

## `public/data/` layout

Each format has its own `<family>/v<N>/` folder, where `N` is that format's current version. A version bump moves the family to a new folder so a CDN can never serve a stale `.bin` alongside code that expects the new layout (`max-age=86400` on these responses would otherwise pair mismatched bytes and code for up to a day):

- `galaxy-catalog/v9/`: `sdss-*`, `2mrs`, `glade-*`, `milliquas-*`, `desi-{deep,wedge,sgw}`, `famous` `.bin`
- `star-catalog/v1/`: `stars-{small,medium,large}.bin`
- `structure-catalog/v1/`: `structures.ccat` + `structures_meta.json`
- `scalar-field/v3/`: `cf4_density`, `flowfield`, `mcpm-*`, `polyphorm-2mrs-*`, `edenhofer-dust-*`, `mcpm-workbench` `.scfd`
- `filament/v1/`: `filaments{,-small}.bin`

Loose JSON (`famous_galaxies_meta`, `famous_stars_meta`, `structures_meta`, `constellations`, `pgc_aliases`) and `images/` stay at the data root: no version gate, since their schemas evolve compatibly and `images/` is unhashed and path-stable.

[`allowDataFile`](../tools/deploy/r2/allowDataFile.ts) is the allow-list of exactly which files under `public/data/` are tracked, hashed, manifested, and synced to R2 (matched by basename so it survives the family/epoch nesting). A few files live in these folders without being tracked: in `galaxy-catalog/v9/`, `sdss.bin` and `glade.bin` are pre-tier inputs to DisPerSE, not runtime tiers; in `filament/v1/`, `filaments-sdss.bin` is the matching diagnostic input. A `.scfd` can also exist on disk with no `allowDataFile` entry at all and no `SOURCE_REGISTRY` row, when a data pipeline ships ahead of its renderer wiring (the Edenhofer dust volume is the live example). That is fine as long as the file stays untracked until the wiring lands.

### Content hash + manifest

Every tracked file carries the first 8 hex characters of its SHA-256 content hash before its extension (`sdss-large.a3f19c2e.bin`), and `npm run build-data-manifest` writes `public/data/manifest.json` mapping logical path to hashed path. The pass is idempotent (re-running over unchanged bytes touches nothing), and it skips a `public/data/` that's a symlink: the `/link-data` case, where a linked tree belongs to the checkout that built it, and hash-renaming through the link would corrupt it out from under that checkout. Every build script that touches `public/data/` ends with `build-data-manifest`; a hand-run `tsx tools/…` invocation needs the same follow-up.

The manifest is written last, after every file it names, so a page load can never see a mixed-generation pairing (a stale `famous_galaxies_meta.json` against a fresh `famous.bin`).

## Runtime loading

Boot fetches `<dataBaseUrl>/data/manifest.json` once with `cache: 'no-cache'` ([`dataManifest.ts`](../src/services/loading/dataManifest.ts)); every subsequent [`dataUrl(filename)`](../src/services/loading/fetchWithProgress.ts) call resolves the logical name through it, falling back to the identity path when the manifest doesn't name it (an unbuilt worktree, or the unhashed `images/` tree). [`dataBaseUrl()`](../src/utils/network/dataBaseUrl.ts) is empty in dev (Vite serves `public/data/*` at `/data/*`) and points at the R2 custom domain in production. See [docs/DEPLOY.md](DEPLOY.md) for how that env var is set.

Galaxy catalogs ship in three [`Tier`](../src/@types/data/Tier.d.ts) presets the user can hot-swap at runtime: `small` (~300k galaxies, mobile), `medium` (~600k, desktop default), `large` (~2.5M, opt-in full catalog). Per-source caps live on each entry's `tierTargets` in [`src/data/sources.ts`](../src/data/sources.ts) / `src/data/sources/*.ts`; [`tierTargets.ts`](../src/data/tierTargets.ts) is the single place both the fetcher and the builder read for the (source, tier) → filename mapping, so the URL and the on-disk layout can't drift apart.

For a fresh checkout, `npm run fetch-data` pulls the deployed `manifest.json` and everything it currently names (by default skipping hidden/unwired scalar-field volumes; `--volumes all` includes them, `--dry-run` lists the selection without downloading). It is the fastest path to real data. Everything from here on is for building the binaries yourself from raw catalog downloads, needed if you're changing a parser, adding a source, or want a build that isn't on R2 yet.

## Galaxy catalogs

Three real all-sky-ish surveys plus two supplementary point sets share the SKMP format. [`buildAllBins.ts`](../tools/catalog/buildAllBins.ts) parses each, runs [`crossMatch`](../tools/catalog/crossMatch.ts) with priority **SDSS > 2MRS > GLADE > DESI patches** (GLADE is itself a pre-merged compilation of 2MPZ + 2MASS XSC + HyperLEDA + GWGC + SDSS-DR12Q, so it only needs deduping against SDSS and 2MRS, not its own constituents), then writes one `.bin` per source per tier.

| Source     | Fetch                                                                                                                                     | Notes                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SDSS       | manual SkyServer/CasJobs SQL export → `data/raw/sdss/`                                                                                    | see the SQL trap below                                                                                                                                                               |
| 2MRS       | [VizieR J/ApJS/199/26](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26) `table3.dat` → `data/raw/2mrs/2mrs_table3.dat` | fixed-width, byte offsets in the VizieR ReadMe beside it                                                                                                                             |
| GLADE v2.3 | [VizieR VII/281](https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281) `glade2.3.dat` → `data/raw/glade/glade2.3.dat`             | fixed-width, ~800 MB, streamed rather than read whole (V8's ~512 MB string cap)                                                                                                      |
| Milliquas  | `npm run fetch-milliquas`                                                                                                                 | AGN/quasar compilation, bypasses cross-match (see gotchas)                                                                                                                           |
| DESI DR1   | `npm run fetch-desi` (four LSS `.fits` tracers) → [`data/raw/desi/README.md`](../data/raw/desi/README.md)                                 | three drill geometries (deep cone, dec-band wedge, Sloan Great Wall ellipsoid) defined in [`desiPatches.ts`](../tools/catalog/desiPatches.ts), each emitting its own untiered `.bin` |

Build everything with:

```bash
npm run build-all
```

With no flags it auto-detects the newest `Skyserver_*.csv` under `data/raw/sdss/` by mtime, plus the stable 2MRS/GLADE/Milliquas filenames, and silently skips whichever inputs aren't present, so downloading just one survey is a fine workflow. Override any input with `--sdss`, `--twomrs`, `--glade`, `--milliquas`, or `--out-dir`; `--glade-spec-only` drops GLADE's photo-z rows, `--glade-isotropic` drops SDSS-DR12-only GLADE rows (both optional, see [`buildAllBins.ts`](../tools/catalog/buildAllBins.ts) for the full flag set).

### The SQL 500,000-row trap

```sql
SELECT
  p.objID, p.ra, p.dec, s.z,
  p.modelMag_u, p.modelMag_g, p.modelMag_r, p.modelMag_i, p.modelMag_z,
  p.expAB_r, p.expPhi_r, p.deVAB_r, p.deVPhi_r, p.fracDeV_r,
  p.petroR50_r, p.petroR90_r
FROM SpecObj AS s
JOIN PhotoObjAll AS p ON s.bestObjID = p.objID
WHERE s.class = 'GALAXY' AND s.zWarning = 0 AND s.z BETWEEN 0.001 AND 0.3
```

This matches roughly 970,000 spectra. The interactive SkyServer **SqlSearch** tool silently caps output at 500,000 rows with no error, and the dropped rows follow plate/database order. A real pull this way carved a survey-geometry-shaped hole straight through the Coma-supercluster bridge (declination +14°..22°). Use **CasJobs** instead (no row cap), or split the query into plate-range batches and concatenate the CSVs.

### Optional: real galaxy orientations

2MRS and GLADE ship no PA/axis-ratio columns, so by default those galaxies render with a deterministic hash-derived tilt (stable across reloads, not real). Two fetchers add measured ones, picked up automatically by the next `build-all`:

```bash
npm run fetch-2mass-xsc    # ~5 minutes; PA + axis-ratio for 2MRS, from the 2MASS XSC
npm run fetch-hyperleda    # multi-hour; PA + axis-ratio for GLADE, from HyperLEDA
```

The pre-computed HyperLEDA cache shipped from R2 is deliberately partial (~52k of GLADE's ~1.5M unique PGCs; see the `hyperleda.pa` entry in [`rawDataRegistry.ts`](../tools/utils/io/rawDataRegistry.ts)), so an incomplete local run is not broken. To use it instead of running the fetcher:

```bash
mkdir -p data/raw/hyperleda
curl -L -o data/raw/hyperleda/hyperleda_pa.csv.gz https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz
gunzip data/raw/hyperleda/hyperleda_pa.csv.gz
```

Both fetchers are optional; the renderer works without them.

### Local-volume distance override

Inside `CUTOFF_MPC = 30` ([`localVolumeCutoff.ts`](../tools/catalog/localVolumeCutoff.ts)) the pipeline replaces the cz-derived position with a redshift-independent measured distance, checked in this order ([`catalogDistanceFor.ts`](../tools/catalog/catalogDistanceFor.ts)):

1. a curated seed (`data/seeds/local_volume_distances.seed.json`, registry key `localvolume.distances`) keyed by 2MASS XSC designation, for the handful of blueshifted galaxies CF4 and HyperLEDA both miss;
2. Cosmicflows-4's `table2.dat` (55,877 rows), by PGC;
3. HyperLEDA's `mod0` distance modulus, by PGC.

The catalogued spectroscopic z is stored separately on the `.bin` (byte 56) so the InfoCard still shows the published redshift even when the position uses the override. 2MRS rows get a PGC (needed for the CF4/HyperLEDA lookups) via a `2MASX → PGC` crosswalk patched in from GLADE during `buildAllBins`; famous/SDSS rows without a PGC fall through to the plain cz path. A blueshifted row with no measured distance is placed in its true sky direction at `|cz|/H0` rather than mirrored through the origin. Full design: [`docs/superpowers/specs/completed/2026-05-27-local-volume-distances.md`](superpowers/specs/completed/2026-05-27-local-volume-distances.md).

CF4's raw tables and the flow-field velocity cube share one upstream download; the full fetch/build/maintainer flow for both lives in [`data/raw/cf4/README.md`](../data/raw/cf4/README.md).

## Famous galaxies (curated atlas)

A small hand-curated catalog of well-known galaxies (Messier + NGC greatest-hits, ~150 rows) ships as its own `Source`, searchable via Cmd+K with curated names and pre-processed transparent-WebP thumbnails. Most thumbnails come from the famous-galaxy curator (`npm run curate-famous`); the rest fall back to a Wikipedia → DESI Legacy auto-fetch. Credits are recorded in `data/seeds/famous_curated_overrides.json` and summarised in [ATTRIBUTIONS.md](../ATTRIBUTIONS.md).

```bash
npm run build-tiers            # the survey .bin files (build-famous's own docblock requires this order)
npm run fetch-famous-images    # downloads + processes thumbnails; idempotent, --force to re-fetch
npm run build-famous           # public/data/galaxy-catalog/v9/famous.bin + famous_galaxies_meta.json
```

To add a galaxy, edit `data/seeds/famous_galaxies.seed.json` (`id`, `names`, `ra`/`dec`, `distanceMpc`, `diameterKpc`, `type`, `description`) and re-run the last two steps. Skip this section entirely for survey-only data; the renderer works without `famous.bin`.

A parallel curated list of well-known stars follows the same seed → build shape: `data/seeds/famous_stars.seed.json` drives `npm run build-famous-stars`, which splits into generated render code plus a `famous_stars_meta.json` sidecar.

## Featured structures (clusters, superclusters)

[`buildStructures.ts`](../tools/structures/buildStructures.ts) reads the MCXC X-ray cluster catalog and the MSCC supercluster catalog, filters each to a manageable set (mass/richness thresholds), lets curated anchors from `data/seeds/structure_anchors.seed.json` win over any catalog entry that falls inside their exclusion sphere, and writes the CCAT pair.

```bash
npm run fetch-structures    # MCXC + MSCC from CDS VizieR, verifies .sha256
npm run build-tiers         # structures build reads the same public/data/ tree
npm run build-structures    # structures.ccat + structures_meta.json
```

Provenance for each source catalog: [`data/raw/mcxc/README.md`](../data/raw/mcxc/README.md), [`data/raw/mscc/README.md`](../data/raw/mscc/README.md).

## Filaments (DisPerSE)

The filament skeleton is computed offline by [DisPerSE](https://disperse.readthedocs.io/) (Sousbie 2011), which extracts the persistent ridges of the Delaunay-tessellation density field. The default build runs `delaunay_3D → mse → skelconv` at a 5σ persistence cut with 2 smoothing passes, against the **2MRS + GLADE** subset. SDSS is excluded by default because its wedge footprint dominates the density field at the survey edges, and DisPerSE locks onto those boundaries instead of the real cosmic web (confirmed empirically via an SDSS-only diagnostic build).

```bash
# Install DisPerSE; ensure delaunay_3D, mse, skelconv are on $PATH.
npm run build-tiers        # so the .bin catalogues exist first
npm run build-filaments    # public/data/filament/v1/filaments.bin
```

Flags: `--cut N` (persistence sigma, default 5), `--smooth N` (default 2), `--sources csv` (subset of `sdss,2mrs,glade`, default `2mrs,glade`), `--output path` (for diagnostic builds that shouldn't clobber the canonical file). Skip this step if you don't want filaments; the renderer treats a missing `filaments.bin` as optional. The skeleton is shared across all three galaxy tiers rather than tier-matched, since the cosmic web extends well beyond what the small tier's decimated sample shows.

## Stars (Gaia DR3)

```bash
npm run build-stars
```

Consumes `data/raw/gaia/`: paged Gaia DR3 CSVs, the GCNS 100 pc supplement, the Hipparcos-2 bright-star patch. It emits the per-tier SKST binaries. The full build holds the Gaia superset in memory at once, so the npm script raises Node's heap to 16 GB (`NODE_OPTIONS=--max-old-space-size=16384`) accordingly.

For real-scale runs the canonical builder is the Rust port, `npm run build-stars-rs` (requires a Rust toolchain). It shares the TypeScript builder's encode/quantize/tier pipeline but is not byte-identical: it adds two dedup rules the TypeScript reference doesn't have, so its output subtracts a few more stars from the same inputs. The TypeScript build stays the reference implementation the Vitest suite exercises. See [`tools/stars-rs/README.md`](../tools/stars-rs/README.md) for the parity contract and the constellation-resolution stage it also runs.

## Cosmic-web volumes

All four share the SCFD format and a common presentation model (palette, contrast, exposure; see each entry in `src/data/sources/*.ts`).

- **CF-4 DM density** (`cf4-density`) and **CF4++ flow field** (`flow`): both derived from the same Courtois 2025 CF4++ ensemble, full fetch/build/maintainer flow in [`data/raw/cf4/README.md`](../data/raw/cf4/README.md). `npm run build-cf4-density` / `npm run build-flow-field`.
- **MCPM Cosmic Web** (`mcpm`): three tiered `.scfd` from the SDSS DR17 Cosmic Slime VAC. The Python extraction happens once per VAC release; contributors curl the pre-extracted `.npy` tiers and run `npm run build-mcpm`. Full flow in [`data/raw/mcpm/README.md`](../data/raw/mcpm/README.md).
- **Polyphorm (2MRS)** (`polyphorm-2mrs`, hidden by default): a locally-run Polyphorm export converted by `tools/volumes/extractPolyphormExport.py` into d8/d4/d2 tiers, then imported per tier with `buildRhizomeVolume.ts --clamp 0.2`. The clamp zeroes packed voxels below that log-normalised threshold; 0.2 sits below the renderer's default visibility deadband and shrinks the large tier's gzipped size by two orders of magnitude at no visible cost.
- **MCPM workbench** (`mcpm-workbench`, hidden, no UI toggle): a durable home for cubes promoted from the `tools/mcpm-workbench/` dev tool. Export in the workbench UI, drop the `.npy`+`.json` pair into `data/raw/mcpm-workbench/`, then `npm run promote-mcpm-workbench -- --stem <stem>`, which imports it via the same `buildRhizomeVolume()` and copies the sidecar to the committed pointer `data/seeds/mcpm_workbench_promoted.json`. Its trace-mass total sits a uniform ~9.28× below the reference VAC; a three-stage investigation ruled this a documented provenance offset in the reference VAC itself, after eliminating every ported quirk, structural cause, and f16-accumulation explanation. See [`docs/research/mcpm-trace-mass-offset.md`](research/mcpm-trace-mass-offset.md).

An **Edenhofer parsec-scale dust volume** already ships three tiered `.scfd` files (`edenhofer-dust-{small,medium,large}.scfd`, tracked by `allowDataFile`) with no `SOURCE_REGISTRY` row yet. The data pipeline landed ahead of its renderer wiring, so don't be surprised to find the files without a UI toggle.

## Solar system & Earth imagery

Planet/moon/ring textures and Earth's imagery are gitignored raw pulls with committed README + checksum sidecars, following the same registry pattern as the catalogs. `npm run fetch-textures` (~1.2 GB full pull; `--dev` for a ~7 MB subset) plus `npm run fetch-eox` (EOX s2cloudless tiles, populates `data/raw/eox/`) feed `npm run build-textures` and `npm run build-earth-tiles` (hours for a full bake; `--dev` stops at z5 and skips the EOX and GeoDanmark bands). The GeoDanmark z14–19 harvest under `data/raw/geodanmark/` has no fetcher yet — it's a manual demo pull (see its README) — so a fresh checkout without it falls back to EOX's z13 floor over Søndermarken until one is added. Provenance: [`data/raw/textures/README.md`](../data/raw/textures/README.md), [`data/raw/eox/README.md`](../data/raw/eox/README.md), [`data/raw/geodanmark/README.md`](../data/raw/geodanmark/README.md).

Earth's whole-globe base texture and its surface tile pyramid are two publications of one Blue Marble month (a 21600×10800 equirect and eight 21600×21600 quadrants, ~421 MB). The month is chosen once in [`bmngVintage.ts`](../tools/utils/io/bmngVintage.ts) and every registry path, upstream URL, and attribution string reads it from there. The tile layer falls back to the base outside its baked window, so a vintage split between the two would draw a visible seasonal seam along the tile frontier.

### Earth surface tile pyramid

The bake emits `public/data/images/earth-tiles/v4/surface/<z>/<x>/<y>.webp`: 512 px lossy WebP tiles whose alpha channel doubles as the land mask, plus two sidecars, `index.txt` (one path per line) and `manifest.json` (the band list the runtime reads). The manifest is written after the tiles, so an interrupted bake leaves no pointer to half-baked data ([`buildEarthTiles.ts`](../tools/textures/buildEarthTiles.ts)).

The tiling is equirectangular: level `z` spans `512 << z` texels of width, i.e. `2^z` columns of tiles ([`earthTileParams.ts`](../src/data/bodies/earthTileParams.ts)). The whole-globe base textures sit on the same ladder (small tier z2, medium z3, large z4), and the runtime planner only streams tiles finer than the session's base level. Three bands fill the pyramid: Blue Marble globally at z3–z7; EOX s2cloudless regional insets at z8–z13, harvested at z13 for the named boxes in [`eoxRegions.ts`](../tools/fetch/eoxRegions.ts), downsampled for the coarser levels, and underfilled from Blue Marble at box margins; and a GeoDanmark orthophoto band at z14–z19 over Søndermarken, Copenhagen ([`data/raw/geodanmark/README.md`](../data/raw/geodanmark/README.md)). Refinement past z7 happens only inside a region box, and past z13 only inside the GeoDanmark patch.

GeoDanmark is baked differently from the other two bands: every level of the harvest was rendered natively by the WMS server, fully opaque, so `buildEarthTiles.ts` copies its tiles onto the pyramid byte-for-byte (`preTiledBand.ts`) instead of baking the deepest level and averaging coarser ones down — pyramiding a source with gaps at the edges would leave those parent tiles' uncovered quadrants transparent, and the runtime alpha-blends a transparent tile over the blurry EOX/Blue Marble band beneath it rather than 404ing cleanly.

At runtime [`earthTileSubsystem.ts`](../src/services/engine/subsystems/earthTileSubsystem.ts) fetches the manifest (any failure degrades to the base globe, never an error), then streams tiles through a 256-slot LRU atlas (8192 px, 512 px slots) at 4 concurrent fetches. On R2 the tiles are immutable and bulk-uploaded via rclone; any re-bake that changes pixels bumps the `TILE_PREFIX` version, and the day-cached manifest uploads last ([`syncR2.ts`](../tools/deploy/syncR2.ts), [DEPLOY.md](DEPLOY.md)). Earth tiles never appear in the data `manifest.json`, so `npm run fetch-data` skips them by construction; dev serves whatever `public/data/images/earth-tiles/` holds locally.

## Data-refresh re-run orders

Every refresh shares one shape: fetch, build, then `npm run sync-r2-secure` from the **main worktree only** (a worktree's `data/` is its own; see the deploy doc). The sync step is the deploy path, covered in [docs/DEPLOY.md](DEPLOY.md).

| Data changed           | Fetch                                   | Build                                             |
| ---------------------- | --------------------------------------- | ------------------------------------------------- |
| CF4 distances          | `fetch-cf4`                             | `build-tiers` (`2mrs.bin`, `glade-*.bin`)         |
| Clusters/superclusters | `fetch-structures`                      | `build-structures` (after `build-tiers`)          |
| DESI                   | `fetch-desi`                            | `build-tiers` (`desi-{deep,wedge,sgw}.bin`)       |
| Planet textures        | `fetch-textures` (`--dev` for a subset) | `build-textures`                                  |
| Earth surface tiles    | `fetch-textures` + `fetch-eox`          | `build-earth-tiles` (`--dev` for a quick z5 pass) |

Raw files and built artefacts are gitignored; only provenance READMEs and `.sha256` sidecars are committed. Full-resolution texture and tile builds run post-merge from the main worktree.

## Adding a new raw data source

1. **Per-catalog subdir** under `data/raw/<catalog>/` (lowercase, single word). No loose files at `data/raw/` root.
2. **Register every file** in [`tools/utils/io/rawDataRegistry.ts`](../tools/utils/io/rawDataRegistry.ts). Keys are dotted-lowercase `<catalog>.<artifact>` (e.g. `'cf4.table2'`); dynamically-named outputs register the directory as `<catalog>.dir` and consumers `join()` the rest. Fill in `kind: 'file' | 'directory'`, `source: 'committed' | 'gitignored'`, a one-line `description`, optional `upstream`, `fetcher`, `readme`.
3. **Consume via the registry**: `rawDataPath('<catalog>.<artifact>')`, never `resolve('data/raw/...')`.
4. **`.gitignore` exception** only for a non-standard committed file. `/data/**` is re-included by `!/data/raw/**/README.md`, `!/data/raw/**/*.sha256`, `!/data/raw/fonts/*.ttf`, and `!/data/seeds/*.json`, so a new catalog's README + checksum sidecar track with a plain `git add`. Add a dedicated `!` line only for a file none of those cover (the vendored `constellations.lines.json` is the existing example).
5. **Provenance README** at `data/raw/<catalog>/README.md`: upstream URL, columns/byte layout, fetch date, checksum.

Reference fetchers: [`tools/fetch/fetchHyperLeda.ts`](../tools/fetch/fetchHyperLeda.ts), [`tools/fetch/fetch2massXsc.ts`](../tools/fetch/fetch2massXsc.ts). Wiring a new source into the renderer, rather than just registering its raw files, is a bigger surface; the `add-data-source` skill maps that.

## Catalog gotchas

- **2MRS** (Huchra 2012) has only near-IR photometry: J→magG, H→magR, K→magI. Local Group galaxies have negative cz; never filter `cz > 0`.
- **GLADE v2.3** has no orientation columns of its own; PGC (bytes 1-7) is the cross-match key into HyperLEDA for real PA/axis-ratio.
- **2MRS** has no PA in its own table; the 2MASS XSC's `sup_phi`/`sup_ba` supply it, cross-matched by 2MASS ID.
- **SDSS** CSV column set is whatever the SkyServer SQL query returned, in whatever order. The parser reads the header, not fixed positions.
- **2MRS `objID` in the `.bin` is the PGC number**, patched in from GLADE's 2MASX→PGC crosswalk during `buildAllBins`; `objID = 0` means no match.
- **Blueshifted rows without a measured distance** are placed in their true direction at `|cz|/H0` via the local-volume seed. Never let a negative-z row mirror to the antipode.
- **Milliquas bypasses cross-match on purpose**: a Milliquas AGN point and its GLADE host galaxy at the same sky position are physically different objects (nucleus vs integrated host light), and Milliquas is already deduplicated upstream against its parent surveys. It still runs through the famous-seed dedup separately, so a famous galaxy's active nucleus doesn't double-render.

Always consult the upstream ReadMes beside each catalog (e.g. `data/raw/2mrs/J_ApJS_199_26_ReadMe`, `data/raw/glade/VII_281_ReadMe`) for byte offsets when extending a parser.
