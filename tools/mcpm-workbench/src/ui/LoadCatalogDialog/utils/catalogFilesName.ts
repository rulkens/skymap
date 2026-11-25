import type { CatalogFiles } from '../../../../@types/CatalogFiles';

export function catalogFilesName(files: CatalogFiles): string {
  return files.kind === 'csv' ? files.file.name : `${files.bin.name} + ${files.metadata.name}`;
}
