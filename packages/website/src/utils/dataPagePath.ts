import { dataEntry } from '../data/dataPages';

/**
 * The site path of one source on the data pages, by its entry id in
 * ATTRIBUTIONS.md: its own page, or its section of the page its family shares
 * (`/docs/data/code/#mulberry32`). The pages are built from the same table
 * (data/dataPages.ts), and an id the record does not have throws.
 */
export function dataPagePath(id: string): string {
  return dataEntry(id).href;
}
