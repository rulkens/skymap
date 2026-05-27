/**
 * `RAW_DATA` — single source of truth for every catalog raw-data file
 * (and a few directories) the build pipeline consumes.
 *
 * Modeled on `src/data/sources.ts`'s `SOURCE_REGISTRY`: a typed lookup
 * table keyed by a dotted-lowercase string ID (`'2mrs.table3'`,
 * `'glade.v23'`, …) with one entry per file or directory.  Consumers
 * call `rawDataPath('2mrs.table3')` instead of hand-writing
 * `resolve('data/raw/2mrs_table3.dat')` — so a file move becomes a
 * one-line edit here rather than a hunt through the 15-odd
 * tools/ scripts that touch the data tree.
 *
 * ## Why a registry
 *
 * Before this file existed, ~20 path strings were sprinkled across
 * `tools/parsers/`, `tools/fetch/`, `tools/famous/`, `tools/volumes/`,
 * and `tools/deploy/syncR2.ts`.  A reorg (or even a casual rename of
 * an upstream-named file when a new VizieR version drops) meant
 * editing every reference.  Centralizing the paths here also opens
 * the door to ergonomics that scattered strings can't support: a
 * compile-time check that every consumer references a known file
 * (via the `RawDataKey` union type), a documented `description` +
 * `upstream` URL per entry, and a future `npm run check-raw-data`
 * that walks the registry to report what's missing on disk.
 *
 * ## Conventions
 *
 * - **Keys**: `<catalog>.<artifact>`, dotted-lowercase.  The first
 *   segment is the catalog or producer (`2mrs`, `glade`, `hyperleda`,
 *   `sdss`, `famous`, `cf4`, `mcpm`, `milliquas`, `fonts`, `starnet`,
 *   `filaments`).  The second segment names the specific file or
 *   directory (`table3`, `pa`, `readme`, `dir`).
 * - **Paths**: relative to the repo root, forward-slash, no leading
 *   `./`.  The `rawDataPath` helper resolves to absolute on demand.
 * - **`source`**: `'committed'` if the file is in git, `'gitignored'`
 *   otherwise.  Useful for the future check-raw-data script: a
 *   missing gitignored file means "run the fetcher"; a missing
 *   committed file means "you broke the repo".
 * - **`kind`**: `'file'` or `'directory'`.  Directories appear for
 *   fetcher outputs where the filename is dynamic (HyperLEDA chunk
 *   files, MCPM tier files, DisPerSE filament caches); consumers
 *   `join()` the dynamic component themselves.
 * - **`upstream`/`fetcher`/`readme`**: optional self-documentation.
 *   `upstream` is the URL the file ultimately came from.  `fetcher`
 *   is the `tools/` script that produces it, if any.  `readme` is
 *   the registry key of a related ReadMe entry (for the upstream-
 *   provided VizieR ReadMes that document byte layouts).
 *
 * ## What's NOT here
 *
 * - Build artefacts under `public/data/*.bin`.  Those are outputs,
 *   not inputs — they're produced by `tools/catalog/buildAllBins.ts`
 *   and shipped to R2 via `tools/deploy/syncR2.ts`.
 * - Source code, tests, fixtures — anything under `src/`, `tests/`,
 *   or `tools/utils/`.  The registry is for the `data/` tree.
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
    path: 'data/raw/2mrs_table3.dat',
    kind: 'file',
    source: 'committed',
    description:
      '2MASS Redshift Survey table 3 — fixed-width galaxy records (positions, J/H/K mags, cz).',
    upstream: 'https://tdc-www.harvard.edu/2mrs/',
    readme: '2mrs.readme',
  },
  '2mrs.readme': {
    path: 'data/raw/J_ApJS_199_26_ReadMe',
    kind: 'file',
    source: 'committed',
    description:
      'VizieR ReadMe for 2MRS — byte-offset specs the table-3 parser relies on.',
  },
  '2mrs.xsc-pa': {
    path: 'data/raw/2mass_xsc_pa.csv',
    kind: 'file',
    source: 'committed',
    description:
      '2MASS XSC sup_phi position-angle pull, keyed by 2MASS XSC ID. Cross-matched into 2MRS rows.',
    fetcher: 'tools/fetch/fetch2massXsc.ts',
  },

  // ─── GLADE v2.3 — Dálya+ 2018 ──────────────────────────────────────────

  'glade.v23': {
    path: 'data/raw/glade2.3.dat',
    kind: 'file',
    source: 'committed',
    description:
      'Galaxy List for the Advanced Detector Era (GLADE v2.3) — fixed-width all-sky compilation.',
    upstream: 'https://glade.elte.hu/',
    readme: 'glade.readme',
  },
  'glade.readme': {
    path: 'data/raw/VII_281_ReadMe',
    kind: 'file',
    source: 'committed',
    description: 'VizieR ReadMe for GLADE v2.3 — byte-offset specs for the parser.',
  },

  // ─── HyperLEDA — orientation + designation cross-walk ─────────────────

  'hyperleda.pa': {
    path: 'data/raw/hyperleda_pa.csv',
    kind: 'file',
    source: 'gitignored',
    description:
      'HyperLEDA meandata pull, keyed by PGC — diameter and position-angle for GLADE orientation. Intentionally partial cache (~52k/1.5M PGCs).',
    fetcher: 'tools/fetch/fetchHyperLeda.ts',
  },
  'hyperleda.pa-gz': {
    path: 'data/raw/hyperleda_pa.csv.gz',
    kind: 'file',
    source: 'committed',
    description:
      'Gzipped copy of `hyperleda.pa`, shipped to R2 so contributors without the full fetcher cache can still run the GLADE orientation step.',
  },
  'hyperleda.famous-cache': {
    path: 'data/raw/hyperleda_famous_cache.tsv',
    kind: 'file',
    source: 'committed',
    description:
      'HyperLEDA per-galaxy pull for the curated Famous list — names, alt designations, distance modulus.',
  },
  'hyperleda.designations-dir': {
    path: 'data/raw',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Holds `hyperleda_designations_chunk_*.csv` from the PGC-alias builder. Each chunk is a paginated slice of HyperLEDA designations.',
    fetcher: 'tools/fetch/buildPgcAliases.ts',
  },

  // ─── SDSS — manual SkyServer SQL export ────────────────────────────────

  'sdss.skyserver': {
    path: 'data/Skyserver_SQL5_3_2026 6_09_20 PM.csv',
    kind: 'file',
    source: 'committed',
    description:
      'Active SDSS SkyServer CSV export. Auto-picked by mtime from data/Skyserver_*.csv at build time; this entry pins the current file.',
  },

  // ─── Famous (curated catalog) ──────────────────────────────────────────

  'famous.seed': {
    path: 'data/famous_galaxies.seed.json',
    kind: 'file',
    source: 'committed',
    description:
      'Hand-authored seed list of well-known galaxies (M31, M33, NGC 253, …). Drives the famous-galaxy build + image fetcher.',
  },
  'famous.curated': {
    path: 'data/famous_curated_overrides.json',
    kind: 'file',
    source: 'committed',
    description:
      'Hand-curated override index produced by the famous-galaxy curator UI — per-galaxy crop/orientation tweaks.',
  },
  'famous.wikipedia-cache': {
    path: 'data/raw/wikipedia_famous_cache.json',
    kind: 'file',
    source: 'committed',
    description:
      'Wikipedia metadata pull for the famous-galaxy entries — source URLs + descriptions.',
    fetcher: 'tools/famous/fetchFamousImages.ts',
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
  'cf4.dir': {
    path: 'data/raw/cf4',
    kind: 'directory',
    source: 'gitignored',
    description:
      'Cosmicflows-4 raw-data directory. Holds the density .npy + future per-galaxy distance table.',
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
    path: 'data/raw',
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
