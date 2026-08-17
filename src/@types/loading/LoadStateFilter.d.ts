/**
 * Which header tally the asset-loading rows are currently restricted to.
 * `null` means "show everything" (the default, unfiltered view).
 *
 * `inFlight` is NOT a `LoadState['kind']` — it's the header's fold of
 * `loading` + `committing`, the same pair `aggregateRegistry` treats as "still
 * working" — so the filter domain is deliberately its own union rather than a
 * subset of the state kinds.
 */
export type LoadStateFilter = 'idle' | 'ready' | 'error' | 'inFlight' | null;
