import type { StarCatalogSourceType } from '../../../@types/data/starCatalog/StarCatalogSourceType';
import type { CaptionKind } from '../../../services/engine/presentation/captionPriority';
import type { StarBody } from '../../../@types/scene/StarBody';

/** One captioned seeded catalog: its source code, caption kind and star table —
 *  `produceStarCaptions`' walked roster, one row per catalog that captions. */
export type CaptionSourceRow = {
  readonly source: StarCatalogSourceType;
  readonly kind: CaptionKind;
  readonly stars: readonly StarBody[];
};
