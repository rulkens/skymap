import type { CatalogFiles } from './CatalogFiles';
import type { CatalogImportSettings } from './CatalogImportSettings';

/**
 * CatalogPreviewInput — what the load dialog's preview reads and derives: the chosen
 * files while the dialog is open, under these settings (null while a field is wrong)
 * and Auto fit percent. `onRefused` hears a file the worker could not read.
 */
export type CatalogPreviewInput = {
  readonly open: boolean;
  readonly files: CatalogFiles | null;
  readonly settings: CatalogImportSettings | null;
  readonly autoFitPercent: number;
  readonly onRefused: (message: string) => void;
};
