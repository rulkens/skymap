/**
 * UpsampleLayerRow — per-subsystem input to `createUpsampleLayer`: the four
 * fields today's four upsample `ContentLayer`s vary on (name, slab, which
 * offscreen to blit, how to fetch this frame's handle, the shared liveness
 * gate), plus the one optional escape hatch — `postBlit` — for a consumer
 * that draws more than a blit into the same pass (ZoA's full-res captions).
 * `target: 'hdr'` and `blend: 'additive'` are NOT here: every row shares
 * them, so the factory bakes them in rather than repeating them per row.
 */

import type { Upsample } from '../../rendering/Upsample';
import type { EngineState } from '../state/EngineState';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { SlabView } from './SlabView';

export type UpsampleLayerRow = {
  /** Stable identifier, forwarded verbatim to the produced `ContentLayer.name`. */
  readonly name: string;
  /** Index into the per-frame slab list, forwarded to `ContentLayer.slab`. */
  readonly slab: number;
  /** `RenderTargetSpec.id` of the reduced-res offscreen this row blits into HDR. */
  readonly sourceTargetId: string;
  /** This frame's blit handle, or null (pre-bootstrap, or a gate the row owns). */
  handleOf(state: EngineState): Upsample | null;
  /** Shared liveness gate; forwarded verbatim to `ContentLayer.enabled`. */
  enabled(state: EngineState, ctx: ReadyFrameContext): boolean;
  /**
   * Extra draw work after the blit, into the same pass — e.g. ZoA's full-res
   * curved lettering. Runs regardless of whether `handleOf` returned a
   * handle this frame: the blit and `postBlit` guard themselves
   * independently (see `zoneOfAvoidanceUpsampleLayer.ts:30-38`), so one
   * being absent must never suppress the other.
   */
  postBlit?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: EngineState,
  ): void;
};
