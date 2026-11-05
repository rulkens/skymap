import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../../@types/engine/FocusableTarget';

export const earthScenesSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'earthScene' }>,
  Extract<SelectionRow, { type: 'earthScene' }>,
  Extract<FocusableTarget, { type: 'earthScene' }>
>[] = [
  {
    type: 'earthScene',
    focus: BODY_FOCUS,
    mayHaveLabel: () => false,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'earthScene', id: info.id },
    }),
    displayName: (target) => target.label,
  },
];
