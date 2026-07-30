/**
 * frustumPlanesFromViewProj — extract the six view-frustum clip planes from a
 * view-projection matrix, the Gribb–Hartmann way, packed as normalized
 * `(nx, ny, nz, d)` quads a sphere/point test can consume directly.
 *
 * ### The identity this exploits
 *
 * A point survives clipping iff its clip-space coordinate `c = vp · (p, 1)`
 * satisfies WebGPU's clip volume: `-w ≤ x ≤ w`, `-w ≤ y ≤ w`, `0 ≤ z ≤ w`.
 * Each of those six inequalities is LINEAR in `p`, so it defines a half-space —
 * a plane. Writing `c = vp·(p,1)` row by row (row `r` of the matrix dotted with
 * `(p,1)` gives `c[r]`), the inequalities become plane equations directly:
 *
 *     x ≥ -w  ⇔  (row_w + row_x) · (p,1) ≥ 0    → left
 *     x ≤  w  ⇔  (row_w - row_x) · (p,1) ≥ 0    → right
 *     y ≥ -w  ⇔  (row_w + row_y) · (p,1) ≥ 0    → bottom
 *     y ≤  w  ⇔  (row_w - row_y) · (p,1) ≥ 0    → top
 *     z ≥  0  ⇔  (row_z)         · (p,1) ≥ 0    → near   (WebGPU z ∈ [0,w])
 *     z ≤  w  ⇔  (row_w - row_z) · (p,1) ≥ 0    → far
 *
 * The first three components of each `(a,b,c,d)` are the (inward-pointing)
 * plane normal; the fourth is its offset. A point is INSIDE the frustum exactly
 * when all six dot products `a·x + b·y + c·z + d` are ≥ 0. The near row is
 * `row_z` alone (not `row_w + row_z`) because WebGPU/D3D clip depth runs `[0,w]`,
 * not OpenGL's `[-w,w]` — using the GL near plane here would let this cull
 * disagree with what the GPU actually clips against, dropping visible geometry.
 *
 * ### Why we read COLUMNS of the input
 *
 * `vp` is column-major (the layout wgpu-matrix produces and WebGPU consumes):
 * element `[col*4 + row]`. The math "row `r`" this derivation needs — the four
 * numbers `M[r][0..3]` — is therefore the STRIDED set `[r, r+4, r+8, r+12]`, one
 * per column. Reading it as a contiguous 4-slice (a row-major assumption) would
 * silently transpose the matrix and yield planes for `vpᵀ`, which are geometric
 * nonsense. `rw/rx/ry/rz` below name the four math rows extracted this way.
 *
 * ### Why normalize
 *
 * Straight from the rows, each normal `(a,b,c)` has an arbitrary magnitude that
 * depends on the projection's scale factors. The signed distance `a·x+…+d` is
 * only a TRUE Euclidean distance once `(a,b,c)` is a unit vector — and the
 * sphere-vs-frustum test compares that signed distance against a radius in world
 * units. So we divide all four numbers of each plane by `|(a,b,c)|`, scaling `d`
 * along with the normal to keep the plane fixed while making its distances metric.
 *
 * ### Reversed-Z: the near/far slot labels swap geometrically
 *
 * Under a reversed-Z, infinite-far projection (`mat4d.perspectiveReverseZ`,
 * used by the NEAR0 foreground slab), `row_z` collapses to `(0, 0, 0, zNear)`
 * — a zero-length normal, which `setPlane`'s guard turns into the harmless
 * all-zero plane. The slot this derivation labels "near" therefore holds that
 * degenerate row, while the slot labelled "far" (`row_w - row_z`) ends up
 * holding the real near-clip boundary. Harmless for the uniform six-plane AND
 * test this function feeds, but a trap for a future caller that reaches into
 * slot 16 expecting "the near plane."
 *
 * @param vp   Column-major length-16 view-projection (`Float32Array`), e.g.
 *             `narrowMat4(rebaseViewProj(...))` — the exact matrix the GPU clips
 *             against, so the cull it feeds is visually lossless.
 * @param out  Optional length-24 destination reused every frame to stay
 *             allocation-free; a fresh `Float32Array(24)` is allocated if omitted.
 * @returns    The 24 floats — six `(nx, ny, nz, d)` planes, unit-normalized, in
 *             order left, right, bottom, top, near, far — written into `out`
 *             (returned by reference) or the freshly allocated array.
 */

export function frustumPlanesFromViewProj(vp: Float32Array, out?: Float32Array): Float32Array {
  const planes = out ?? new Float32Array(24);

  // Math rows of the column-major matrix: row r = [r, r+4, r+8, r+12].
  const rx0 = vp[0]!;
  const rx1 = vp[4]!;
  const rx2 = vp[8]!;
  const rx3 = vp[12]!;
  const ry0 = vp[1]!;
  const ry1 = vp[5]!;
  const ry2 = vp[9]!;
  const ry3 = vp[13]!;
  const rz0 = vp[2]!;
  const rz1 = vp[6]!;
  const rz2 = vp[10]!;
  const rz3 = vp[14]!;
  const rw0 = vp[3]!;
  const rw1 = vp[7]!;
  const rw2 = vp[11]!;
  const rw3 = vp[15]!;

  // left = rw + rx, right = rw - rx, bottom = rw + ry, top = rw - ry,
  // near = rz, far = rw - rz.
  setPlane(planes, 0, rw0 + rx0, rw1 + rx1, rw2 + rx2, rw3 + rx3);
  setPlane(planes, 4, rw0 - rx0, rw1 - rx1, rw2 - rx2, rw3 - rx3);
  setPlane(planes, 8, rw0 + ry0, rw1 + ry1, rw2 + ry2, rw3 + ry3);
  setPlane(planes, 12, rw0 - ry0, rw1 - ry1, rw2 - ry2, rw3 - ry3);
  setPlane(planes, 16, rz0, rz1, rz2, rz3);
  setPlane(planes, 20, rw0 - rz0, rw1 - rz1, rw2 - rz2, rw3 - rz3);

  return planes;
}

// Normalize (a,b,c,d) by the normal length and store at `base` (guards the
// degenerate zero-normal row so a pathological matrix yields a harmless
// all-zero plane rather than NaNs poisoning every cull test downstream).
function setPlane(planes: Float32Array, base: number, a: number, b: number, c: number, d: number) {
  const len = Math.hypot(a, b, c);
  const inv = len > 0 ? 1 / len : 0;
  planes[base + 0] = a * inv;
  planes[base + 1] = b * inv;
  planes[base + 2] = c * inv;
  planes[base + 3] = d * inv;
}
