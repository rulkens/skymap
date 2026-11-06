import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { BodyRef } from '../../../@types/engine/selection/BodyRef';
import type { BodySelectionRow } from '../../../@types/engine/selection/BodySelectionRow';
import type { BodyTarget } from '../@types/BodyTarget';

export const bodySelectionKinds: readonly SelectionKindFacts<
  BodyRef,
  BodySelectionRow,
  BodyTarget
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
