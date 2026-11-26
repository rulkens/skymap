/**
 * famousGalaxyLabelSource — one label per famous galaxy, from the famous catalog joined with
 * the compiled-in names: `build-famous` writes both from one seed in one order, so name row `i`
 * names catalog row `i`, which is also the instance index the point batch's pick stamps. A new
 * catalog object (a load or a tier swap) is the change signal. The Milky Way is not a row here.
 */

import type { Vec3 } from '../../../../@types/math/Vec3';
import type { GalaxyCatalogRuntime } from '../../@types/GalaxyCatalogRuntime';
import { labelSource } from '../../../../utils/labels/labelSource';
import { COSMO } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { famousDisplayName } from '../../../../services/engine/helpers/famousDisplayName';
import { famousGalaxyNamesFor } from '../utils/famousGalaxyNamesFor';

export function famousGalaxyLabelSource(
  runtime: Pick<GalaxyCatalogRuntime, 'catalogs' | 'pickCodes'>,
) {
  return labelSource({
    slab: COSMO,
    toggle: 'famousGalaxy',
    style: 'famousGalaxy',
    changes: () => runtime.catalogs.get('famousGalaxy'),
    items: () => {
      const catalog = runtime.catalogs.get('famousGalaxy');
      if (catalog === undefined) return [];
      return (famousGalaxyNamesFor(catalog.count) ?? []).map((name, i) => ({
        text: famousDisplayName(name),
        position: [...catalog.positions.subarray(i * 3, i * 3 + 3)] as Vec3,
        radiusMpc: (catalog.diameterKpc[i]! / 2) * SCALE_UNITS.KPC_TO_MPC,
      }));
    },
    describe: ({ text, position, radiusMpc }, i) => ({
      text,
      position,
      subjectRadiusMpc: radiusMpc,
      pick: { code: runtime.pickCodes.pickCodeOf('famousGalaxy'), index: i },
      fadeKey: 'famousGalaxy',
    }),
  });
}
