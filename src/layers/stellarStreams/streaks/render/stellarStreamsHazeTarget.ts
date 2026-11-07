/**
 * `stellar-streams-haze` — the haze look's offscreen. The haze is wide, faint and fill-bound, and
 * its summed glow is smooth, so drawing at 1/`HAZE_DIVISOR` and upsampling cuts its fragments by
 * the divisor squared. The look's `minPx` floor reads in THIS target's pixels: nothing halves it by hand,
 * the haze pass's viewport and scaled `pxPerRad` do.
 */

import type { RenderTargetSpec } from '../../../../@types/engine/frame/RenderTargetSpec';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';

const HAZE_DIVISOR = 2;

export const STELLAR_STREAMS_HAZE_TARGET: RenderTargetSpec = {
  id: 'stellar-streams-haze',
  format: HDR_TARGET_FORMAT,
  depth: null,
  scale: HAZE_DIVISOR,
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
};
