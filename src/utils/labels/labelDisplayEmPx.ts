/**
 * labelDisplayEmPx — the em height a label is drawn at, in device px: its world em
 * projected through the anchor's clip w, clamped to its size range. The range is
 * CSS px (a 21 px name reads 21 px on any screen), so it scales by the device pixel
 * ratio here; a world em already scales with `pxPerRad`, which is device px. The CPU
 * twin of `labels/vertex.wesl`'s `displayEmPx`.
 */

import { LABEL_EM_PX_RETUNE } from '../../data/labels/labelSizingDefaults';

export function labelDisplayEmPx(args: {
  readonly worldEmMpc: number;
  readonly clipW: number;
  readonly pxPerRad: number;
  readonly minPixelSize: number;
  readonly maxPixelSize: number;
  readonly devicePixelRatio: number;
}): number {
  const pxPerEm = (args.worldEmMpc / args.clipW) * args.pxPerRad * LABEL_EM_PX_RETUNE;
  const dpr = args.devicePixelRatio;
  return Math.min(Math.max(pxPerEm, args.minPixelSize * dpr), args.maxPixelSize * dpr);
}
