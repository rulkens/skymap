/**
 * antiqueLookTargetRows — the render-target rows the antique look owns, all
 * held only while it draws (`antiqueLookOn`). `print` and `overlay` take the
 * swap format so every pipeline built for `swap` draws into them unchanged;
 * the quarter-res rows are rgba16float because `peaks` stores pixel positions.
 */

import type { RenderTargetSpec } from '../../../../@types/engine/frame/RenderTargetSpec';
import { ANTIQUE_CELL, ANTIQUE_TARGETS } from '../../../../data/rendering/antiqueLook';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';
import { antiqueLookOn } from '../../../../utils/render/antiqueLookOn';

const TRANSPARENT: GPUColor = { r: 0, g: 0, b: 0, a: 0 };

export function antiqueLookTargetRows(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[] {
  const row = (id: string, format: GPUTextureFormat, scale: number): RenderTargetSpec => ({
    id,
    format,
    depth: null,
    scale,
    clearValue: TRANSPARENT,
    allocateWhen: antiqueLookOn,
  });
  return [
    { ...row(ANTIQUE_TARGETS.print, swapFormat, 1), clearValue: { r: 0, g: 0, b: 0, a: 1 } },
    row(ANTIQUE_TARGETS.overlay, swapFormat, 1),
    row(ANTIQUE_TARGETS.paper, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.wash, HDR_TARGET_FORMAT, ANTIQUE_CELL),
    row(ANTIQUE_TARGETS.glow, HDR_TARGET_FORMAT, ANTIQUE_CELL * 4),
    row(ANTIQUE_TARGETS.peaks, HDR_TARGET_FORMAT, ANTIQUE_CELL),
    row(ANTIQUE_TARGETS.stars, HDR_TARGET_FORMAT, ANTIQUE_CELL),
  ];
}
