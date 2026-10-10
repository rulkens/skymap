import { dataEntry } from '../data/dataPages';

/** Where a table row that names entries of ATTRIBUTIONS.md links to: the entry's page for one, their family on the list of all sources for several. */
export function dataRowPath(entries: readonly string[]): string {
  const first = dataEntry(entries[0]!);
  return entries.length === 1 ? first.href : `/docs/data/#${first.family}`;
}
