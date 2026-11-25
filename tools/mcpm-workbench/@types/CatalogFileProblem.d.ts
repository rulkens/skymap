/** CatalogFileProblem — why the chosen files were refused, as shown to the visitor. */
export type CatalogFileProblem = { readonly kind: 'problem'; readonly message: string };
