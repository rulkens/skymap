import { GALAXY_CATALOG_SOURCE_ROWS } from './galaxyCatalogSourceRows';

/** Galaxy catalog ids, `GALAXY_CATALOG_SOURCE_ROWS` order — see that file. */
export const GALAXY_CATALOG_SOURCES: readonly (typeof GALAXY_CATALOG_SOURCE_ROWS)[number]['id'][] =
  GALAXY_CATALOG_SOURCE_ROWS.map((entry) => entry.id);
