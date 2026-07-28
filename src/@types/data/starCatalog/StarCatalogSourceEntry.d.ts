import type { SurveyStarCatalogSourceEntry } from './SurveyStarCatalogSourceEntry';
import type { SeededStarCatalogSourceEntry } from './SeededStarCatalogSourceEntry';

/**
 * StarCatalog-typed row of the SOURCE_REGISTRY — a star set the user toggles
 * as a unit, keying `settings.starCatalogs.items`.
 *
 * Two variants, discriminated by `binBaseName`: a SURVEY catalog streams
 * tiered `.bin` point clouds from disk (`binBaseName: string`), while a SEEDED
 * catalog is built in code from the body store (`binBaseName: null`) and so
 * carries none of the loader's fields. Readers that need a filename narrow on
 * `binBaseName !== null`; readers that only need the shared visibility/label
 * axes need no narrowing at all, which is the common case.
 */
export type StarCatalogSourceEntry = SurveyStarCatalogSourceEntry | SeededStarCatalogSourceEntry;
