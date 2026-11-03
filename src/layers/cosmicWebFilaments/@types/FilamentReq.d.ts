/**
 * The request shape `filamentFetcher` accepts: which of the two skeleton files to
 * fetch, not the store's tier — medium and large share `filaments.bin`, so a tier
 * would make the request drift across a flip that changes nothing.
 */
export type FilamentReq = { small: boolean };
