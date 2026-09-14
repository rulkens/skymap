/**
 * encodeAtmosphereFroxel — the per-frame aerial-perspective bake, a compute step
 * in the prelude of the frame's single encoder. It runs for the ONE body the
 * camera is inside and dispatches nothing otherwise. The record comes from the
 * SAME `atmosphereShellUniforms` builder the apply reads, which is what makes
 * the bake's rays and the apply's rays the same rays, per texel.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { atmosphereDrawList } from './atmosphereDrawList';
import { atmosphereShellUniforms } from './atmosphereShellUniforms';

export function encodeAtmosphereFroxel(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
): void {
  const renderer = state.gpu.atmosphereShellRenderer;
  if (renderer === null) return;

  const entry = atmosphereDrawList(state, ctx).find((e) => e.inside);
  if (entry === undefined) return;

  // The body's own `body-m` row carries the `vp` the record's MVP pair needs.
  const slab = ctx.slabs.find(
    (row) => row.frame.kind === 'body-m' && row.frame.bodyId === entry.body.id,
  );
  if (slab === undefined) return;

  renderer.encodeFroxel(encoder, entry.body.id, atmosphereShellUniforms(entry, slab, ctx, state));
}
