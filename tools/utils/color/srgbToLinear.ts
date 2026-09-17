/** Undo the sRGB gamma transfer for one [0,1] channel → linear light. Same
 *  formula as `src/utils/color/hexToLinearRgb.ts`'s private helper, but that
 *  one isn't exported — `tools/` gets its own copy under this convention's
 *  one-symbol-per-file rule rather than reaching across the src/tools split. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
