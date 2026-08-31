/**
 * createUpsampleLayer — shared factory behind the four HDR upsample content
 * layers (volume, star-aggregate, milky-way, zone-of-avoidance): a
 * screen-space blit of a reduced-res offscreen into HDR, ignoring the
 * resolved `SlabView`, gated by one liveness projection its producer shares
 * (see `UpsampleLayerRow.d.ts`). `postBlit` is an escape hatch for extra
 * draw work in the same pass — unused by any row today (the ZoA lettering
 * that once rode it moved to its own `labels3dLayer`) — and guards itself
 * independently of the blit handle: a missing handle must never suppress it.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { UpsampleLayerRow } from '../../../../@types/engine/frame/UpsampleLayerRow';

export function createUpsampleLayer(row: UpsampleLayerRow): ContentLayer {
  return {
    name: row.name,
    slab: row.slab,
    target: 'hdr',
    blend: 'additive',
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
