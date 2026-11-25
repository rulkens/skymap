import type { CatalogFileProblem } from '../../@types/CatalogFileProblem';
import type { CatalogImportSettings } from '../../@types/CatalogImportSettings';
import type { ParsedCsvCatalog } from '../../@types/ParsedCsvCatalog';
import { catalogFromCsvColumns } from './catalogFromCsvColumns';
import { createCsvColumnReader } from './createCsvColumnReader';

/** parseCsvCatalog — a whole CSV text into catalog points: both stages in one call. */
export function parseCsvCatalog(
  text: string,
  settings: CatalogImportSettings,
): ParsedCsvCatalog | CatalogFileProblem {
  const bytes = new TextEncoder().encode(text);
  const reader = createCsvColumnReader(bytes.length);
  reader.push(bytes);
  return catalogFromCsvColumns(reader.finish(), settings);
}
