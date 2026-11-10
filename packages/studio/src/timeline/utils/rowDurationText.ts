/**
 * A row's Duration column. Cues that fade (`show`, `hide`, `fade`) show their `over` although the
 * compiler does not await it; a perpetual `osc` and a fork of one say `end`; a looping spin `∞`.
 * Everything else is the awaited window from the compiler's span, and `–` while it has none.
 */
import { formatQuantity } from '../../utils/format/formatQuantity';
import { effectAt } from '../../draft/utils/effectAt';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';
import type { EffectSpan } from '../../../../../src/@types/animation/EffectSpan';

export function rowDurationText(
  effect: Effect,
  path: EffectPath,
  spanAt: (path: EffectPath) => EffectSpan | undefined,
  draft: ClipData,
): string {
  const span = spanAt(path);
  if (span === undefined) return '–';
  switch (effect.kind) {
    case 'show':
    case 'hide':
      return formatQuantity(effect.over ?? 0, 's');
    case 'fade':
      return formatQuantity(effect.over, 's');
    case 'osc':
      return effect.over === undefined ? 'end' : formatQuantity(effect.over, 's');
    case 'spin':
      if (effect.loop === true) return '∞';
      break;
    case 'fork': {
      const childPath = [...path, 0];
      const child = effectAt(draft, childPath);
      return child === null ? '–' : rowDurationText(child, childPath, spanAt, draft);
    }
  }
  return formatQuantity(span.endSec - span.startSec, 's');
}
