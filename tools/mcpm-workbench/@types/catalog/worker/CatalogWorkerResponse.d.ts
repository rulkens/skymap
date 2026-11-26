import type { CatalogPreview } from '../import/CatalogPreview';

/** CatalogWorkerResponse — the catalog worker's answer to the request with the same id. */
export type CatalogWorkerResponse =
  | { readonly kind: 'read'; readonly id: number; readonly problem: string | null }
  | { readonly kind: 'derived'; readonly id: number; readonly preview: CatalogPreview };
