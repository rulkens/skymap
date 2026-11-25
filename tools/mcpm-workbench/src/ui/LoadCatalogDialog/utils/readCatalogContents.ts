import type { CatalogContents } from '../../../../@types/CatalogContents';
import type { CatalogFiles } from '../../../../@types/CatalogFiles';

/** Reads the chosen files into memory, in the page; nothing is parsed here. */
export async function readCatalogContents(files: CatalogFiles): Promise<CatalogContents> {
  if (files.kind === 'csv') {
    return { kind: 'csv', fileName: files.file.name, text: await files.file.text() };
  }
  const [bin, metadataText] = await Promise.all([files.bin.arrayBuffer(), files.metadata.text()]);
  return { kind: 'packed', fileName: files.bin.name, bin, metadataText };
}
