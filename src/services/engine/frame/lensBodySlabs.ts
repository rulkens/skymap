/**
 * lensBodySlabs — the rows `FRAME_ORDER`'s `lens` line expands over: Sgr A*'s
 * `body-m` row while the lensing band is open, nothing outside it. Resolved
 * here because the row's painter-order index comes from `deriveSlabs`.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { SGR_A_STAR } from '../../../data/bodies/sceneSgrAStar';
import { sgrAStarBandAlpha } from './sgrAStarBandAlpha';

export function lensBodySlabs(state: EngineState, ctx: ReadyFrameContext): readonly number[] {
  if (sgrAStarBandAlpha(state, ctx) <= 0) return [];
  const row = ctx.slabs.find(
    (slab) => slab.frame.kind === 'body-m' && slab.frame.bodyId === SGR_A_STAR.id,
  );
  return row === undefined ? [] : [row.index];
}
