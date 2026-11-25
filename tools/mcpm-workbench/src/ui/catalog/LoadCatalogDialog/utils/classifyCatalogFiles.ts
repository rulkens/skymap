import type { CatalogFileProblem } from '../../../../../@types/catalog/import/CatalogFileProblem';
import type { CatalogFiles } from '../../../../../@types/catalog/import/CatalogFiles';
import { MAX_CATALOG_FILE_BYTES } from '../data/maxCatalogFileBytes.constant';

const TEXT_TABLE = /\.(csv|tsv|txt|dat)$/i;

/** Sorts chosen or dropped files into a loadable set; sizes are checked before anything is read. */
export function readCatalogFiles(files: readonly File[]): CatalogFiles | CatalogFileProblem {
  if (files.some((f) => f.size > MAX_CATALOG_FILE_BYTES)) {
    return {
      kind: 'problem',
      message: 'File is larger than 400 MB. Use a smaller sample, or the native build.',
    };
  }
  const named = (ext: string) => files.filter((f) => f.name.toLowerCase().endsWith(ext));
  const [bin] = named('.bin');
  const [metadata] = named('.txt');
  const [table] = files.filter((f) => TEXT_TABLE.test(f.name));
  if (files.length === 1 && table) return { kind: 'csv', file: table };
  if (files.length === 2 && bin && metadata) return { kind: 'packed', bin, metadata };
  return { kind: 'problem', message: 'Choose a .csv file, or a .bin with its _metadata.txt' };
}
