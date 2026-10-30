import { GALAXY_CATALOG_SOURCE_ROWS } from './galaxyCatalogSourceRows';

/** Galaxy catalog codes, `GALAXY_CATALOG_SOURCE_ROWS` order — see that file. */
export const GALAXY_CATALOG_SOURCES: readonly (typeof GALAXY_CATALOG_SOURCE_ROWS)[number][0][] =
  GALAXY_CATALOG_SOURCE_ROWS.map(([code]) => code);
