/**
 * The settings actions one scene effect stands for: the one write table both scene folds share
 * (the tour's `computeSceneEntering` and a clip's `sceneView`), run through the real settings
 * reducer so neither can drift from what the same writes would do as dispatches. Effects that
 * write no setting (`focus`, `fade`, the structural nodes) contribute nothing.
 */

import type { Action } from '@reduxjs/toolkit';
import type { Effect } from '../../@types/animation/Effect';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import { setOrientation } from '../../state/settings/core/orientationSlice';
import { setVisibilityActionsFor } from '../visibility/setVisibilityActionsFor';

export function sceneActionsOf(effect: Effect, settings: EngineSettingsState): readonly Action[] {
  switch (effect.kind) {
    case 'show':
    case 'hide': {
      const on = effect.kind === 'show';
      return effect.args.flatMap((arg) => setVisibilityActionsFor(settings, arg, on));
    }
    case 'scene':
      return [effect.action];
    case 'frameTo':
      return [setOrientation(effect.frame)];
    default:
      return [];
  }
}
