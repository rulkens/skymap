/** One mip level's bytes. Rounded because 16/36 is not exact in f64; exact for the block-multiple
 *  dims every shipped level has, and an undercount for a partial-block level (none ships). */
export function levelByteLength(
  width: number,
  height: number,
  depth: number,
  bytesPerTexel: number,
): number {
  return Math.round(width * height * depth * bytesPerTexel);
}
