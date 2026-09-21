/**
 * bodyRowSlabs — the rows each `RenderStepSpec.slab` body-row source expands
 * over: `lens` is Sgr A*'s `body-m` row while the lensing band is open,
 * `insideAtmosphere` the row of the one body whose shell encloses the camera.
 * Resolved here because a row's painter-order index comes from `deriveSlabs`.
 */

import type { BodyRowSource } from '../../../@types/engine/frame/BodyRowSource';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';
import { atmosphereDrawList } from './atmosphereDrawList';
import { skyCaptureBandAlpha } from './skyCaptureBandAlpha';

export function bodyRowSlabs(
  state: PassState,
  ctx: FrameView,
): Record<BodyRowSource, readonly number[]> {
  const sgrAStar =
    skyCaptureBandAlpha('sgrAStar', state, ctx) <= 0
      ? undefined
      : ctx.slabs.find(
          (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === SGR_A_STAR.id,
        );
  // Memoised on `ctx`, so this read costs nothing the draw has not already paid.
  const inside = atmosphereDrawList(state, ctx).find((entry) => entry.inside);
  const insideRow =
    inside === undefined
      ? undefined
      : ctx.slabs.find(
          (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === inside.body.id,
        );
  return {
    lens: sgrAStar === undefined ? [] : [sgrAStar.index],
    insideAtmosphere: insideRow === undefined ? [] : [insideRow.index],
  };
}
