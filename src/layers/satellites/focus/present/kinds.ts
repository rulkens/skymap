import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SatelliteRef } from '../../@types/SatelliteRef';
import type { SatelliteSelectionRow } from '../../@types/SatelliteSelectionRow';
import type { SatelliteTarget } from '../../@types/SatelliteTarget';

export const satellitesSelectionKinds: readonly SelectionKindFacts<
  SatelliteRef,
  SatelliteSelectionRow,
  SatelliteTarget
>[] = [
  {
    type: 'satellite',
    focus: BODY_FOCUS,
    mayHaveLabel: () => false,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'satellite', noradId: info.noradId },
    }),
    displayName: (target) => target.label,
  },
];
