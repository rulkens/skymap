/** The row ids a freshly opened draft starts folded: every flyPath past `FOLD_WAYPOINTS_OVER` waypoints (Q20). */
import { effectAt } from '../../draft/utils/effectAt';
import { effectPaths } from '../../draft/utils/effectPaths';
import { rowKey } from '../../draft/utils/rowKey';
import { FOLD_WAYPOINTS_OVER } from '../data/studioLimits';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

export function defaultCollapsed(draft: ClipData): string[] {
  return effectPaths(draft)
    .filter((path) => {
      const effect = effectAt(draft, path);
      return effect?.kind === 'flyPath' && effect.waypoints.length > FOLD_WAYPOINTS_OVER;
    })
    .map((path) => rowKey({ kind: 'effect', path }));
}
