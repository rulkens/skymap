import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';

export const satellitesSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'satellite' }>,
  Extract<SelectionRow, { type: 'satellite' }>,
  Extract<FocusableTarget, { type: 'satellite' }>
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
