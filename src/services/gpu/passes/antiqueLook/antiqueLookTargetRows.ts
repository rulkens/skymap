/**
 * antiqueLookTargetRows — the render-target rows the antique look owns, all
 * held only while it draws (`antiqueLookOn`). `print` and `overlay` take the
 * swap format so every pipeline built for `swap` draws into them unchanged;
 * `print-points` is sized in print units, so it holds the same cells at any
 * DPR; `star-ink` holds two 0..1 channels, so 8 bits each.
 */

import type { RenderTargetSpec } from '../../../../@types/engine/frame/RenderTargetSpec';
import {
  ANTIQUE_CELL,
  ANTIQUE_GEOGRAPHY_FORMAT,
  ANTIQUE_LAND_FORMAT,
  ANTIQUE_PRINT_CELL_UNITS,
  ANTIQUE_PRINT_POINTS_DEPTH,
  ANTIQUE_PRINT_POINTS_FORMAT,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
  ANTIQUE_STRUCTURE_CELL,
  ANTIQUE_TARGETS,
} from '../../../../data/rendering/antiqueLook';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';
import { antiqueLookOn } from '../../../../utils/render/antiqueLookOn';

const TRANSPARENT: GPUColor = { r: 0, g: 0, b: 0, a: 0 };

export function antiqueLookTargetRows(swapFormat: GPUTextureFormat): readonly RenderTargetSpec[] {
  const row = (
    id: string,
    format: GPUTextureFormat,
    scale: RenderTargetSpec['scale'],
    depth: GPUTextureFormat | null = null,
  ): RenderTargetSpec => ({
    id,
    format,
    depth,
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
    row(ANTIQUE_TARGETS.nebula, HDR_TARGET_FORMAT, ANTIQUE_CELL),
    // The structure markers, moved off the print (ANTIQUE_MOVED_PASSES), and their low band.
    row(ANTIQUE_TARGETS.structures, HDR_TARGET_FORMAT, ANTIQUE_STRUCTURE_CELL),
    row(ANTIQUE_TARGETS.structureGlow, HDR_TARGET_FORMAT, ANTIQUE_CELL * 4),
    row(
      ANTIQUE_TARGETS.printPoints,
      ANTIQUE_PRINT_POINTS_FORMAT,
      (_state, canvas) => (ANTIQUE_PRINT_CELL_UNITS * canvas.height) / ANTIQUE_REFERENCE_HEIGHT_CSS,
      ANTIQUE_PRINT_POINTS_DEPTH,
    ),
    row(ANTIQUE_TARGETS.starInk, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.decor, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.decorHue, 'rgba8unorm', 1),
    row(ANTIQUE_TARGETS.land, ANTIQUE_LAND_FORMAT, 1),
    row(ANTIQUE_TARGETS.geography, ANTIQUE_GEOGRAPHY_FORMAT, 1),
    // The land share's blur, two passes (`landBlur.wesl`): Σ weight·share, Σ weight.
    row(ANTIQUE_TARGETS.landBlurAcross, 'rg16float', ANTIQUE_CELL),
    row(ANTIQUE_TARGETS.landBlur, 'rg16float', ANTIQUE_CELL),
    // The moved passes' own pipelines are built for HDR, so their row is too.
    row(ANTIQUE_TARGETS.lines, HDR_TARGET_FORMAT, 1),
  ];
}
