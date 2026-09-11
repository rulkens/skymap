/**
 * UpsamplePassRow — per-subsystem input to `createUpsamplePass`: the fields
 * today's four upsample `ContentPass`s vary on (name, which offscreen to blit,
 * how to fetch this frame's handle, the shared liveness gate), plus the one
 * optional escape hatch — `postBlit` — for a consumer that draws more than a
 * blit into the same pass (ZoA's full-res captions). `blend: 'additive'` is
 * NOT here: every row shares it, so the factory bakes it in rather than
 * repeating it per row.
 */

import type { Upsample } from '../../rendering/Upsample';
import type { PassState } from './PassState';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { SlabView } from './SlabView';

export type UpsamplePassRow = {
  /** Stable identifier, forwarded verbatim to the produced `ContentPass.name`. */
  readonly name: string;
  /** `RenderTargetSpec.id` of the reduced-res offscreen this row blits into HDR. */
  readonly sourceTargetId: string;
  /** This frame's blit handle, or null (pre-bootstrap, or a gate the row owns). */
  handleOf(state: PassState): Upsample | null;
  /** Shared liveness gate; forwarded verbatim to `ContentPass.enabled`. */
  enabled(state: PassState, ctx: ReadyFrameContext): boolean;
  /**
   * Extra draw work after the blit, into the same pass — e.g. ZoA's full-res
   * curved lettering. Runs regardless of whether `handleOf` returned a
   * handle this frame: the blit and `postBlit` guard themselves
   * independently (see `zoneOfAvoidanceUpsamplePass.ts:30-38`), so one
   * being absent must never suppress the other.
   */
  postBlit?(
    pass: GPURenderPassEncoder,
    view: SlabView,
    ctx: ReadyFrameContext,
    state: PassState,
  ): void;
};
