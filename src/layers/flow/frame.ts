/**
 * frame — reconcile the renderer's mode/count against the live settings (arms
 * a reseed on either change, mirroring `milkyWayCloud.reconcile`), then return
 * the awake vote `shouldKeepTicking` used to read off core
 * (`settings.flow.enabled && slotReady(assetSlots.flow)`) — now a runtime read.
 */

import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { FlowRuntime } from './types/FlowRuntime';
import { slotReady } from '../../services/loading/slotReady';

export function frame(runtime: FlowRuntime): (ctx: ReadyFrameContext, state: PassState) => boolean {
  return (_ctx, state) => {
    runtime.renderer.reconcile(state.settings.flow);
    return state.settings.flow.enabled && slotReady(runtime.slot);
  };
}
