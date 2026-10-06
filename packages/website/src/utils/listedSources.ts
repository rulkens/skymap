import type { Fact } from '../@types/Fact';

/** The rows a page's Sources list prints: science claims only, unless `all` is set (the Privacy page, whose statements are about the app). */
export function listedSources(rows: readonly Fact[], all: boolean): Fact[] {
  return all ? [...rows] : rows.filter((row) => row.about !== 'app');
}
