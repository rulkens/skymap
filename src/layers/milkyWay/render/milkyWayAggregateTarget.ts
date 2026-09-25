/**
 * MILKY_WAY_AGGREGATE_TARGET — the `mw-aggregate` row. The cloud stands in
 * for ~1e11 stars with a budget in the hundreds of thousands, so wherever
 * the disc covers real screen area the sprites go sub-pixel and the wall
 * is fill, not instance count; the summed glow is low-frequency, so 1/
 * `aggregateDivisor` plus a bilinear upsample (`milkyWayUpsamplePass`) cuts
 * fragments by the divisor squared. The divisor is a live setting, resolved
 * on every `reconcile`, and trades against the star shader's TARGET-pixel
 * `starPxMin`/`starPxMax` clamps. Dust stays full-res in HDR (`milkyWayPass`).
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
