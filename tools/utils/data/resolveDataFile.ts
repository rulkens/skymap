import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DataManifest } from '../../../src/@types/data/DataManifest';

/**
 * The on-disk path of a logical data file: the manifest's hashed name where
 * it names one, the logical path itself where it doesn't. The identity
 * fallback covers both a manifest that never named this file (an untracked
 * `.bin`, e.g. `sdss.bin` — see `buildFilaments.ts`) and no manifest at all
 * (a checkout that has never run `buildDataManifest`). Reads `manifest.json`
 * fresh on every call — tool-side call counts are a handful per run, not a
 * hot path, so a cache would only add a staleness risk for no benefit.
 */
export function resolveDataFile(dataDir: string, logicalRelPath: string): string {
  const manifestPath = join(dataDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as DataManifest;
    const hashed = manifest[logicalRelPath];
    if (hashed) return join(dataDir, hashed);
  }
  return join(dataDir, logicalRelPath);
}
