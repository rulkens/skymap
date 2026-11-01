/**
 * Which durable id kind a source's `objIDs` carry, and who answers first when
 * two sources hold the same id (lower `rank` wins: GLADE before 2MRS for a pgc).
 * A row without a claim (famous, Milliquas, DESI) answers no durable id at all,
 * so its synthetic or foreign `objIDs` can never shadow a real catalog id.
 */
export type GalaxyDurableIdClaim = { readonly prefix: 'pgc' | 'sdss'; readonly rank: number };
