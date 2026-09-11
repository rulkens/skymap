/** `fetchSkraafoto` writes every JPEG at this long edge and `bakeSplats` scales
 *  pose intrinsics + Brush's resize cap to it — they must agree exactly. */
export const LONG_EDGE_PX = 1920;

export function skraafotoDownsampleScale(shape: readonly [number, number]): number {
  return LONG_EDGE_PX / Math.max(shape[0], shape[1]); // `shape` is [rows, cols]
}
