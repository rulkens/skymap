/**
 * UpsamplePassRow — per-subsystem input to `createUpsamplePass`: the fields
 * today's four upsample `ContentPass`s vary on (name, which offscreen to blit,
 * how to fetch this frame's handle, the shared liveness gate), plus the one
 * optional escape hatch — `postBlit` — for a consumer that draws more than a
 * blit into the same pass (ZoA's full-res captions).
 */

import type { Upsample } from '../../rendering/Upsample';
import type { FadeParam } from '../../animation/FadeParam';
import type { ShowKey } from '../../animation/ShowKey';
import type { PassState } from './PassState';
import type { FrameView } from './FrameView';
import type { SlabView } from './SlabView';

// `K` and `fade` forward to the produced `ContentPass<K>`: `enabled` gets its handed value.
export type UpsamplePassRow<K extends ShowKey = ShowKey> = {
  /** Stable identifier, forwarded verbatim to the produced `ContentPass.name`. */
  readonly name: string;
  /** `RenderTargetSpec.id` of the reduced-res offscreen this row blits into HDR. */
  readonly sourceTargetId: string;
  /** This frame's blit handle, or null (pre-bootstrap, or a gate the row owns). */
  handleOf(state: PassState): Upsample | null;
  /** Shared liveness gate; forwarded verbatim to `ContentPass.enabled`. */
  enabled(state: PassState, ctx: FrameView, ...fade: FadeParam<K, ShowKey>): boolean;
  /**
   * Extra draw work after the blit, into the same pass — e.g. ZoA's full-res
   * curved lettering.
   */
  postBlit?(pass: GPURenderPassEncoder, view: SlabView, ctx: FrameView, state: PassState): void;
} & ([ShowKey] extends [K] ? { readonly fade?: K } : { readonly fade: K });
