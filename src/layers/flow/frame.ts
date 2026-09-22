/**
 * flowPlanner — reconcile the renderer's mode/count against the live settings
 * (arms a reseed on either change, mirroring `milkyWayCloud.reconcile`), then
 * vote. `once`-scope: nothing here reads a per-view value.
 */

import type { ContentPlanner } from '../../@types/engine/frame/ContentPlanner';
import type { FlowRuntime } from './@types/FlowRuntime';
import { slotReady } from '../../services/loading/slotReady';

export function flowPlanner(runtime: FlowRuntime): ContentPlanner<void> {
  return {
    name: 'flow',
    scope: 'once',
    plan: (_snapshot, _views, state) => {
      runtime.renderer.reconcile(state.settings.flow);
      return {
        value: undefined,
        // The term `shouldKeepTicking` used to read off core
        // (`settings.flow.enabled && slotReady(assetSlots.flow)`), now a runtime read.
        awake: state.settings.flow.enabled && slotReady(runtime.slot),
        // Never settling, though the ribbons advect forever: flow draws in no
        // capture roster, so nothing it does can stale a sky bake.
        settling: false,
      };
    },
  };
}
