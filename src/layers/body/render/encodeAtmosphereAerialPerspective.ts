/**
 * encodeAtmosphereAerialPerspective — the per-frame froxel-volume bake for the
 * one body whose shell encloses the camera: the frame's ONLY write of that body's
 * shell uniform record, from `bodyRowSlabs`' `insideAtmosphere` row, so the same
 * `slab.vp` the apply draw reads. No inside body ⇒ no pass, no timing claim. The
 * row's band has no foreground-distance gate but the draw list does, so an open
 * line can still find no entry: that bakes nothing too.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { AtmosphereShellRenderer } from '../@types/AtmosphereShellRenderer';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import { atmosphereDrawList } from '../present/atmosphereDrawList';
import { atmosphereShellUniforms } from '../present/atmosphereShellUniforms';
import { bodyRowSlabs } from '../../../services/engine/frame/bodyRowSlabs';

export function encodeAtmosphereAerialPerspective(
  renderer: AtmosphereShellRenderer,
  encoder: GPUCommandEncoder,
  ctx: FrameView,
  state: PassState,
  claimTimestampWrites?: ClaimTimestampWrites,
): void {
  const insideRows = bodyRowSlabs(ctx).insideAtmosphere;
  if (insideRows.length === 0) return;

  // Same slab resolver as the render line (`aerialPerspectivePass`'s row), so
  // bake and apply share one `slab.vp`.
  const row = ctx.slabs[insideRows[0]!]!;
  if (row.frame.kind !== 'body-m') return;
  const hostId = row.frame.hostId;
  const entry = atmosphereDrawList(state, ctx).find((e) => e.body.id === hostId && e.inside);
  if (entry === undefined) return;
  const uniforms = atmosphereShellUniforms(entry, row, ctx, state);

  const pass = encoder.beginComputePass({
    label: 'atmosphere-aerial-bake',
    ...(claimTimestampWrites?.() ?? {}),
  });
  renderer.bakeAerialPerspective(pass, entry.body.id, uniforms);
  pass.end();
}
