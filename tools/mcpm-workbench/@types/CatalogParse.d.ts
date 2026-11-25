import type { CatalogFiles } from './CatalogFiles';
import type { CatalogLoadOutcome } from './CatalogLoadOutcome';

/**
 * CatalogParse — what the chosen files came to under one set of import
 * settings. It is current while `files` and `settingsKey` match the dialog's;
 * otherwise it is shown dimmed until the next parse replaces it.
 */
export type CatalogParse = {
  readonly files: CatalogFiles;
  readonly settingsKey: string;
  readonly outcome: CatalogLoadOutcome;
};
