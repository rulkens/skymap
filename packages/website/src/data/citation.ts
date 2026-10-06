import pkg from '../../../../package.json';

/**
 * How to cite skymap, mirroring CITATION.cff at the repository root (a test
 * holds the two together). The concept DOI follows the newest release; the
 * version DOI is the one release named here, as Zenodo shows it.
 */
export const CITATION = {
  title: 'skymap: Interactive WebGPU explorer for galaxy catalogs',
  version: pkg.version,
  released: '2026-08-31',
  conceptDoi: '10.5281/zenodo.20037028',
  versionDoi: '10.5281/zenodo.22209203',
} as const;
