import type { SceneEffect } from '../SceneEffect';

/** A settings write a clip's scene makes from `atSec` on; `sceneView` folds the applied ones over intent. */
export type SceneStep = {
  readonly atSec: number;
  readonly effect: Extract<SceneEffect, { kind: 'show' | 'hide' | 'scene' | 'frameTo' }>;
};
