/**
 * `mw-aggregate`: the sub-pixel star sprites are fill-bound and their summed
 * glow is low-frequency, so drawing at 1/`aggregateDivisor` and upsampling
 * (`milkyWayUpsamplePass`) cuts fragments by the divisor squared. The
 * star shader's `starPxMin`/`starPxMax` clamps are in THIS target's pixels.
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
