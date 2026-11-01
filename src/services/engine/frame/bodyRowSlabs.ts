/**
 * bodyRowSlabs — the rows each `RenderStepSpec.slab` body-row source expands
 * over: per line, every `body-m` slab whose row names that line in `hosts`
 * with its band open (`hostBandOpen`). Resolved here because a row's
 * painter-order index comes from `deriveSlabs`.
 *
 * Rows and bands only: which line a row hosts is the declaring Layer's fact,
 * so no line's own code (the atmosphere's, the lens's) is read here.
 */

import type { BodyRowSource } from '../../../@types/engine/frame/BodyRowSource';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { hostBandOpen } from '../../../utils/frame/hostBandOpen';

export function bodyRowSlabs(ctx: FrameView): Record<BodyRowSource, readonly number[]> {
  const lines: Record<BodyRowSource, number[]> = { lens: [], insideAtmosphere: [] };
  for (const slab of ctx.slabs) {
    if (slab.frame.kind !== 'body-m') continue;
    const hostId = slab.frame.hostId;
    const row = ctx.snapshot.slabBodyCandidates.find((candidate) => candidate.anchorId === hostId);
    for (const host of row?.hosts ?? []) {
      if (hostBandOpen(host.band, ctx, hostId)) lines[host.line].push(slab.index);
    }
  }
  return lines;
}
