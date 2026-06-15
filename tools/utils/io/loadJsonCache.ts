/**
 * Load a generic JSON-file cache used by the famous-galaxy pipeline.
 *
 * Callers (fetchFamousImages, expandFamousFromCatalogs) cache small
 * key→string maps on disk to avoid repeating expensive network lookups
 * between runs:
 *
 *   - Missing file → `{}` (first-run-friendly: no need to seed).
 *   - Malformed JSON → warn on stderr and return `{}` (throwing would
 *     break a resume after a partial write).
 *
 * Generic over `T extends Record<string, unknown>` to keep the callers'
 * domain types intact (HyperLedaCache, WikipediaCache).  See
 * `saveJsonCache` for the write side.
 */
import { existsSync, readFileSync } from 'node:fs';

export function loadJsonCache<T extends Record<string, unknown>>(path: string): T {
  if (!existsSync(path)) return {} as T;
  const text = readFileSync(path, 'utf8');
  try {
    return JSON.parse(text) as T;
  } catch {
    process.stderr.write(`warn: JSON cache at ${path} is malformed, starting fresh\n`);
    return {} as T;
  }
}
