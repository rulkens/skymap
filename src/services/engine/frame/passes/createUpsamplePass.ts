/**
 * createUpsamplePass — shared factory behind the HDR upsample content passes:
 * a screen-space blit of a reduced-res offscreen into HDR, ignoring the
 * resolved `SlabView`, gated by one liveness projection its producer shares
 * (see `UpsamplePassRow.d.ts`).
 */

import type { ShowKey } from '../../../../@types/animation/ShowKey';
import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { UpsamplePassRow } from '../../../../@types/engine/frame/UpsamplePassRow';

export function createUpsamplePass<K extends ShowKey = ShowKey>(
  row: UpsamplePassRow<K>,
): ContentPass<K> {
  const erased = row as UpsamplePassRow;
  // The cast bridges `K`'s conditional `fade`: the row's own `fade` and value carry over as-is.
  return {
    name: erased.name,
    fade: erased.fade,
    enabled: (state, ctx, _view, fade) => erased.enabled(state, ctx, fade),
    draw(pass, view, ctx, state) {
      const handle = row.handleOf(state);
      if (handle !== null) {
        handle.draw(pass, ctx.snapshot.renderTargets.viewOf(row.sourceTargetId));
      }
      row.postBlit?.(pass, view, ctx, state);
    },
  } as ContentPass as ContentPass<K>;
}
