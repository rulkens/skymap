/**
 * The visible extent of a row's bar: where it stops being drawn, past the awaited end for effects
 * that run on their own. A fading cue lasts its `over`, a windowed osc its window, a perpetual osc
 * or a looping spin to the clip's end, a fork as long as its child. Null while the row has no span.
 */
import { effectAt } from '../../draft/utils/effectAt';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';
import type { EffectSpan } from '../../../../../src/@types/animation/EffectSpan';

export function rowTailEndSec(
  effect: Effect,
  path: EffectPath,
  spanAt: (path: EffectPath) => EffectSpan | undefined,
  draft: ClipData,
  clipEndSec: number,
): number | null {
  const span = spanAt(path);
  if (span === undefined) return null;
  switch (effect.kind) {
    case 'show':
    case 'hide':
      return span.startSec + (effect.over ?? 0);
    case 'fade':
      return span.startSec + effect.over;
    case 'osc':
      return effect.over === undefined ? clipEndSec : span.startSec + effect.over;
    case 'spin':
      return effect.loop === true ? clipEndSec : span.endSec;
    case 'fork': {
      const childPath = [...path, 0];
      const child = effectAt(draft, childPath);
      return child === null
        ? span.endSec
        : rowTailEndSec(child, childPath, spanAt, draft, clipEndSec);
    }
    default:
      return span.endSec;
  }
}
