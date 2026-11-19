/**
 * structureLabelSource — the featured structures of one scale (cosmic on COSMO, the Milky Way's
 * on NEAR0), each in its category's style and faded by its category's item. The store's merged
 * list is rebuilt only when a group lands, so its identity is the change signal. A click on a
 * name picks what a click on the ring does: the category's code over the per-category index.
 */

import type { StructureRuntime } from '../../@types/StructureRuntime';
import type { StructureScale } from '../../../../@types/data/structure/StructureScale';
import { labelSource } from '../../../../utils/labels/labelSource';
import { COSMO, NEAR0 } from '../../../../services/engine/frame/slabs';
import { STRUCTURE_IDS_BY_SCALE } from '../../../../data/structure/structureIdsByScale';
import { STRUCTURE_LABEL_STYLES } from '../data/structureLabelStyles';
import { wrapLabelName } from '../utils/wrapLabelName';

export function structureLabelSource(
  runtime: Pick<StructureRuntime, 'store' | 'pickCodes'>,
  scale: StructureScale,
) {
  const categories = STRUCTURE_IDS_BY_SCALE[scale];
  return labelSource({
    slab: scale === 'milkyWay' ? NEAR0 : COSMO,
    toggle: 'structure',
    style: 'galaxyCluster',
    changes: () => runtime.store.all(),
    items: () => runtime.store.all().filter((p) => p.featured && categories.includes(p.category)),
    describe: (p) => ({
      // The store keeps the unwrapped name for the palette and the InfoCard.
      text: wrapLabelName(p.name),
      position: [...p.worldPos],
      subjectRadiusMpc: p.apparentRadiusMpc ?? p.physicalRadiusMpc,
      style: STRUCTURE_LABEL_STYLES[p.category],
      fadeKey: p.category,
      pick: {
        code: runtime.pickCodes.pickCodeOf(p.category),
        index: runtime.store.categoryIndexOf(p.category, p.id),
      },
    }),
  });
}
