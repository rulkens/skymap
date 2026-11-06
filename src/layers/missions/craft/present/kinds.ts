import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { CraftRef } from '../../@types/CraftRef';
import type { CraftSelectionRow } from '../../@types/CraftSelectionRow';
import type { CraftTarget } from '../../@types/CraftTarget';

export const missionsSelectionKinds: readonly SelectionKindFacts<
  CraftRef,
  CraftSelectionRow,
  CraftTarget
>[] = [
  {
    type: 'craft',
    focus: BODY_FOCUS,
    mayHaveLabel: () => true,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'craft', id: info.id },
    }),
    displayName: (target) => target.label,
  },
];
