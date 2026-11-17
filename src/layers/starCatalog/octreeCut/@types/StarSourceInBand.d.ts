import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { SurveyStarCatalogSourceEntry } from '../../../../@types/data/starCatalog/SurveyStarCatalogSourceEntry';

/** One loaded survey catalog with a handed value above 0 this frame — `starSourcesInBand`'s row. */
export type StarSourceInBand = {
  readonly source: StarCatalogId;
  readonly entry: SurveyStarCatalogSourceEntry;
  readonly opacity: number;
};
