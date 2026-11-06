import { BODY_FOCUS } from '../../../../data/selection/bodyFocus';
import type { SelectionKindFacts } from '../../../../@types/engine/layer/SelectionKindFacts';
import type { EarthSceneRef } from '../../@types/EarthSceneRef';
import type { EarthSceneSelectionRow } from '../../@types/EarthSceneSelectionRow';
import type { EarthSceneTarget } from '../../@types/EarthSceneTarget';

export const earthScenesSelectionKinds: readonly SelectionKindFacts<
  EarthSceneRef,
  EarthSceneSelectionRow,
  EarthSceneTarget
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
