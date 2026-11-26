/**
 * CatalogImportSettings — how a loaded file's columns are read, as chosen in
 * the import dialog. Kept beside the points so the export can say how they
 * were made.
 */
export type CatalogImportSettings = {
  readonly format:
    | { readonly kind: 'cartesianMpc' }
    | { readonly kind: 'raDecRedshift'; readonly h0KmSMpc: number; readonly omegaM: number };
  readonly weight:
    | { readonly kind: 'linear'; readonly scale: number } // stored = column × scale
    | { readonly kind: 'log10MassMsun' }; // stored = massWeightFromLog10(column)
};
