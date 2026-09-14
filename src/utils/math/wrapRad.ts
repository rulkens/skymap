/** The angle wrapped to (−π, π] — `atan2(sin, cos)`, so the seam needs no branch. */
export function wrapRad(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}
