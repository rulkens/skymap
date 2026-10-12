import type { SourceType } from '../../../@types/data/SourceType';
import type { SurveyStarCatalogSourceEntry } from '../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';

/** One loaded survey catalog inside its crossfade band this frame — `starSourcesInBand`'s row. */
export type StarSourceInBand = {
  readonly source: SourceType;
  readonly entry: SurveyStarCatalogSourceEntry;
  readonly crossfade: number;
};
