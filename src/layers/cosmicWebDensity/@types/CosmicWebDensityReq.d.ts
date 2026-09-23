import type { Tier } from '../../../@types/data/Tier';

/** `tier` is absent for an untiered row, so the request and the file it names cannot disagree. */
export type CosmicWebDensityReq = { readonly binBaseName: string; readonly tier?: Tier };
