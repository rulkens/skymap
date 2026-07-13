/**
 * `RAW_DATA` — single source of truth for every catalog raw-data file the
 * build pipeline consumes. Keyed by dotted-lowercase `<catalog>.<artifact>`
 * (`'2mrs.table3'`, `'cf4.table2'`, …); consumers call `rawDataPath(key)`
 * rather than hand-writing `data/raw/...` strings, so a file move is a
 * one-line edit here. `RawDataKey` gives compile-time key checking.
 *
 * ## Conventions
 *
 * - **Keys**: `<catalog>.<artifact>`. First segment = catalog/producer
 *   (`2mrs`, `glade`, `hyperleda`, `sdss`, `famous`, `cf4`, `mcpm`,
 *   `milliquas`, `mcxc`, `mscc`, `desi`, `fonts`, `starnet`, `filaments`).
 * - **`source`**: `'committed'` = in git; `'gitignored'` = fetcher output.
 *   A missing gitignored file → run the fetcher; a missing committed file
 *   → the repo is broken.
 * - **`kind`**: `'file'` or `'directory'`. Directories appear when the
 *   filename is dynamic (chunk files, tier variants); consumers `join()`.
 * - **`upstream`/`fetcher`/`readme`**: optional provenance documentation.
 *
 * Build artefacts (`public/data/*.bin`) are outputs, not inputs — they are
 * not registered here.
 */

import { resolve } from 'node:path';

export type RawDataEntry = {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly source: 'committed' | 'gitignored';
  readonly description: string;
  readonly upstream?: string;
  readonly fetcher?: string;
  readonly readme?: string;
};

export const RAW_DATA = {
  // ─── 2MRS — Huchra+ 2012 ───────────────────────────────────────────────

  '2mrs.table3': {
    path: 'data/raw/2mrs/2mrs_table3.dat',
    kind: 'file',
    source: 'committed',
    description:
      '2MASS Redshift Survey table 3 — fixed-width galaxy records (positions, J/H/K mags, cz).',
    upstream: 'https://tdc-www.harvard.edu/2mrs/',
    readme: '2mrs.readme',
  },
  '2mrs.readme': {
    path: 'data/raw/2mrs/J_ApJS_199_26_ReadMe',
    kind: 'file',
    source: 'committed',
    description: 'VizieR ReadMe for 2MRS — byte-offset specs the table-3 parser relies on.',
  },
  '2mrs.xsc-pa': {
    path: 'data/raw/2mrs/2mass_xsc_pa.csv',
    kind: 'file',
    source: 'committed',
    description:
      '2MASS XSC sup_phi position-angle pull, keyed by 2MASS XSC ID. Cross-matched into 2MRS rows.',
    fetcher: 'tools/fetch/fetch2massXsc.ts',
  },

  // ─── GLADE v2.3 — Dálya+ 2018 ──────────────────────────────────────────

  'glade.v23': {
    path: 'data/raw/glade/glade2.3.dat',
    kind: 'file',
    source: 'committed',
    description:
      'Galaxy List for the Advanced Detector Era (GLADE v2.3) — fixed-width all-sky compilation.',
    upstream: 'https://glade.elte.hu/',
    readme: 'glade.readme',
  },
  'glade.readme': {
    path: 'data/raw/glade/VII_281_ReadMe',
    kind: 'file',
    source: 'committed',
    description: 'VizieR ReadMe for GLADE v2.3 — byte-offset specs for the parser.',
  },

  // ─── HyperLEDA — orientation + designation cross-walk ─────────────────

  'hyperleda.pa': {
    path: 'data/raw/hyperleda/hyperleda_pa.csv',
    kind: 'file',
    source: 'gitignored',
    description:
      'HyperLEDA meandata pull, keyed by PGC — diameter and position-angle for GLADE orientation. Intentionally partial cache (~52k/1.5M PGCs).',
    fetcher: 'tools/fetch/fetchHyperLeda.ts',
  },
  'hyperleda.pa-gz': {
    path: 'data/raw/hyperleda/hyperleda_pa.csv.gz',
    kind: 'file',
    source: 'committed',
    description:
      'Gzipped copy of `hyperleda.pa`, shipped to R2 so contributors without the full fetcher cache can still run the GLADE orientation step.',
  },
  'hyperleda.famous-cache': {
    path: 'data/raw/hyperleda/hyperleda_famous_cache.tsv',
    kind: 'file',
    source: 'committed',
    description:
      'HyperLEDA per-galaxy pull for the curated Famous list — names, alt designations, distance modulus.',
  },
  'hyperleda.designations-dir': {
    path: 'data/raw/hyperleda',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Holds `hyperleda_designations_chunk_*.csv` from the PGC-alias builder. Each chunk is a paginated slice of HyperLEDA designations.',
    fetcher: 'tools/fetch/buildPgcAliases.ts',
  },

  // ─── SDSS — manual SkyServer SQL export ────────────────────────────────

  'sdss.skyserver': {
    path: 'data/raw/sdss/Skyserver_SQL5_3_2026 6_09_20 PM.csv',
    kind: 'file',
    source: 'committed',
    description:
      'Active SDSS SkyServer CSV export. Auto-picked by mtime from data/raw/sdss/Skyserver_*.csv at build time; this entry pins the current file.',
  },
  'sdss.dir': {
    path: 'data/raw/sdss',
    kind: 'directory',
    source: 'committed',
    description:
      'SDSS SkyServer CSV exports. The build pipeline auto-picks the newest matching `Skyserver_*.csv` from here.',
  },

  // ─── Clusters (curated featured structures) ───────────────────────────

  'structures.seed': {
    path: 'data/seeds/structure_anchors.seed.json',
    kind: 'file',
    source: 'committed',
    description:
      'Hand-authored seed list of featured galaxy clusters, superclusters, and voids. Drives the structure-coverage POI build.',
  },

  // ─── Famous (curated catalog) ──────────────────────────────────────────

  'famous.seed': {
    path: 'data/seeds/famous_galaxies.seed.json',
    kind: 'file',
    source: 'committed',
    description:
      'Hand-authored seed list of well-known galaxies (M31, M33, NGC 253, …). Drives the famous-galaxy build + image fetcher.',
  },
  'famous.curated': {
    path: 'data/seeds/famous_curated_overrides.json',
    kind: 'file',
    source: 'committed',
    description:
      'Hand-curated override index produced by the famous-galaxy curator UI — per-galaxy crop/orientation tweaks.',
  },
  'famous.wikipedia-cache': {
    path: 'data/raw/famous/wikipedia_famous_cache.json',
    kind: 'file',
    source: 'committed',
    description:
      'Wikipedia metadata pull for the famous-galaxy entries — source URLs + descriptions.',
    fetcher: 'tools/famous/fetchFamousImages.ts',
  },
  'famous.source-cache-dir': {
    path: 'data/raw/famous/source-cache',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Persistent download cache for curator source images, keyed by sha256(url). Lets resume / re-curation / the thumb backfill reuse a fetched original instead of re-downloading. Populated on first fetch by tools/famous/sourceImageCache.ts.',
  },

  // ─── Cosmicflows-4 (DM density volume; per-galaxy distances pending) ──

  'cf4.density-mean': {
    path: 'data/raw/cf4/d_mean_CF4pp.npy',
    kind: 'file',
    source: 'gitignored',
    description:
      'CF-4 mean DM density cube (Float32 .npy). Shipped to R2; downloaded by build-cf4-density.',
    upstream: 'https://edd.ifa.hawaii.edu/CF4calculator/',
  },
  'cf4.vfield-mean': {
    // Maintainer slices this out of the npz once per release alongside
    // d_mean_CF4pp.npy:  `unzip -j CF4pp_mean_std_grids.npz v_mean_CF4pp.npy`.
    // It is the Cartesian mean-velocity field (km/s) on the same 128^3
    // supergalactic grid as the density cube; buildFlowField packs the two
    // into flowfield.scfd.  Gitignored + R2-hosted, same as the density mean.
    path: 'data/raw/cf4/v_mean_CF4pp.npy',
    kind: 'file',
    source: 'gitignored',
    description:
      'CF-4 mean Cartesian velocity field (km/s, .npy). Sliced from CF4pp_mean_std_grids.npz; packed with the density mean into flowfield.scfd by build-flow-field.',
    upstream: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
  },
  'cf4.vfield-npz': {
    // The same upstream 167 MB ensemble that d_mean_CF4pp.npy is sliced from —
    // one file, two consumers. The density pipeline slices d_mean_CF4pp; the
    // flow build slices v_mean_CF4pp + d_mean_CF4pp. Registering it once here
    // (rather than under a parallel cf4pp/ dir) keeps a single source of truth
    // for the npz. Maintainer-only: never committed, never synced to R2.
    path: 'data/raw/cf4/CF4pp_mean_std_grids.npz',
    kind: 'file',
    source: 'gitignored',
    description:
      'CF4++ mean/std velocity + density ensemble (Courtois 2025). Six 128^3 arrays over a 1000 Mpc (physical, not Mpc/h) supergalactic box; build-flow-field packs v_mean_CF4pp + d_mean_CF4pp into flowfield.scfd.',
    upstream: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
  },
  'cf4.dir': {
    path: 'data/raw/cf4',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Cosmicflows-4 raw-data directory. Holds the density .npy + future per-galaxy distance table.',
  },
  'cf4.table2': {
    path: 'data/raw/cf4/table2.dat',
    kind: 'file',
    source: 'gitignored',
    description:
      'CF-4 homogenised distance table (Tully+ 2023, ~55,877 rows). Fixed-width ASCII. Downloaded by fetchCosmicflows4.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat',
    fetcher: 'tools/fetch/fetchCosmicflows4.ts',
    readme: 'cf4.readme',
  },
  'cf4.readme': {
    path: 'data/raw/cf4/ReadMe',
    kind: 'file',
    source: 'gitignored',
    description:
      'CDS Vizier ReadMe for J/ApJ/944/94 — column-offset spec for table2.dat. Downloaded alongside the table.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe',
    fetcher: 'tools/fetch/fetchCosmicflows4.ts',
  },
  'cf4.sha256': {
    path: 'data/raw/cf4/table2.dat.sha256',
    kind: 'file',
    source: 'committed',
    description:
      'SHA-256 sidecar for table2.dat — committed so the parser can detect truncated or stale downloads.',
    fetcher: 'tools/fetch/fetchCosmicflows4.ts',
  },

  // ─── MCPM Cosmic Web (SDSS DR17 Cosmic Slime VAC) ─────────────────────

  'mcpm.dir': {
    path: 'data/raw/mcpm',
    kind: 'directory',
    source: 'gitignored',
    description:
      'MCPM-extracted SDSS Cosmic Web tiers — `mcpm_sdss_d{2,4,8}.npy`. Produced once per VAC release by the Python extractor; mirrored to R2.',
  },

  // ─── Milliquas (AGN/quasar compilation) ───────────────────────────────

  'milliquas.txt': {
    path: 'data/raw/milliquas/milliquas.txt',
    kind: 'file',
    source: 'gitignored',
    description: 'Milliquas v8 fixed-width catalog of optically-bright AGN.',
    fetcher: 'tools/fetch/fetchMilliquas.ts',
    upstream: 'https://quasars.org/',
  },
  'milliquas.dir': {
    path: 'data/raw/milliquas',
    kind: 'directory',
    source: 'gitignored',
    description: 'Milliquas raw-data directory — fetcher output target.',
  },

  // ─── DisPerSE filament input caches ───────────────────────────────────

  'filaments.cache-dir': {
    path: 'data/raw/filaments',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Holds `galaxies_<source-combo>.tsv` ASCII-survey inputs to DisPerSE + the .NDnet / .NDskl skeletons it produces.',
    fetcher: 'tools/filaments/buildFilaments.ts',
  },

  // ─── Fonts (MSDF label atlas sources) ─────────────────────────────────

  'fonts.dir': {
    path: 'data/raw/fonts',
    kind: 'directory',
    source: 'committed',
    description: 'TTF sources for the MSDF label atlas; consumed by build-fonts.',
  },

  // ─── MCXC — Meta-Catalogue of X-ray clusters (Piffaretti+ 2011) ──────

  'mcxc.table': {
    path: 'data/raw/mcxc/mcxc.dat',
    kind: 'file',
    source: 'gitignored',
    description:
      'MCXC Meta-Catalogue X-ray galaxy Clusters — 1743 clusters with RA/Dec, z, L500, M500, R500. Fixed-width ASCII, 323 bytes/row.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/mcxc.dat',
    fetcher: 'tools/fetch/fetchStructureCatalogs.ts',
    readme: 'mcxc.readme',
  },
  'mcxc.readme': {
    path: 'data/raw/mcxc/ReadMe',
    kind: 'file',
    source: 'gitignored',
    description:
      'VizieR ReadMe for J/A+A/534/A109 — byte-offset spec for mcxc.dat. Downloaded alongside the table.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/ReadMe',
    fetcher: 'tools/fetch/fetchStructureCatalogs.ts',
  },
  'mcxc.sha256': {
    path: 'data/raw/mcxc/mcxc.dat.sha256',
    kind: 'file',
    source: 'committed',
    description:
      'SHA-256 sidecar for mcxc.dat — committed so the parser can detect truncated or stale downloads.',
    fetcher: 'tools/fetch/fetchStructureCatalogs.ts',
  },

  // ─── MSCC — Main SuperCluster Catalogue (Chow-Martinez+ 2014) ─────────

  'mscc.table': {
    path: 'data/raw/mscc/mscc.dat',
    kind: 'file',
    source: 'gitignored',
    description:
      'MSCC Main SuperCluster Catalogue — 601 superclusters with RA/Dec, z, max separation, member cluster list. Fixed-width ASCII, 324 bytes/row.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/mscc.dat',
    fetcher: 'tools/fetch/fetchStructureCatalogs.ts',
    readme: 'mscc.readme',
  },
  'mscc.readme': {
    path: 'data/raw/mscc/ReadMe',
    kind: 'file',
    source: 'gitignored',
    description:
      'VizieR ReadMe for J/MNRAS/445/4073 — byte-offset spec for mscc.dat. Downloaded alongside the table.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/ReadMe',
    fetcher: 'tools/fetch/fetchStructureCatalogs.ts',
  },
  'mscc.sha256': {
    path: 'data/raw/mscc/mscc.dat.sha256',
    kind: 'file',
    source: 'committed',
    description:
      'SHA-256 sidecar for mscc.dat — committed so the parser can detect truncated or stale downloads.',
    fetcher: 'tools/fetch/fetchStructureCatalogs.ts',
  },

  // ─── DESI DR1 (LSS clustering catalogs) — ultra-deep cone ─────────────

  'desi.bgs': {
    path: 'data/raw/desi/BGS_BRIGHT_NGC_clustering.dat.fits',
    kind: 'file',
    source: 'gitignored',
    description:
      'DESI DR1 (iron) LSS clustering catalog, BGS_BRIGHT tracer, NGC — bright-galaxy sample, z < 0.4.',
    upstream:
      'https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/BGS_BRIGHT_NGC_clustering.dat.fits',
    fetcher: 'tools/fetch/fetchDesi.ts',
    readme: 'desi.readme',
  },
  'desi.lrg': {
    path: 'data/raw/desi/LRG_NGC_clustering.dat.fits',
    kind: 'file',
    source: 'gitignored',
    description:
      'DESI DR1 (iron) LSS clustering catalog, LRG tracer, NGC — luminous red galaxies, z 0.4-1.0.',
    upstream:
      'https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/LRG_NGC_clustering.dat.fits',
    fetcher: 'tools/fetch/fetchDesi.ts',
    readme: 'desi.readme',
  },
  'desi.elg': {
    path: 'data/raw/desi/ELG_LOPnotqso_NGC_clustering.dat.fits',
    kind: 'file',
    source: 'gitignored',
    description:
      'DESI DR1 (iron) LSS clustering catalog, ELG_LOPnotqso tracer, NGC — emission-line galaxies (QSO targets excluded), z 0.6-1.6.',
    upstream:
      'https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/ELG_LOPnotqso_NGC_clustering.dat.fits',
    fetcher: 'tools/fetch/fetchDesi.ts',
    readme: 'desi.readme',
  },
  'desi.qso': {
    path: 'data/raw/desi/QSO_NGC_clustering.dat.fits',
    kind: 'file',
    source: 'gitignored',
    description:
      'DESI DR1 (iron) LSS clustering catalog, QSO tracer, NGC — quasars, z 0.4-3.5.',
    upstream:
      'https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/QSO_NGC_clustering.dat.fits',
    fetcher: 'tools/fetch/fetchDesi.ts',
    readme: 'desi.readme',
  },
  'desi.readme': {
    path: 'data/raw/desi/README.md',
    kind: 'file',
    source: 'committed',
    description:
      'Provenance for the DESI DR1 LSS clustering catalogs — upstream URL, licence, row counts, byte layout, columns skymap consumes.',
  },
  'desi.sha256': {
    path: 'data/raw/desi/desi_dr1_lss.sha256',
    kind: 'file',
    source: 'committed',
    description:
      'Combined SHA-256 sidecar for the four DESI .fits files (one `<hex>  <filename>` line each) — committed so the parser can detect truncated or stale downloads.',
    fetcher: 'tools/fetch/fetchDesi.ts',
  },

  // ─── Gaia DR3 star bin (G<14 main + GCNS + Hipparcos-2 bright patch) ──

  'gaia.dir': {
    path: 'data/raw/gaia',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Gaia DR3 raw-data directory. Holds the paged main-catalog CSVs `gaia_page_<NNNN>.csv` (one file per contiguous random_index slice; consumers join(rawDataPath(...), pageFileName(i))) plus the GCNS + Hipparcos artifacts. Populated by fetchGaia.',
    upstream: 'https://gea.esac.esa.int/tap-server/tap/sync',
    fetcher: 'tools/fetch/fetchGaia.ts',
  },
  'gaia.gcns': {
    path: 'data/raw/gaia/gcns_main.csv',
    kind: 'file',
    source: 'gitignored',
    description:
      'Gaia Catalogue of Nearby Stars (100 pc supplement) — external.gaiaedr3_gcns_main_1, 331,312 rows. Single TAP-sync CSV, ORDER BY source_id for a stable sha256.',
    upstream: 'https://gea.esac.esa.int/tap-server/tap/sync',
    fetcher: 'tools/fetch/fetchGaia.ts',
  },
  'gaia.hipparcos': {
    path: 'data/raw/gaia/hip2.dat',
    kind: 'file',
    source: 'gitignored',
    description:
      'Hipparcos-2 astrometric catalogue (van Leeuwen 2007, VizieR I/311) — 117,955 fixed-width records, the bright-star patch above the Gaia saturation limit. Plain HTTP file from CDS.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/I/311/hip2.dat',
    fetcher: 'tools/fetch/fetchGaia.ts',
    readme: 'gaia.hipparcos-readme',
  },
  'gaia.hipparcos-readme': {
    path: 'data/raw/gaia/ReadMe',
    kind: 'file',
    source: 'gitignored',
    description:
      'VizieR ReadMe for I/311 — byte-offset spec for hip2.dat. Downloaded alongside the table per the "ReadMes live next to the file they describe" convention.',
    upstream: 'https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe',
    fetcher: 'tools/fetch/fetchGaia.ts',
  },
  'gaia.hip-xmatch': {
    path: 'data/raw/gaia/hip2_best_neighbour.csv',
    kind: 'file',
    source: 'gitignored',
    description:
      'Hipparcos↔Gaia cross-match — gaiadr3.hipparcos2_best_neighbour, 99,525 rows (source_id ↔ HIP number). Single TAP-sync CSV, ORDER BY source_id; the dedup key for the Hipparcos bright patch.',
    upstream: 'https://gea.esac.esa.int/tap-server/tap/sync',
    fetcher: 'tools/fetch/fetchGaia.ts',
  },
  'gaia.readme': {
    path: 'data/raw/gaia/README.md',
    kind: 'file',
    source: 'committed',
    description:
      'Provenance for the Gaia DR3 star bin — upstream services + tables, SELECT column lists, the G<14 cut + row counts, the paging scheme, and the fetch command.',
  },
  'gaia.sha256': {
    path: 'data/raw/gaia/gaia.sha256',
    kind: 'file',
    source: 'committed',
    description:
      'Combined SHA-256 sidecar for the two stable single-file Gaia artifacts (`gcns_main.csv`, `hip2.dat`), one `<hex>  <filename>` line each — committed so the fetcher can detect truncated or stale downloads. The paged CSVs get a fetch-completion row-count check instead.',
    fetcher: 'tools/fetch/fetchGaia.ts',
  },

  // ─── StarNet++ weights (famous-galaxy curator) ────────────────────────

  'starnet.weights': {
    path: 'data/starnet/StarNet2_weights.pt',
    kind: 'file',
    source: 'gitignored',
    description:
      'StarNet++ trained weights, used by the famous-galaxy curator for star-removal preview. Downloaded manually.',
  },
} as const satisfies Record<string, RawDataEntry>;

export type RawDataKey = keyof typeof RAW_DATA;

/**
 * Resolve a registry key to an absolute filesystem path.
 *
 * Throws nothing — registry keys are compile-time-checked by
 * `RawDataKey`, and the entries are static.  Disk existence is the
 * caller's problem (a missing fetcher output should fail loudly in
 * the fetcher's own error path, not here).
 */
export function rawDataPath(key: RawDataKey): string {
  return resolve(RAW_DATA[key].path);
}
