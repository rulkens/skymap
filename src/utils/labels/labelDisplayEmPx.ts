/**
 * labelDisplayEmPx — a label's em height on screen, the CPU twin of the label
 * vertex shader's sizing: `worldEmMpc` over the anchor's view depth, times the
 * pixels per radian and the em retune, clamped to [minPx, maxPx].
 */

import type { Label2D } from '../../@types/rendering/Label2D';
import {
  LABEL_EM_PX_RETUNE,
  LABEL_MAX_PX_DEFAULT,
  LABEL_MIN_PX_DEFAULT,
  LABEL_WORLD_EM_MPC_DEFAULT,
} from '../../data/labels/labelSizingDefaults';

export function labelDisplayEmPx(label: Label2D, clipW: number, pxPerRad: number): number {
  const pxPerEm =
    ((label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT) / clipW) * pxPerRad * LABEL_EM_PX_RETUNE;
  return Math.min(
    Math.max(pxPerEm, label.minPixelSize ?? LABEL_MIN_PX_DEFAULT),
    label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT,
  );
}
