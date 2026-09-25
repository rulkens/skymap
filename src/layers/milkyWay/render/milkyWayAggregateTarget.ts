/**
 * MILKY_WAY_AGGREGATE_TARGET — the `mw-aggregate` row, moved verbatim from
 * core's target table; see `renderTargets.ts`'s "why reduced resolution"
 * section for the rationale.
 */

import type { RenderTargetSpec } from '../../../@types/engine/frame/RenderTargetSpec';
import { HDR_TARGET_FORMAT } from '../../../data/renderTargetFormats';

export const MILKY_WAY_AGGREGATE_TARGET: RenderTargetSpec = {
  id: 'mw-aggregate',
  format: HDR_TARGET_FORMAT,
  depth: null,
  scale: (state) => state.settings.milkyWay.aggregateDivisor,
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
};
