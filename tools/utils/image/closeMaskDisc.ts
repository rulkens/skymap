/**
 * closeMaskDisc — morphological closing (dilate, then erode) of a 0/1 mask by
 * a disc: bridges gaps and notches narrower than ~2·radius without growing the
 * outline. Erosion is the dilation of the complement, complemented. Works on a
 * copy padded by the radius, so the plane's edge erodes like any background.
 */
import { dilateMaskDisc } from './dilateMaskDisc';

export function closeMaskDisc(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): Uint8Array {
  const pad = Math.ceil(radiusPx);
  const pw = width + 2 * pad;
  const ph = height + 2 * pad;
  const padded = new Uint8Array(pw * ph);
  for (let y = 0; y < height; y++)
    padded.set(mask.subarray(y * width, (y + 1) * width), (y + pad) * pw + pad);
  const dilated = dilateMaskDisc(padded, pw, ph, radiusPx);
  const grownGap = dilateMaskDisc(
    dilated.map((v) => 1 - v),
    pw,
    ph,
    radiusPx,
  );
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) out[y * width + x] = 1 - grownGap[(y + pad) * pw + x + pad]!;
  return out;
}
