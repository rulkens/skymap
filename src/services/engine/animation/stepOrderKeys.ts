/**
 * stepOrderKeys — the settings a scene step overwrites, as strings, mirroring what
 * `computeSceneEntering` keeps of its fold: show/hide one key per arg, `scene` its
 * action type. A `frameTo` folds into `orientation`, which the fold's capture drops,
 * so its order cannot diverge.
 */
import type { SceneStep } from '../../../@types/animation/compiledClip/SceneStep';

export function stepOrderKeys({ effect }: SceneStep): string[] {
  switch (effect.kind) {
    case 'show':
    case 'hide':
      return effect.args.map((arg) => `layer:${JSON.stringify(arg)}`);
    case 'scene':
      return [`scene:${effect.action.type}`];
    default:
      return [];
  }
}
