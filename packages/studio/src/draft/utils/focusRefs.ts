/** The selection ref of every focus effect in a clip that focuses something (not `ref: null`). */
import { effectAt } from './effectAt';
import { effectPaths } from './effectPaths';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { SelectionRefBase } from '../../../../../src/@types/engine/selection/SelectionRefBase';

export function focusRefs(draft: ClipData): SelectionRefBase[] {
  return effectPaths(draft).flatMap((path) => {
    const effect = effectAt(draft, path);
    return effect?.kind === 'focus' && effect.ref !== null ? [effect.ref] : [];
  });
}
