/**
 * The longest prefix of `path` that names an effect in the draft, or null when none does. A compile
 * error can name a node that exists only in the resolved clip (a lookAtId resolves to an `all` of
 * two tweens), and the draft row to mark is that node's nearest ancestor.
 */
import { effectAt } from '../../draft/utils/effectAt';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export function trimToDraftPath(draft: ClipData, path: EffectPath): EffectPath | null {
  for (let length = path.length; length > 0; length--) {
    const prefix = path.slice(0, length);
    if (effectAt(draft, prefix) !== null) return prefix;
  }
  return null;
}
