/**
 * squareDeprojectCrop — normalise a crop so the downstream deproject
 * stretch lands on an exact square.
 *
 * Why this exists: when a galaxy is deprojected, the pipeline extracts a
 * rotated rect (rotatedExtract) and then stretches the disk minor axis by
 * 1/(b/a) to make the inclined disk face-on (deprojectDisk).  For the
 * final thumbnail to be square we have to choose the crop's rotation and
 * aspect so that stretch resolves to width × width.  This helper snaps a
 * caller-supplied crop onto that geometry without drifting the framing.
 *
 * The reduction reasoning, pinned so it survives refactors:
 *   - Set rotationDeg = disk.paDeg.  rotatedExtract then returns a rect in
 *     the crop frame whose axes line up with the disk's major/minor axes,
 *     i.e. the disk minor axis is image-Y.
 *   - Set height = width · (b/a).  After the rotation snap the effective
 *     position angle is effectivePaDeg = disk.paDeg - rotationDeg = 0, so
 *     deprojectDisk's matrix is M = [[1, 0], [0, 1/(b/a)]].  Applying M to
 *     a width × (width·(b/a)) rect gives
 *       width × (width·(b/a)·(1/(b/a))) = width × width.  Square.
 *
 * Centre preservation: snapping height changes the rect's extent, so we
 * re-derive x/y from the ORIGINAL centre rather than keeping the original
 * top-left.  Otherwise shrinking the height would slide the framing up.
 * We compute cx/cy from the incoming crop, then place the new (smaller or
 * larger) rect centred on that same point.  Pure — no mutation, no I/O.
 *
 * x/y are left as floats here; rotatedExtract does its own Math.round on
 * the extract rect, so we don't pre-round and risk a half-pixel double
 * rounding.  Only height is rounded, to match the integer dimension
 * rotatedExtract ultimately extracts.
 *
 * Callers invoke this ONLY when the disk is deprojected; an un-deprojected
 * crop must keep the maintainer's chosen rotation/aspect untouched.
 */
import type { RotatedCrop } from '../famous-curator/plugin/cropExtract.ts';
import type { RecipeDisk } from '../famous-curator/plugin/recipe.ts';

export function squareDeprojectCrop(
  crop: RotatedCrop,
  disk: RecipeDisk,
  effectiveAxisRatio: number,
): RotatedCrop {
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;

  const width = crop.width;
  const height = Math.round(width * effectiveAxisRatio);

  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    rotationDeg: disk.paDeg,
  };
}
