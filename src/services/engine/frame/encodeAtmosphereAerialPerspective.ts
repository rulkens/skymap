/**
 * encodeAtmosphereAerialPerspective — the per-frame froxel-volume bake for the
 * one body whose shell encloses the camera (spec §3.4 prep 4): the frame's
 * ONLY write of that body's shell uniform record, sharing `bodyRowSlabs`'
 * `insideAtmosphere` row and so the same `slab.vp` the apply draw reads. No
 * inside body ⇒ no pass, no timing claim (mirrors `encodeAtmosphereSkyView`).
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import { atmosphereDrawList } from './atmosphereDrawList';
import { atmosphereShellUniforms } from './atmosphereShellUniforms';
import { bodyRowSlabs } from './bodyRowSlabs';

export function encodeAtmosphereAerialPerspective(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: PassState,
  claimTimestampWrites?: ClaimTimestampWrites,
): void {
  const renderer = state.gpu.atmosphereShellRenderer;
  if (renderer === null) return;

  const insideRows = bodyRowSlabs(state, ctx).insideAtmosphere;
  if (insideRows.length === 0) return;

  // Same slab resolver as the render line (`aerialPerspectivePass`'s row), so
  // bake and apply share one `slab.vp`.
  const row = ctx.slabs[insideRows[0]!]!;
  const entry = atmosphereDrawList(state, ctx).find((e) => e.inside)!;
  const uniforms = atmosphereShellUniforms(entry, row, ctx, state);

  const pass = encoder.beginComputePass({
    label: 'atmosphere-aerial-bake',
    ...(claimTimestampWrites?.() ?? {}),
  });
  renderer.bakeAerialPerspective(pass, entry.body.id, uniforms);
  pass.end();
}
