import { sourceRecordOf } from '../../../utils/data/sourceRecordOf';
import { STAR_CATALOG_SOURCE_ROWS } from './starCatalogSourceRows';

/** The Layer's rows keyed by id, so its files look up their own entry without the composed registry. */
export const STAR_CATALOG_SOURCE_RECORD = sourceRecordOf(STAR_CATALOG_SOURCE_ROWS);
