import { MILKY_WAY_DISC_RADIUS_KPC } from '../../../../data/milkyWay/galacticCenter';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { MILKY_WAY_INFO } from '../../../../data/milkyWay/milkyWayInfo';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';

export const milkyWaySelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'milkyWay' }>,
  Extract<SelectionRow, { type: 'milkyWay' }>,
  Extract<FocusableTarget, { type: 'milkyWay' }>
>[] = [
  {
    type: 'milkyWay',
    focus: {
      // 0.15 Mpc from the centre at 60° (visual calibration): the whole spiral, seen from outside.
      arrivalSize:
        (MILKY_WAY_DISC_RADIUS_KPC * SCALE_UNITS.KPC_TO_MPC) / (0.15 * Math.tan(Math.PI / 6)),
      flyInto: true,
      ring: { radii: 1, slab: 'cosmo' },
    },
    mayHaveLabel: () => true,
    toFocusable: () => ({ ...MILKY_WAY_INFO, ref: { type: 'milkyWay' } }),
    displayName: (target) => target.displayName,
  },
];
