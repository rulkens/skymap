/**
 * lensShift — the projection-matrix horizontal lens shift. The UI overlays
 * fixed-width panels on the canvas edges without resizing the canvas, so the
 * galaxy's true centre sits behind whichever panel is wider. Scissoring to
 * the visible strip would restretch the aspect ratio; a lens shift instead
 * skews the projection so the scene renders off-centre in NDC space while
 * the canvas keeps its original aspect ratio.
 *
 * Written into `proj[8]` — column 2, row 0 of a column-major 4x4 (memory
 * index = column * 4 + row) — the term that adds a multiple of homogeneous
 * `z` into clip-space `x`. Since perspective division divides by `w` (itself
 * derived from `z`), that term reads as a constant NDC-x offset independent
 * of depth: a fixed screen-fraction sideways shift.
 *
 * @param insetLeft      Left panel width in CSS px.
 * @param insetRight     Right panel width in CSS px.
 * @param clientWidthPx  Canvas CSS width in px.
 * @returns The signed NDC-x offset to write into `proj[8]`.
 */
export function lensShift(insetLeft: number, insetRight: number, clientWidthPx: number): number {
  return (insetRight - insetLeft) / Math.max(1, clientWidthPx);
}
