/**
 * closeMaskDisc — morphological closing (dilate, then erode) of a 0/1 mask by
 * a disc: bridges gaps and notches narrower than ~2·radius without growing the
 * outline. Erosion is the dilation of the complement, complemented.
 */
import { dilateMaskDisc } from './dilateMaskDisc';

export function closeMaskDisc(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): Uint8Array {
  const dilated = dilateMaskDisc(mask, width, height, radiusPx);
  const grownGap = dilateMaskDisc(
    dilated.map((v) => 1 - v),
    width,
    height,
    radiusPx,
  );
  return grownGap.map((v) => 1 - v);
}
