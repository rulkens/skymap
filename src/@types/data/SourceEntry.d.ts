import type { SurveySourceEntry } from './SurveySourceEntry';
import type { PoiSourceEntry } from './PoiSourceEntry';

/**
 * One row of the SOURCE_REGISTRY — either a survey (with `.bin` filename,
 * camera depth, band layout, etc.) or a POI (just code + label, no
 * photometry). Discriminated by the `type` field.
 */
export type SourceEntry = SurveySourceEntry | PoiSourceEntry;
