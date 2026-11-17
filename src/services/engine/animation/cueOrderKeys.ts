/**
 * cueOrderKeys — the settings a cue overwrites, as strings, mirroring what
 * `computeSceneEntering` folds: show/hide one key per arg, `scene` its action type.
 * fade/focus/frameTo are not folded there, so their order cannot diverge.
 */
import type { SceneCue } from '../../../@types/animation/compiledClip/SceneCue';

export function cueOrderKeys({ effect }: SceneCue): string[] {
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
