/**
 * frame — reconcile the renderer's mode/count against the live settings (arms
 * a reseed on either change, mirroring `milkyWayCloud.reconcile`), then vote.
 */

import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { LayerFrameVote } from '../../@types/engine/layer/LayerFrameVote';
import type { FlowRuntime } from './types/FlowRuntime';
import { slotReady } from '../../services/loading/slotReady';

export function frame(
  runtime: FlowRuntime,
): (ctx: ReadyFrameContext, state: PassState) => LayerFrameVote {
  return (_ctx, state) => {
    runtime.renderer.reconcile(state.settings.flow);
    return {
      // The term `shouldKeepTicking` used to read off core
      // (`settings.flow.enabled && slotReady(assetSlots.flow)`), now a runtime read.
      awake: state.settings.flow.enabled && slotReady(runtime.slot),
      // Never settling, though the ribbons advect forever: flow draws in no
      // capture roster, so nothing it does can stale a sky bake.
      settling: false,
    };
  };
}
