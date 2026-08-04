/**
 * lensShift — the projection-matrix horizontal lens shift, extracted from
 * the spike's frame loop in `galaxy-engine.js`.
 *
 * The UI overlays fixed-width panels on the left/right edges of the
 * canvas without resizing the canvas itself, so the galaxy's true centre
 * sits behind whichever panel is wider rather than in the middle of the
 * visible strip between them. Scissoring the viewport to just the visible
 * strip would work too, but it changes the aspect ratio the projection
 * matrix is built against and reintroduces stretching. A lens shift
 * avoids that: it skews the projection so the same 3D scene renders
 * off-centre in NDC space, landing the galaxy in the middle of the
 * un-panelled area while the full canvas (including the parts hidden
 * under panels) keeps its original aspect ratio.
 *
 * The shift is written into `proj[8]`, which in a column-major 4x4
 * (column-major: memory index = column * 4 + row) is column 2, row 0 —
 * the term that adds a multiple of the homogeneous `z` into clip-space
 * `x`. Because perspective division ends up dividing by `w` (itself
 * derived from `z`), that term reads as a constant NDC-x offset across
 * the whole frustum, independent of depth: exactly the "shift everything
 * sideways by a fixed screen fraction" effect a lens shift is for.
 */

/**
 * Compute the `proj[8]` lens-shift term that re-centres the scene in the
 * un-panelled area of the canvas.
 *
 * @param insetLeft      Left panel width in CSS px.
 * @param insetRight     Right panel width in CSS px.
 * @param clientWidthPx  Canvas CSS width in px.
 * @returns The signed NDC-x offset to write into `proj[8]`.
 */
export function lensShift(insetLeft: number, insetRight: number, clientWidthPx: number): number {
  return (insetRight - insetLeft) / Math.max(1, clientWidthPx);
}
