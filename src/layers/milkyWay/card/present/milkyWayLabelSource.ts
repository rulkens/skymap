/**
 * milkyWayLabelSource — "You are here" at the origin, lifted off it by the Milky Way's 15 kpc
 * disc radius (the origin has no catalog row to read one from). The label entry's distance band
 * keeps it from drawing where the origin cannot project. Its pick is the disc impostor's.
 */

import { labelSource } from '../../../../utils/labels/labelSource';
import { COSMO } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';

const MILKY_WAY_RADIUS_KPC = 15;

export function milkyWayLabelSource(pickCode: number) {
  return labelSource({
    slab: COSMO,
    toggle: 'milkyWay',
    style: 'milkyWay',
    items: () => [0],
    describe: () => ({
      text: 'You are here',
      position: [0, 0, 0],
      subjectRadiusMpc: MILKY_WAY_RADIUS_KPC * SCALE_UNITS.KPC_TO_MPC,
      pick: { code: pickCode, index: 0 },
    }),
  });
}
