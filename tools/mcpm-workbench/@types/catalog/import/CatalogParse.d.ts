import type { CatalogFiles } from './CatalogFiles';
import type { CatalogPreview } from './CatalogPreview';

/**
 * CatalogParse — what the chosen files came to under one set of import
 * settings and Auto fit percent. It is current while `files` and `settingsKey`
 * match the dialog's; otherwise it is shown dimmed until the next one replaces it.
 */
export type CatalogParse = {
  readonly files: CatalogFiles;
  readonly settingsKey: string;
  readonly preview: CatalogPreview;
};
