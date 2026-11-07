import type { StarCatalogSourceType } from '../../@types/StarCatalogSourceType';
import type { SurveyStarCatalogSourceEntry } from '../../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';

/** One loaded survey catalog with a handed value above 0 this frame — `starSourcesInBand`'s row. */
export type StarSourceInBand = {
  readonly source: StarCatalogSourceType;
  readonly entry: SurveyStarCatalogSourceEntry;
  readonly opacity: number;
};
