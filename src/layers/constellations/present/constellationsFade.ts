/**
 * constellationsFade — full per-frame opacity: `constellationsBand` times
 * the layer's fade-registry/toggle opacity. What `draw()` and the caption
 * producer paint with; `enabled()` wants the band alone (see that file).
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { constellationsBand } from './constellationsBand';
import { resolveLayerOpacity } from '../../../services/engine/presentation/focusRecession';

// `resolveLayerOpacity` reads the frame's clock off `ctx.snapshot`, so this
// forwards the whole view rather than narrowing to drawCamPos/focusBlend/nowMs.
export function constellationsFade(state: Pick<EngineState, 'subsystems'>, ctx: FrameView): number {
  return constellationsBand(ctx) * resolveLayerOpacity(state, ctx, { kind: 'constellations' });
}
