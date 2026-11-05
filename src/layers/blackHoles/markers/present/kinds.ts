import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';

export const blackHolesSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'blackHole' }>,
  Extract<SelectionRow, { type: 'blackHole' }>,
  Extract<FocusableTarget, { type: 'blackHole' }>
>[] = [
  {
    type: 'blackHole',
    focus: {
      // 30.4 r_s away at 60°, the arrival the user framed live (2026-09-01): outside the
      // 2 r_s descent floor and deep inside the lensing fade band.
      arrivalSize: 1 / (30.4 * Math.tan(Math.PI / 6)),
      flyInto: false,
      // The footprint is r_s, so the ring hugs the horizon.
      ring: { radii: 1, slab: 'near0' },
    },
    mayHaveLabel: () => true,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'blackHole', id: info.id },
    }),
    displayName: (target) => target.label,
  },
];
