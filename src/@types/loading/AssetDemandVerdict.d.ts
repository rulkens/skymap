/** One row's edges this pass. Both false is the hysteresis gap: keep what is resident, fetch nothing. */
export type AssetDemandVerdict = { readonly demand: boolean; readonly release: boolean };
