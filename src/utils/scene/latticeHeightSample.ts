/** latticeHeightSample — bilinear height at lattice position `p` (posts from
 *  the leaf's sub-rect origin), on the sub-lattice of every `stride`-th post.
 *  TWIN of `latticeHeightM` in `earthSurfaceTile/lattice.wesl`, in f64: the
 *  reference the shader's f32 arithmetic is judged against. `postM` reads one
 *  post by `(col, row)`, rows counting SOUTH as the atlas's do. */
export function latticeHeightSample(
  postM: (col: number, row: number) => number,
  p: readonly [number, number],
  stride: number,
): number {
  const qx = Math.floor(p[0] / stride) * stride;
  const qy = Math.floor(p[1] / stride) * stride;
  const fx = (p[0] - qx) / stride;
  const fy = (p[1] - qy) / stride;
  const north = postM(qx, qy) * (1 - fx) + postM(qx + stride, qy) * fx;
  const south = postM(qx, qy + stride) * (1 - fx) + postM(qx + stride, qy + stride) * fx;
  return north * (1 - fy) + south * fy;
}
