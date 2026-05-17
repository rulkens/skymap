/**
 * readIdSet — read a CSV-style resume cache and return the set of IDs
 * already processed.
 *
 * Used by the long-running fetch scripts (fetch2massXsc, fetchHyperLeda)
 * to resume after a network drop without re-querying every ID.  The
 * file format is "<id>,<rest>\n" with a one-line header; we parse only
 * the first column.
 *
 * Behaviour preserved from the two original implementations:
 *
 *   - Missing file → empty Set (first-run-friendly).
 *   - Header line (index 0) skipped unconditionally.
 *   - Lines with no comma are skipped (defends against truncated rows).
 *   - IDs are trimmed; empty IDs are dropped.
 *   - CRLF tolerated (Vizier exports use CRLF).
 *
 * Why not a generic line-splitter as the spec suggested?  The two
 * callers both need the header-skip and first-column semantics; a
 * naive `text.split('\n')` would silently include the header string
 * ("id" or "pgc") in the Set and break the "already queried" check.
 */
import { existsSync, readFileSync } from 'node:fs';

export function readIdSet(path: string): Set<string> {
  const ids = new Set<string>();
  if (!existsSync(path)) return ids;
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.includes(',')) continue;
    const id = line.slice(0, line.indexOf(',')).trim();
    if (id.length > 0) ids.add(id);
  }
  return ids;
}
