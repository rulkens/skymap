/** The row ids a freshly opened draft starts folded: every flyPath past `FOLD_WAYPOINTS_OVER` waypoints (Q20). */
import { rowKey } from '../../draft/utils/rowKey';
import { FOLD_WAYPOINTS_OVER } from '../data/studioLimits';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';
import type { Effect } from '../../../../../src/@types/animation/Effect';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export function defaultCollapsed(draft: ClipData): string[] {
  const walk = (effects: readonly Effect[], parent: EffectPath): string[] =>
    effects.flatMap((effect, index) => {
      const path = [...parent, index];
      if (effect.kind === 'flyPath') {
        return effect.waypoints.length > FOLD_WAYPOINTS_OVER
          ? [rowKey({ kind: 'effect', path })]
          : [];
      }
      if (effect.kind === 'seq' || effect.kind === 'all') return walk(effect.children, path);
      return effect.kind === 'fork' ? walk([effect.child], path) : [];
    });
  return walk(draft.timeline, []);
}
