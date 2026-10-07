import { dataEntry } from '../data/dataPages';

/**
 * Where a table row that names entries of ATTRIBUTIONS.md links to on the
 * data pages: the entry's own page for one, and for several (the moons' maps)
 * their family on the list of all sources.
 */
export function dataRowPath(entries: readonly string[]): string {
  const first = dataEntry(entries[0]!);
  return entries.length === 1 ? first.href : `/docs/data/#${first.family}`;
}
