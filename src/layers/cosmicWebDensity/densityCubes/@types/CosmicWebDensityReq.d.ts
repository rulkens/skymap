/** Flat values only: `sameRequest` compares them, so medium and large make equal requests. */
export type CosmicWebDensityReq =
  | { readonly storage: 'pyramid'; readonly binBaseName: string; readonly baseLevel: 1 | 2 }
  | { readonly storage: 'scfd'; readonly binBaseName: string };
