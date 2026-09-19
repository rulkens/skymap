/**
 * zoneOfAvoidanceUpsamplePass — composites the reduced-res `zoa` offscreen
 * into HDR, then draws the curved lettering full-res via `postBlit` (MSDF
 * text at reduced res blurs past legibility).
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { ZoneOfAvoidanceRuntime } from '../types/ZoneOfAvoidanceRuntime';
import { createUpsamplePass } from '../../../services/engine/frame/passes/createUpsamplePass';
import { deriveZoneOfAvoidanceLiveness } from '../present/deriveZoneOfAvoidanceLiveness';

export function zoneOfAvoidanceUpsamplePass(runtime: ZoneOfAvoidanceRuntime): ContentPass {
  return createUpsamplePass({
    name: 'zone-of-avoidance-upsample',
    sourceTargetId: 'zoa',
    handleOf: () => runtime.upsample,
    enabled(state, ctx) {
      return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
    },
    postBlit(pass, view, _ctx, state) {
      const r = state.gpu.label3DRenderer;
      if (r === null || r.glyphCount() === 0) return;
      r.draw(pass, view.vp, view.viewportPx);
    },
  });
}
