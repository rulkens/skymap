/**
 * famousCuratedOverrides — read-side wrapper around
 * data/famous_curated_overrides.json.
 *
 * Mirrors the OverrideIndex type from
 * tools/famous-curator/plugin/overrideIndex.ts but lives in the famous/
 * subtree so fetchFamousImages.ts has no import dependency on the
 * curator subtree (the curator may not be present in shallow checkouts
 * that only build the runtime).
 *
 * Returns an empty index when the file is absent — first-time clones
 * shouldn't fail with ENOENT just because nobody has curated yet.
 */
import { existsSync, readFileSync } from 'node:fs';

export type CuratedOverrideEntry = {
  dir: string;
  sourceUrl: string;
  license: string;
  author: string;
  processedAt: string;
};

export type CuratedOverrideIndex = {
  version: 1;
  entries: Record<string, CuratedOverrideEntry>;
};

export function loadCuratedOverrides(path: string): CuratedOverrideIndex {
  if (!existsSync(path)) {
    return { version: 1, entries: {} };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<CuratedOverrideIndex>;
  if (raw.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) {
    throw new Error(`curated overrides at ${path}: malformed (expected version 1)`);
  }
  return { version: 1, entries: raw.entries as Record<string, CuratedOverrideEntry> };
}
