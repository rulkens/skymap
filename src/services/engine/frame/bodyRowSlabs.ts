/**
 * bodyRowSlabs — the rows each `RenderStepSpec.slab` body-row source expands
 * over: `lens` is every `body-m` row whose `SlabRow` names that line,
 * `insideAtmosphere` the row of the one body whose shell encloses the camera.
 * Resolved here because a row's painter-order index comes from `deriveSlabs`.
 *
 * No band read: a banded row is in `slabBodyCandidates` only while its band is
 * open (`slabRowActive`), so its presence IS the gate.
 */

import type { BodyRowSource } from '../../../@types/engine/frame/BodyRowSource';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { atmosphereDrawList } from './atmosphereDrawList';

export function bodyRowSlabs(
  state: PassState,
  ctx: FrameView,
): Record<BodyRowSource, readonly number[]> {
  const lensHostIds = new Set(
    ctx.snapshot.slabBodyCandidates
      .filter((row) => row.source === 'lens')
      .map((row) => row.anchorId as string),
  );
  // Memoised on `ctx`, so this read costs nothing the draw has not already paid.
  const inside = atmosphereDrawList(state, ctx).find((entry) => entry.inside);
  const insideRow =
    inside === undefined
      ? undefined
      : ctx.slabs.find(
          (slab) => slab.frame.kind === 'body-m' && slab.frame.hostId === inside.body.id,
        );
  return {
    lens: ctx.slabs
      .filter((slab) => slab.frame.kind === 'body-m' && lensHostIds.has(slab.frame.hostId))
      .map((slab) => slab.index),
    insideAtmosphere: insideRow === undefined ? [] : [insideRow.index],
  };
}
