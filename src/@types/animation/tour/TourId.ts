/**
 * TourId — the stable string id of a tour in the tour registry.
 *
 * A closed string-literal union rather than a bare `string`: every authored
 * tour is named here, and `tourRegistry` is typed `Record<TourId, Tour>`, so
 * the union and the registry are checked against each other in both directions.
 * Adding a tour means adding its id here AND a registry entry — TypeScript fails
 * the build if either is missing — and `startTour(id)` only accepts a real id.
 *
 * Append-only in spirit: an id may be referenced from a persisted URL or a
 * shared link, so renaming one silently breaks those. Add new ids; retire old
 * ones deliberately.
 */
export type TourId = 'demo' | 'webShowcase' | 'grandTour';
