import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { SurveyStarCatalogSourceEntry } from '../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';

/** One loaded survey catalog inside its crossfade band this frame — `starSourcesInBand`'s row. */
export type StarSourceInBand = {
  readonly source: StarCatalogSourceType;
  readonly entry: SurveyStarCatalogSourceEntry;
  readonly crossfade: number;
};
