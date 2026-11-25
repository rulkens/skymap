import type { CatalogFiles } from '../../@types/CatalogFiles';
import type { CatalogSource } from '../../@types/CatalogSource';
import { createCsvColumnReader } from '../field/createCsvColumnReader';

/**
 * readCatalogSource — the chosen files into what the worker holds. A CSV
 * streams through the column reader, so its text is never held whole, and
 * stops early at the first problem or once `isCurrent` says a newer read won
 * (then null). Rejects only when the browser cannot read the file.
 */
export async function readCatalogSource(
  files: CatalogFiles,
  isCurrent: () => boolean,
): Promise<CatalogSource | null> {
  if (files.kind === 'packed') {
    const [bin, metadataText] = await Promise.all([files.bin.arrayBuffer(), files.metadata.text()]);
    return { kind: 'packed', fileName: files.bin.name, bin, metadataText };
  }
  const reader = createCsvColumnReader(files.file.size);
  const stream = files.file.stream().getReader();
  for (;;) {
    const { done, value } = await stream.read();
    if (done) break;
    if (!isCurrent()) {
      void stream.cancel();
      return null;
    }
    if (!reader.push(value)) {
      void stream.cancel();
      break;
    }
  }
  return { kind: 'csv', fileName: files.file.name, columns: reader.finish() };
}
