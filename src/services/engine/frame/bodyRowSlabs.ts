/**
 * bodyRowSlabs — the rows each `RenderStepSpec.slab` body-row source expands
 * over: for `lens`, Sgr A*'s `body-m` row while the lensing band is open and
 * nothing outside it. Resolved here because a row's painter-order index comes
 * from `deriveSlabs`.
 */

import type { BodyRowSource } from '../../../@types/engine/frame/BodyRowSource';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';
import { skyCaptureBandAlpha } from './skyCaptureBandAlpha';

export function bodyRowSlabs(
  state: EngineState,
  ctx: FrameView,
): Record<BodyRowSource, readonly number[]> {
  const sgrAStar =
    skyCaptureBandAlpha('sgrAStar', state, ctx) <= 0
      ? undefined
      : ctx.slabs.find(
          (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === SGR_A_STAR.id,
        );
  return { lens: sgrAStar === undefined ? [] : [sgrAStar.index], insideAtmosphere: [] };
}
