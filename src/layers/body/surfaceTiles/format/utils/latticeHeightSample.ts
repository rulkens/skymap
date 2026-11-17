/** latticeHeightSample — bilinear height at lattice position `p` (posts from
 *  the leaf's sub-rect origin), on the sub-lattice of every `stride`-th post.
 *  TWIN of `latticeHeightM` in `surfaceTile/lattice.wesl`, in f64: the
 *  reference the shader's f32 arithmetic is judged against. `postM` reads one
 *  post by `(col, row)`, rows counting SOUTH as the atlas's do. */
export function latticeHeightSample(
  postM: (col: number, row: number) => number,
  p: readonly [number, number],
  stride: number,
  /** Cells across the leaf's sub-rect. The stride is clamped to it: a leaf
   *  that inherited seven levels has one cell, and a doubled stride there
   *  would read past the sub-rect into another leaf's ground (R15). */
  cells: number,
): number {
  const s = Math.min(stride, cells);
  const qx = Math.floor(p[0] / s) * s;
  const qy = Math.floor(p[1] / s) * s;
  const fx = (p[0] - qx) / s;
  const fy = (p[1] - qy) / s;
  const north = postM(qx, qy) * (1 - fx) + postM(qx + s, qy) * fx;
  const south = postM(qx, qy + s) * (1 - fx) + postM(qx + s, qy + s) * fx;
  return north * (1 - fy) + south * fy;
}
