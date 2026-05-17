/**
 * Generic JSON-file cache used by the famous-galaxy pipeline.
 *
 * Both current callers (fetchFamousImages, expandFamousFromCatalogs)
 * cache small key→string maps on disk to avoid repeating expensive
 * network lookups between runs.  The behaviour is identical between
 * them and is faithfully preserved here:
 *
 *   - Missing file → `{}` (first-run-friendly: no need to seed).
 *   - Malformed JSON → warn on stderr and return `{}` (matches the
 *     existing warn-and-continue behaviour; throwing would break a
 *     resume after a partial write).
 *   - Save uses 2-space indent for human diffability and creates the
 *     parent directory if absent.
 *
 * Generic over `T extends Record<string, unknown>` to keep the callers'
 * domain types intact (HyperLedaCache, WikipediaCache).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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

export function saveJsonCache<T extends Record<string, unknown>>(path: string, data: T): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}
