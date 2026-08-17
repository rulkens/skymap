import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { R2Upload } from './R2Upload';
import { RAW_DATA } from '../../utils/io/rawDataRegistry';

/**
 * Files outside `public/data/` that still belong in the bucket: slow-external-
 * fetch caches a contributor would otherwise have to regenerate, plus the
 * bucket's own `robots.txt`.
 *
 * These live in `data/raw/` because that is what they are — catalog inputs, not
 * browser-served assets. Copying them into `public/data/` to satisfy the flat
 * sweep would blur that line and risk Vite serving a gzip during dev, so an
 * explicit list is the cheaper answer.
 */
const EXTRA_FILES: readonly R2Upload[] = [
  {
    // Root key, no `data/` prefix: robots.txt is only honoured at the host root.
    localPath: 'tools/deploy/r2-static/robots.txt',
    r2Key: 'robots.txt',
  },
  {
    // ~1 h HyperLEDA pull, gzipped. Contributors curl it instead of refetching:
    //   curl -L -o data/raw/hyperleda/hyperleda_pa.csv.gz \
    //     https://skymap-data.rulkens.com/data/hyperleda_pa.csv.gz
    localPath: RAW_DATA['hyperleda.pa-gz'].path,
    r2Key: 'data/hyperleda_pa.csv.gz',
  },
  // Two slices of the Courtois 2025 CF4++ ensemble. build-flow-field needs
  // BOTH, so shipping only the density one strands the contributor; together
  // they save pulling the 167 MB npz for 2 of its 6 arrays.
  {
    localPath: RAW_DATA['cf4.density-mean'].path,
    r2Key: RAW_DATA['cf4.density-mean'].path,
  },
  {
    localPath: RAW_DATA['cf4.vfield-mean'].path,
    r2Key: RAW_DATA['cf4.vfield-mean'].path,
  },
  ...([8, 4, 2] as const).map((factor) => ({
    // Block-averaged MCPM tiers — the alternative is pyslime + a 345 MB blob.
    localPath: join(RAW_DATA['mcpm.dir'].path, `mcpm_sdss_d${factor}.npy`),
    r2Key: join(RAW_DATA['mcpm.dir'].path, `mcpm_sdss_d${factor}.npy`),
  })),
];

/** The extras present on this machine; the rest are reported by `missingExtraFiles`. */
export function collectExtraFiles(): R2Upload[] {
  return EXTRA_FILES.filter((f) => existsSync(f.localPath));
}

/** Extras absent locally — a fresh checkout has most of them, which is not an error. */
export function missingExtraFiles(): R2Upload[] {
  return EXTRA_FILES.filter((f) => !existsSync(f.localPath));
}
