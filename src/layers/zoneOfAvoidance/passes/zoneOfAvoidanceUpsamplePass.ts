/**
 * zoneOfAvoidanceUpsamplePass — composites the reduced-res `zoa` offscreen
 * into HDR, then draws the curved lettering full-res via `postBlit` (MSDF
 * text at reduced res blurs past legibility).
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../@types/ZoneOfAvoidanceRuntime';
import { createUpsamplePass } from '../../../services/engine/frame/passes/createUpsamplePass';
import { deriveZoneOfAvoidanceLiveness } from '../present/deriveZoneOfAvoidanceLiveness';

export function zoneOfAvoidanceUpsamplePass(
  runtime: ZoneOfAvoidanceRuntime,
): ContentPass<'zoneOfAvoidance'> {
  return createUpsamplePass<'zoneOfAvoidance'>({
    name: 'zone-of-avoidance-upsample',
    sourceTargetId: 'zoa',
    fade: 'zoneOfAvoidance',
    handleOf: () => runtime.upsample,
    enabled: (_state, ctx, fade) => deriveZoneOfAvoidanceLiveness(ctx, fade) !== null,
    postBlit(pass, view, ctx, state) {
      const r = state.gpu.label3DRenderer;
      if (r === null || r.glyphCount() === 0) return;
      r.draw(pass, view.vp, view.viewportPx, ctx.drawPxPerRad);
    },
  });
}
