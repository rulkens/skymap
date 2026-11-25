import type { CatalogFileProblem } from './CatalogFileProblem';

/** CatalogRead — how reading the chosen files into the catalog worker went. */
export type CatalogRead = { readonly kind: 'held' } | CatalogFileProblem;
