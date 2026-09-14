/** The long edge a whole-frame harvest writes its JPEGs at — a group with no
 *  `groundMmPerPx` gets this, and `frameWindow` carries it to the pose
 *  intrinsics and Brush's resize cap so all three agree. */
const LONG_EDGE_PX = 1920;

export function skraafotoDownsampleScale(shape: readonly [number, number]): number {
  return LONG_EDGE_PX / Math.max(shape[0], shape[1]); // `shape` is [rows, cols]
}
