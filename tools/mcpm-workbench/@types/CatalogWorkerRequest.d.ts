import type { CatalogFiles } from './CatalogFiles';
import type { CatalogImportSettings } from './CatalogImportSettings';

/**
 * CatalogWorkerRequest — what the page asks the catalog worker. A `read` or a
 * `drop` supersedes every earlier request; a `derive` supersedes earlier derives
 * and applies to the latest read before it.
 */
export type CatalogWorkerRequest =
  | { readonly kind: 'read'; readonly id: number; readonly files: CatalogFiles }
  | {
      readonly kind: 'derive';
      readonly id: number;
      readonly settings: CatalogImportSettings;
      readonly autoFitPercent: number;
    }
  | { readonly kind: 'drop' };
