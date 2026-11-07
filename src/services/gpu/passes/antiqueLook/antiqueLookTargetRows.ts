/**
 * antiqueLookTargetRows — the render-target rows the antique look owns, all
 * held only while it draws (`antiqueLookOn`). `print` and `overlay` take the
 * swap format so every pipeline built for `swap` draws into them unchanged;
 * the quarter-res rows are rgba16float because `peaks` stores pixel positions;
 * `star-ink` holds two 0..1 channels, so 8 bits each.
 */

import type { RenderTargetSpec } from '../../../../@types/engine/frame/RenderTargetSpec';
import {
  ANTIQUE_CELL,
  ANTIQUE_LAND_FORMAT,
  ANTIQUE_TARGETS,
} from '../../../../data/rendering/antiqueLook';
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
    row(ANTIQUE_TARGETS.print, swapFormat, 1),
    row(ANTIQUE_TARGETS.overlay, swapFormat, 1),
    row(ANTIQUE_TARGETS.paper, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.wash, HDR_TARGET_FORMAT, ANTIQUE_CELL),
    row(ANTIQUE_TARGETS.glow, HDR_TARGET_FORMAT, ANTIQUE_CELL * 4),
    row(ANTIQUE_TARGETS.peaks, HDR_TARGET_FORMAT, ANTIQUE_CELL),
    row(ANTIQUE_TARGETS.stars, HDR_TARGET_FORMAT, ANTIQUE_CELL),
    row(ANTIQUE_TARGETS.starInk, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.decor, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.decorHue, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.land, ANTIQUE_LAND_FORMAT, 1),
    // The moved passes' own pipelines are built for HDR, so their row is too.
    row(ANTIQUE_TARGETS.lines, HDR_TARGET_FORMAT, 1),
  ];
}
