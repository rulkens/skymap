import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { StarBody } from '../../../@types/scene/StarBody';
import type { StarCaptionStyle } from './StarCaptionStyle';

/** One captioned seeded catalog: its source code, its item of the `label:starCatalog`
 *  entry, caption style and star table — `produceStarCaptions`' walked roster. */
export type CaptionSourceRow = StarCaptionStyle & {
  readonly source: StarCatalogSourceType;
  readonly item: LabelItemOf<'starCatalog'>;
  readonly stars: readonly StarBody[];
};
