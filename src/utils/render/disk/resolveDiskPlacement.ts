/**
 * resolveDiskPlacement — composes the pure placement-math primitives into
 * a single per-row disk render frame for a famous-galaxy thumbnail.
 *
 * A famous-galaxy WebP is a hand-curated, possibly cropped/deprojected
 * image of one galaxy. The three primitives (`calibratedDiskSizeWorld`,
 * `effectiveTilt`, `nucleusCorner`) each answer an independent question
 * (how big, how squashed, where the nucleus sits); this composer folds
 * them — plus the no-calibration default — so the textured-disk loop body
 * stays a single pure call instead of a four-`let` mutable shell.
 */

import { calibratedDiskSizeWorld } from './calibratedDiskSizeWorld';
import { effectiveTilt } from './effectiveTilt';
import { nucleusCorner } from './nucleusCorner';
import type { FamousCalibration } from '../../../@types/loading/FamousCalibration';
import type { DiskPlacement } from '../../../@types/rendering/DiskPlacement';

/**
 * Resolve the disk's render frame from catalog geometry plus an optional famous
 * calibration — the per-row composition of the three primitives above.
 *
 * No calibration (the common case — every non-famous row, and famous rows
 * without a curated WebP) returns the catalog values unchanged with a centred
 * nucleus, so the emitted instance is bit-identical to the uncalibrated path.
 * A calibration applies all three overrides at once: size scaled by the disk's
 * frame fraction, tilt picked by the deproject regime, nucleus offset into the
 * disk's corner frame.
 *
 * Pure (composes only the pure primitives), so the textured-disk planner reads
 * one frozen record per row rather than threading four mutable `let`s through
 * a branch.
 */
export function resolveDiskPlacement(
  catalogSizeWorld: number,
  catalogAxisRatio: number,
  catalogPaDeg: number,
  calibration: FamousCalibration | undefined,
): DiskPlacement {
  if (calibration === undefined) {
    return {
      sizeWorld: catalogSizeWorld,
      axisRatio: catalogAxisRatio,
      positionAngleDeg: catalogPaDeg,
      nucleusOffset: [0, 0],
    };
  }
  const tilt = effectiveTilt(calibration, catalogAxisRatio, catalogPaDeg);
  return {
    sizeWorld: calibratedDiskSizeWorld(catalogSizeWorld, calibration.diskRadiusFrac),
    axisRatio: tilt.axisRatio,
    positionAngleDeg: tilt.positionAngleDeg,
    nucleusOffset: nucleusCorner(calibration.center),
  };
}
