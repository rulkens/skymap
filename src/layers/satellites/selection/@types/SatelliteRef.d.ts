/** A satellite is keyed by its NORAD catalog number, which outlives any one day's file. */
export type SatelliteRef = { readonly type: 'satellite'; readonly noradId: number };
