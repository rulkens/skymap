import type { LabelItemOf } from '../../../../@types/animation/LabelItemOf';
import type { StarCatalogId } from '../../@types/StarCatalogId';
import type { StarBody } from '../../../../@types/scene/StarBody';
import type { StarCaptionStyle } from './StarCaptionStyle';

/** One captioned seeded catalog: its source id, its item of the `label:starCatalog`
 *  entry, caption style and star table — `produceStarCaptions`' walked roster. */
export type CaptionSourceRow = StarCaptionStyle & {
  readonly source: StarCatalogId;
  readonly item: LabelItemOf<'starCatalog'>;
  readonly stars: readonly StarBody[];
};
