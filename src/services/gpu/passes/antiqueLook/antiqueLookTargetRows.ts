/**
 * antiqueLookTargetRows — the render-target rows the antique look owns, all
 * held only while it draws (`antiqueLookOn`). `print` and `overlay` take the
 * swap format so every pipeline built for `swap` draws into them unchanged;
 * `print-points` is sized in print units, so it holds the same cells at any
 * DPR; the plate's own rows are layers of three arrays, one per size and format
 * (`ANTIQUE_*_LAYERS`), so the plate binds three textures for nine rows.
 */

import type { RenderTargetSpec } from '../../../../@types/engine/frame/RenderTargetSpec';
import {
  ANTIQUE_CELL,
  ANTIQUE_FULL_LAYERS,
  ANTIQUE_GEOGRAPHY_FORMAT,
  ANTIQUE_LAND_FORMAT,
  ANTIQUE_LOW_LAYERS,
  ANTIQUE_PRINT_CELL_UNITS,
  ANTIQUE_PRINT_POINTS_DEPTH,
  ANTIQUE_PRINT_POINTS_FORMAT,
  ANTIQUE_QUARTER_LAYERS,
  ANTIQUE_REFERENCE_HEIGHT_CSS,
  ANTIQUE_STRUCTURE_CELL,
  ANTIQUE_TARGETS,
} from '../../../../data/rendering/antiqueLook';
import { ANTIQUE_RELIEF_FORMAT } from '../../../../data/rendering/antiqueRelief';
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
  const layered = (
    id: string,
    format: GPUTextureFormat,
    scale: number,
    layers: Record<string, number>,
  ): RenderTargetSpec => ({ ...row(id, format, scale), layers: Object.keys(layers).length });
  return [
    row(ANTIQUE_TARGETS.print, swapFormat, 1),
    row(ANTIQUE_TARGETS.overlay, swapFormat, 1),
    layered(ANTIQUE_TARGETS.full, 'rgba8unorm', 1, ANTIQUE_FULL_LAYERS),
    layered(ANTIQUE_TARGETS.quarter, HDR_TARGET_FORMAT, ANTIQUE_CELL, ANTIQUE_QUARTER_LAYERS),
    layered(ANTIQUE_TARGETS.low, HDR_TARGET_FORMAT, ANTIQUE_CELL * 4, ANTIQUE_LOW_LAYERS),
    // The structure markers, moved off the print (ANTIQUE_MOVED_PASSES).
    row(ANTIQUE_TARGETS.structures, HDR_TARGET_FORMAT, ANTIQUE_STRUCTURE_CELL),
    row(
      ANTIQUE_TARGETS.printPoints,
      ANTIQUE_PRINT_POINTS_FORMAT,
      (_state, canvas) => (ANTIQUE_PRINT_CELL_UNITS * canvas.height) / ANTIQUE_REFERENCE_HEIGHT_CSS,
      ANTIQUE_PRINT_POINTS_DEPTH,
    ),
    row(ANTIQUE_TARGETS.land, ANTIQUE_LAND_FORMAT, 1),
    row(ANTIQUE_TARGETS.geography, ANTIQUE_GEOGRAPHY_FORMAT, 1),
    // The land share's blur's first half (`landBlur.wesl`): Σ weight·share, Σ weight.
    row(ANTIQUE_TARGETS.landBlurAcross, 'rg16float', ANTIQUE_CELL),
    // The moved passes' own pipelines are built for HDR, so their row is too.
    row(ANTIQUE_TARGETS.lines, HDR_TARGET_FORMAT, 1),
    row(ANTIQUE_TARGETS.relief, ANTIQUE_RELIEF_FORMAT, 1),
  ];
}
