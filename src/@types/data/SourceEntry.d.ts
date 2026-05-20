import type { SurveyEntry } from './SurveyEntry';
import type { PoiEntry } from './PoiEntry';

/**
 * One row of the SOURCE_REGISTRY — either a survey (with `.bin` filename,
 * camera depth, band layout, etc.) or a POI (just code + label, no
 * photometry). Discriminated by the `type` field.
 */
export type SourceEntry = SurveyEntry | PoiEntry;
