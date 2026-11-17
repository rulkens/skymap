/**
 * starLabelSource — captions for the curated star map and the Sun (the S-stars bear no label).
 * Each caption fades by its own catalog's item of the `label:starCatalog` value, so the Sun and
 * the star map switch independently, and picks what a click on its star does.
 */

import type { CaptionSourceRow } from '../@types/CaptionSourceRow';
import type { StarCatalogRuntime } from '../../@types/StarCatalogRuntime';
import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { footprintRadiusMpc } from '../../../../utils/selection/footprintRadiusMpc';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../seededStars/data/seededStarCatalogsBySource';
import { bodyFootprintRadiusM } from '../../../../utils/scene/bodyFootprintRadiusM';
import { isKeyOf } from '../../../../utils/object/isKeyOf';
import { STAR_CAPTION_STYLES } from './starCaptionStyles';

const CAPTION_SOURCE_ROWS: readonly CaptionSourceRow[] = [
  ...SEEDED_STAR_CATALOGS_BY_SOURCE,
].flatMap(([source, row]): readonly CaptionSourceRow[] =>
  isKeyOf(STAR_CAPTION_STYLES, row.id)
    ? [{ source, item: row.id, ...STAR_CAPTION_STYLES[row.id], stars: row.stars }]
    : [],
);

const CAPTIONED = CAPTION_SOURCE_ROWS.flatMap((row) =>
  row.stars.map((star, seedIndex) => ({ row, star, seedIndex })),
);

export function starLabelSource(runtime: Pick<StarCatalogRuntime, 'pickCodes'>) {
  return labelSource({
    slab: NEAR0,
    toggle: 'starCatalog',
    style: 'caption',
    items: () => CAPTIONED,
    describe: ({ row, star, seedIndex }) => ({
      text: star.label,
      position: { anchorId: star.id },
      subjectRadiusMpc: footprintRadiusMpc({ footprintRadiusM: bodyFootprintRadiusM(star) }),
      color: [star.color[0], star.color[1], star.color[2], 1],
      priority: row.priority,
      pick: { code: runtime.pickCodes.pickCodeOf(row.source), index: seedIndex },
      fadeKey: row.item,
      ...(row.revealBand && { revealBand: row.revealBand }),
    }),
  });
}
