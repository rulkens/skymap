import type { LabelItemOf } from '../../../@types/animation/LabelItemOf';
import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';
import type { StarBody } from '../../../@types/scene/StarBody';

/** One captioned seeded catalog: its source code, its item of the `label:starCatalog`
 *  entry, caption kind and star table — `produceStarCaptions`' walked roster. */
export type CaptionSourceRow = {
  readonly source: StarCatalogSourceType;
  readonly item: LabelItemOf<'starCatalog'>;
  readonly kind: CaptionKind;
  readonly stars: readonly StarBody[];
};
