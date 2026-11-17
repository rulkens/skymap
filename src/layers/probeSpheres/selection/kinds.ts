import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { ProbeSphereRef } from './@types/ProbeSphereRef';
import type { ProbeSphereSelectionRow } from './@types/ProbeSphereSelectionRow';
import type { ProbeSphereTarget } from './@types/ProbeSphereTarget';

export const probeSpheresSelectionKinds: readonly SelectionKindFacts<
  ProbeSphereRef,
  ProbeSphereSelectionRow,
  ProbeSphereTarget
>[] = [
  {
    type: 'probeSphere',
    focus: BODY_FOCUS,
    mayHaveLabel: () => false,
    toFocusable: ({ driver: _driver, ...info }) => ({
      ...info,
      ref: { type: 'probeSphere', id: info.id },
    }),
    displayName: (target) => target.label,
  },
];
