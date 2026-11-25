import type { CatalogFiles } from '../../../../@types/CatalogFiles';
import { MAX_CATALOG_FILE_BYTES } from './MAX_CATALOG_FILE_BYTES';

/** Sorts chosen or dropped files into a loadable set; sizes are checked before anything is read. */
export function readCatalogFiles(
  files: readonly File[],
): CatalogFiles | { readonly kind: 'problem'; readonly message: string } {
  if (files.some((f) => f.size > MAX_CATALOG_FILE_BYTES)) {
    return {
      kind: 'problem',
      message: 'File is larger than 400 MB. Use a smaller sample, or the native build.',
    };
  }
  const named = (ext: string) => files.filter((f) => f.name.toLowerCase().endsWith(ext));
  const [csv] = named('.csv');
  const [bin] = named('.bin');
  const [metadata] = named('.txt');
  if (files.length === 1 && csv) return { kind: 'csv', file: csv };
  if (files.length === 2 && bin && metadata) return { kind: 'packed', bin, metadata };
  return { kind: 'problem', message: 'Choose a .csv file, or a .bin with its _metadata.txt' };
}
