/**
 * Save a generic JSON-file cache used by the famous-galaxy pipeline.
 *
 * Uses 2-space indent for human diffability and creates the parent
 * directory if absent.  Generic over `T extends Record<string, unknown>`
 * to keep the callers' domain types intact.  See `loadJsonCache` for the
 * read side and the cache's overall behaviour.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function saveJsonCache<T extends Record<string, unknown>>(path: string, data: T): void {
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}
