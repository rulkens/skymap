import type { SourceType } from '../../../@types/data/SourceType';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { SurveyStarCatalogSourceEntry } from '../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';

/** One loaded survey catalog inside its crossfade band this frame — `starSourcesInBand`'s row. */
export type StarSourceInBand = {
  readonly source: SourceType;
  readonly catalog: StarCatalog;
  readonly entry: SurveyStarCatalogSourceEntry;
  readonly crossfade: number;
};
