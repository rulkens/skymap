import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

export const bodySelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'body' }>,
  Extract<SelectionRow, { type: 'body' }>,
  Extract<FocusableTarget, { type: 'body' }>
>[] = [
  {
    type: 'body',
    focus: BODY_FOCUS,
    mayHaveLabel: () => true,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'body', id: info.id },
    }),
    displayName: (target) => target.label,
  },
];
