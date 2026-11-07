/**
 * hasDuration — whether an effect awaits time, decided from the tree alone.
 *
 * `seq` overlap counts joins between steps that have a duration, and has to
 * know that before it walks them. Zero-length effects (cues, fork, osc) fire at
 * the start of the next step with a duration instead of being a join of their own.
 */
import type { Effect } from '../../../@types/animation/Effect';

export function hasDuration(effect: Effect): boolean {
  switch (effect.kind) {
    case 'hold':
    case 'wait':
      return effect.sec > 0;
    case 'set':
    case 'setVec':
    case 'spin':
    case 'rate':
      return effect.over > 0;
    case 'flyPath':
      return true;
    case 'geodesic':
      return effect.over === undefined || effect.over > 0;
    case 'seq':
    case 'all':
      return effect.children.some(hasDuration);
    case 'osc':
    case 'fork':
    case 'show':
    case 'hide':
    case 'fade':
    case 'scene':
    case 'focus':
    case 'frameTo':
      return false;
    default:
      throw new Error(`resolveClipFoci must run before compileClip (unresolved ${effect.kind})`);
  }
}
