/**
 * createUpsamplePass — shared factory behind the HDR upsample content passes:
 * a screen-space blit of a reduced-res offscreen into HDR, ignoring the
 * resolved `SlabView`, gated by one liveness projection its producer shares
 * (see `UpsamplePassRow.d.ts`). `postBlit` guards itself independently of
 * the blit handle — a missing handle must never suppress it.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { UpsamplePassRow } from '../../../../@types/engine/frame/UpsamplePassRow';

export function createUpsamplePass(row: UpsamplePassRow): ContentPass {
  return {
    name: row.name,
    enabled: row.enabled,
    draw(pass, view, ctx, state) {
      const handle = row.handleOf(state);
      if (handle !== null) {
        handle.draw(pass, ctx.renderTargets.viewOf(row.sourceTargetId));
      }
      row.postBlit?.(pass, view, ctx, state);
    },
  };
}
