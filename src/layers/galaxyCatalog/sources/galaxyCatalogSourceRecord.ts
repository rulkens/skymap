import { sourceRecordOf } from '../../../utils/data/sourceRecordOf';
import { GALAXY_CATALOG_SOURCE_ROWS } from './galaxyCatalogSourceRows';

/** The Layer's rows keyed by id, so its files look up their own entry without the composed registry. */
export const GALAXY_CATALOG_SOURCE_RECORD = sourceRecordOf(GALAXY_CATALOG_SOURCE_ROWS);
