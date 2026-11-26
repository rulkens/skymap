import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { AsteroidRef } from './@types/AsteroidRef';
import type { AsteroidSelectionRow } from './@types/AsteroidSelectionRow';
import type { AsteroidTarget } from './@types/AsteroidTarget';

export const asteroidsSelectionKinds: readonly SelectionKindFacts<
  AsteroidRef,
  AsteroidSelectionRow,
  AsteroidTarget
>[] = [
  {
    type: 'asteroid',
    focus: BODY_FOCUS,
    mayHaveLabel: () => false,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'asteroid', number: info.number },
    }),
    displayName: (target) => target.label,
  },
];
