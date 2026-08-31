import { basename } from 'node:path';

/**
 * Whether a data file should be gzip-compressed before it's PUT to R2.
 *
 * Measured with `gzip -6` on the real artefacts: catalogs and JSON sidecars
 * shrink 11-84% (glade-large 102→55 MB, sdss-medium 9.8→8.3 MB,
 * pgc_aliases.json 1.7→0.4 MB). `stars-*.bin` and `flowfield*.scfd` are
 * excluded — measured ~99%/90% (no smaller), since both are already
 * gzip- or dense-float-packed, so recompressing just burns upload CPU.
 */
export const shouldGzipOnWire = (path: string): boolean => {
  const name = basename(path);
  if (/^stars-.*\.bin$/.test(name)) return false;
  if (/^flowfield.*\.scfd$/.test(name)) return false;
  return /\.(bin|scfd|ccat|json)$/.test(name);
};
