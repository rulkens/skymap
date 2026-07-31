/**
 * composeOrbitConic — compose the `f64` inverse homography `Ginv` (pixel →
 * orbital-plane) for one screen-space conic orbit trail, narrowed once to f32.
 *
 * This is the CPU half of the conic-orbit-trail renderer (spec §3.2/§3.3).  A
 * Keplerian orbit is the affine image of the **unit circle**: in plane
 * coordinates `(s, t)` about the ellipse centre `C` with basis `(A, B)`, every
 * orbit point is `X = C + s·A + t·B` and the orbit itself is `s² + t² = 1`
 * (spec §3.1).  A homogeneous plane point `p = (s, t, 1)` therefore maps to
 * homogeneous world `[X; 1] = M·p` with the 4×3 matrix whose columns are
 * `[A; 0]`, `[B; 0]`, `[Crel; 1]`.  Push that through the slab view-projection
 * and the NDC→pixel viewport and you get a single 3×3 homography `G` from plane
 * to pixel; the fragment wants its inverse.
 *
 * ### Why compose the FULL H in f64 before inverting
 *
 * Identical cancellation to `composeBodyMvp` (see its header).  The orbit
 * centres sit ~5e-12 down to ~1e-14 Mpc from the render origin — tiny numbers
 * the view-projection's large translation column very nearly cancels.  If we
 * narrowed the view-projection, or the individual clip columns, to f32 BEFORE
 * assembling and inverting H, that near-cancellation would obliterate the
 * low-order bits that encode where the orbit actually sits, and the projected
 * conic would land visibly off its body.  So H, V, G and the inversion all run
 * in `f64` (`mat3d`); `narrowMat3` is applied exactly once, at return, when the
 * result is a well-conditioned pixel→plane map.
 *
 *     f64 slabVp × f64 columns → f64 H → V·H = G → G⁻¹ = Ginv → narrow → f32
 *                                                                   ↑ only here
 *
 * ### Why only the x, y, w clip rows
 *
 * The trail is a depthless additive draw (spec §3.2/§4): the fragment never
 * reads clip-z, so H drops it entirely.  The viewport transform V acts on the
 * `(x, y, w)` sub-vector of clip and never mixes z in, so keeping three rows —
 * clip-x, clip-y, clip-w — is exact, not an approximation.  This is what makes
 * the homography a clean 3×3 rather than a 4×4 with a discarded row.
 *
 * ### Why the return is `Ginv` PLUS the six gradient minors
 *
 * `Ginv` is the only per-orbit matrix the fragment needs to back-project a
 * pixel: from the single product `q = Ginv·(px, py, 1)` it derives the
 * behind-camera clip (`q.z = 1/w`), the plane coords / eccentric anomaly
 * (`s = q.x/q.z`, `t = q.y/q.z`, `E = atan2(t, s)`) and the stroke `r = √(s²+t²)`.
 * But the ANTIALIASING needs `∂s/∂p` and `∂t/∂p` (the pixel gradient of `r`),
 * and computing those on the GPU straight from `Ginv` is a numerical trap.
 *
 * The old fragment formed each gradient numerator as a difference of two
 * products, e.g. `∂s/∂pₓ ∝ Ginv[0].x·q.z − q.x·Ginv[0].z`.  Expand
 * `q = Ginv·(px, py, 1)`: the top-degree `px` terms are `(a·g − a·g)·px` and
 * cancel IDENTICALLY, leaving a numerator that is AFFINE in `(px, py)` with a
 * 2×2-minor coefficient.  Algebraically exact — but on the near-edge-on
 * Earth-zoom pose the plane→pixel homography is ILL-CONDITIONED (condition
 * number ~1e15), so the two products are nearly equal and their f32 difference
 * cancels catastrophically: the tiny true minor keeps almost none of f32's
 * significant digits.  The loss is set by the CONDITION NUMBER, not the entry
 * magnitudes — rescaling `Ginv` to O(1) (which the code does below, so `q` stays
 * in f32's precise range) does NOT fix it — so the residual is garbage, `invZ2`
 * amplifies it, the Sampson `dist` goes noisy, and the two hard discards flip
 * per-pixel coverage across the flared band — the reported speckle in Earth's
 * orbit fill.
 *
 * So we eliminate the cancellation SYMBOLICALLY here, in f64, and hand the
 * fragment the six affine coefficients directly.  Each is a 2×2 minor of
 * `Ginv`; the six that survive are (entries written `Ginv[col].row` to match the
 * WESL `ginv[c].r` access, and grouped by the gradient they drive):
 *
 *     ∂s/∂pₓ numerator = M1·py + M2,   ∂s/∂pᵧ numerator = −M1·px + M3
 *     ∂t/∂pₓ numerator = M4·py + M5,   ∂t/∂pᵧ numerator = −M4·px + M6
 *
 *     M1 = g00·g12 − g10·g02   M2 = g00·g22 − g20·g02   M3 = g10·g22 − g20·g12
 *     M4 = g01·g12 − g11·g02   M5 = g01·g22 − g21·g02   M6 = g11·g22 − g21·g12
 *
 * The cross-minor `M1` (resp. `M4`) appears once positive and once negated —
 * six DISTINCT coefficients, packed as `minorS = (M1, M2, M3)` (the `s`-row) and
 * `minorT = (M4, M5, M6)` (the `t`-row).  The fragment evaluates
 * `numerator · invZ2` with two multiply-adds instead of a cancelling
 * difference, so its f32 stays affine and clean.
 *
 * ### Why computing the minors in f64 CURES the cancellation (adj identity)
 *
 * `adj(Ginv) = det(Ginv)·Ginv⁻¹ = det(Ginv)·G`, and a 3×3 adjugate's entries
 * are exactly these signed 2×2 cofactor minors.  So each `Mᵢ` equals
 * `± det(Ginv)` times an entry of the WELL-CONDITIONED forward homography `G`
 * (plane → pixel, entries ~pixel scale).  Computing it in f64 from the f64
 * `Ginv` therefore lands on the true minor with ~6e-8 RELATIVE error; the old
 * f32 path's error was ~6e-8 of the two nearly-equal products, and because they
 * nearly cancel that absolute error swamps the tiny true difference — an
 * unbounded RELATIVE error, the condition number (~1e15) made visible (rescaling
 * the products to O(1) does not change the cancellation).  The minors narrow to
 * f32 last, at the upload boundary, carrying only that ~6e-8 relative error into
 * the shader.
 *
 * ### Why the minors come from the RESCALED `Ginv` (normalization consistency)
 *
 * Below, `Ginv` is rescaled by `k = 1/maxAbs` before narrowing so its f32
 * entries stay O(1).  Every fragment quantity is scale-invariant, and this holds
 * for the gradient too — BUT only if the two halves scale consistently.  A minor
 * is QUADRATIC in `Ginv`, so rescaling by `k` scales each `Mᵢ` by `k²`; the
 * fragment's `invZ2 = 1/q.z²` uses `q = (k·Ginv)·pixel`, so it scales by `1/k²`;
 * their product `Mᵢ·invZ2` is invariant — the true gradient at every pose.  That
 * cancellation is only exact if the minors are computed from the SAME rescaled
 * matrix that gets narrowed, so they are computed AFTER the rescale loop.
 *
 * ### Why the return ALSO carries the clip basis and a ribbon verdict
 *
 * The ribbon-impostor plan's Task 3 (spec §2): `clipBasis` is `(Cc, Ac, Bc)` —
 * the same `cC`/`cS`/`cT` triple below, narrowed rather than rederived — so the
 * vertex stage can bound the orbit with a screen-space ribbon instead of the
 * fullscreen fallback triangle. `ribbonEligible` is that verdict; its two-
 * clause predicate is derived beside its code, a few lines below `cC`.
 *
 * ### Landmine
 *
 * `mat3d.create()` / `mat3d.multiply` / `mat3d.inverse` all operate on the
 * 12-element padded layout (three vec4-aligned columns; see `narrowMat3`).
 * `mat3d.create(...)` returns ZEROS for any omitted argument (the wgpu-matrix
 * zero-init trap), so V is built by passing all nine values explicitly.
 *
 * @param slabVpF64        The slab's `f64` view-projection (`view.slab.vp` — the
 *                         `f64` seam; NEVER the narrowed `view.vp`).
 * @param centerMpc        Ellipse centre `C` in absolute world Mpc (parent focus
 *                         + centre-offset).
 * @param semiMajorMpc     Semi-major world vector `A = a·P̂w`.
 * @param semiMinorMpc     Semi-minor world vector `B = b·Q̂w`.
 * @param viewportPx       Backing-store viewport `(Wpx, Hpx)` (`SlabView.viewportPx`).
 * @param renderOriginMpc  The render origin the slab VP is relative to.
 * @returns  `ginv` — `Ginv` (pixel → plane) as a 12-element padded
 *           `mat3x3<f32>` (`Float32Array`, column-major std140); `minorS` /
 *           `minorT` — the six gradient minors `(M1, M2, M3)` / `(M4, M5, M6)`
 *           as length-4 padded `Float32Array`s; `clipBasis` — `(Cc, Ac, Bc)`,
 *           each length-4 padded, for the ribbon vertex stage; and
 *           `ribbonEligible` — whether the ribbon impostor bounds this
 *           projection. All composed in f64 and narrowed once at return.
 */

import { mat3d } from 'wgpu-matrix';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { narrowMat3 } from '../math/narrowMat3';

// Ribbon-vs-fullscreen NDC extent ceiling — see the predicate derivation
// beside its code, below, where it's actually applied.
const RIBBON_MAX_EXTENT_NDC = 20;

export function composeOrbitConic(
  slabVpF64: Float64Array,
  centerMpc: Readonly<Vec3>,
  semiMajorMpc: Readonly<Vec3>,
  semiMinorMpc: Readonly<Vec3>,
  viewportPx: Readonly<Vec2>,
  renderOriginMpc: Readonly<Vec3>,
): {
  ginv: Float32Array;
  minorS: Float32Array;
  minorT: Float32Array;
  /** (Cc, Ac, Bc), each a length-4 padded (clip.x, clip.y, clip.w, 0) — see the record layout. */
  clipBasis: readonly [Float32Array, Float32Array, Float32Array];
  /** true ⇒ the ribbon impostor bounds this projection; false ⇒ the fullscreen fallback. */
  ribbonEligible: boolean;
} {
  // Origin-relative ellipse centre — the frame the slab VP was built for (same
  // subtraction composeBodyMvp performs). Done in f64 so the ~1e-12 Mpc
  // separation survives the large-VP-translation cancellation downstream.
  const cx = centerMpc[0] - renderOriginMpc[0];
  const cy = centerMpc[1] - renderOriginMpc[1];
  const cz = centerMpc[2] - renderOriginMpc[2];

  // Clip = VP · v, keeping only the x, y, w rows (z is unused — depthless
  // additive draw). VP is column-major length-16, so row r reads VP[r], VP[4+r],
  // VP[8+r], VP[12+r]. Returns the [clip.x, clip.y, clip.w] triple for column v.
  const clipXYW = (vx: number, vy: number, vz: number, vw: number): Vec3 => [
    slabVpF64[0]! * vx + slabVpF64[4]! * vy + slabVpF64[8]! * vz + slabVpF64[12]! * vw,
    slabVpF64[1]! * vx + slabVpF64[5]! * vy + slabVpF64[9]! * vz + slabVpF64[13]! * vw,
    slabVpF64[3]! * vx + slabVpF64[7]! * vy + slabVpF64[11]! * vz + slabVpF64[15]! * vw,
  ];

  // The three homography columns: plane basis vectors carry w = 0 (directions),
  // the centre carries w = 1 (a point).
  const cS = clipXYW(semiMajorMpc[0], semiMajorMpc[1], semiMajorMpc[2], 0);
  const cT = clipXYW(semiMinorMpc[0], semiMinorMpc[1], semiMinorMpc[2], 0);
  const cC = clipXYW(cx, cy, cz, 1);

  // Ribbon-eligibility predicate (spec §2.1), from the clip columns alone,
  // before narrowing. clip.w(E) = Cc.w + cos(E)·Ac.w + sin(E)·Bc.w sweeps
  // [Cc.w − R, Cc.w + R], so wMin > 0 ⇔ no sign change ⇔ a genuine ellipse
  // (also rejects Cc.w < 0, the whole orbit behind the camera). `extent` is a
  // conservative NDC half-extent bound (triangle inequality on the sweep); it
  // subsumes the spec's relative-ε near-parabolic fallback — as the orbit
  // nears the camera plane, wMin → 0⁺ and extent → ∞ before f64 noise could
  // flip the sign test — and caps the ribbon's own fill cost (fill break-even
  // is ~16,500 px projected radius, ~15 NDC on a 4K viewport; RIBBON_MAX_EXTENT_NDC
  // = 20 sits slightly above that, but extent's conservatism — noted above —
  // means a projection scoring 20 usually has a true radius well below it, so
  // this is a perf-tuning knob, not a correctness threshold).
  const R = Math.hypot(cS[2], cT[2]);
  const wMin = cC[2] - R;
  const extent =
    (Math.hypot(cC[0], cC[1]) + Math.hypot(cS[0], cS[1]) + Math.hypot(cT[0], cT[1])) / wMin;
  const ribbonEligible = wMin > 0 && extent <= RIBBON_MAX_EXTENT_NDC;

  // H = [ cS | cT | cC ] (3×3, column-major). create(v0..v8) fills the padded
  // layout column by column: col0 = cS, col1 = cT, col2 = cC.
  const H = mat3d.create(
    cS[0],
    cS[1],
    cS[2],
    cT[0],
    cT[1],
    cT[2],
    cC[0],
    cC[1],
    cC[2],
  ) as Float64Array;

  // NDC→pixel viewport transform on the (x, y, w) sub-vector (spec §3.2):
  //     | 0.5·Wpx     0        0.5·Wpx |
  //     | 0          −0.5·Hpx   0.5·Hpx |   (−0.5·Hpx flips NDC-y-up to pixel-y-down)
  //     | 0           0         1       |
  // Column-major: col0 = [0.5W, 0, 0], col1 = [0, −0.5H, 0], col2 = [0.5W, 0.5H, 1].
  const halfW = 0.5 * viewportPx[0];
  const halfH = 0.5 * viewportPx[1];
  const V = mat3d.create(halfW, 0, 0, 0, -halfH, 0, halfW, halfH, 1) as Float64Array;

  // G = V · H (plane → homogeneous pixel), then Ginv = G⁻¹ (pixel → plane).
  const G = mat3d.multiply(V, H) as Float64Array;
  const Ginv = mat3d.inverse(G) as Float64Array;

  // Rescale so Ginv's largest entry is 1. The fragment reads ONLY scale-
  // invariant quantities off Ginv — the conic zero set (f = qᵀ·conic·q = 0), the
  // Sampson distance |f|/|∇f|, the plane coords s = qx/qz and t = qy/qz, and the
  // sign of qz — and every one is unchanged when Ginv is multiplied by a nonzero
  // constant (f and ∇f both scale by the SAME power, so their ratio is fixed).
  // But the raw inverse of a near-degenerate G (camera near the orbit's plane)
  // has entries up to ~1e15, so the fragment's f32 `q = Ginv·pixel` reaches
  // ~1e15, `f = qx²+qy²−qz²` and |∇f| reach ~1e30, and at that magnitude f32
  // loses the precision the Sampson RATIO needs — the corrupted ratio stays
  // below the stroke width across the WHOLE q.z>0 region, flooding it with faint
  // additive colour instead of a thin ring (and a hair more degenerate,
  // q² overflows to Inf → NaN). Normalising to O(1) keeps every fragment
  // quantity in f32's precise range at every pose, so the stroke stays a ring.
  // Real entries live at the padded-column indices 0,1,2 / 4,5,6 / 8,9,10 (see
  // narrowMat3); the pad lanes are irrelevant. A singular G (exact edge-on)
  // gives a non-finite max — skip rather than divide by ∞, leaving the fragment
  // discard to swallow that measure-zero pose.
  const realIndices = [0, 1, 2, 4, 5, 6, 8, 9, 10];
  let maxAbs = 0;
  for (const i of realIndices) {
    const v = Math.abs(Ginv[i]!);
    if (v > maxAbs) maxAbs = v;
  }
  if (maxAbs > 0 && Number.isFinite(maxAbs)) {
    for (const i of realIndices) Ginv[i]! /= maxAbs;
  }

  // The six gradient minors, computed in f64 from the RESCALED Ginv so the
  // fragment's affine ∂s/∂p, ∂t/∂p stay consistent with its rescaled `q`
  // (see the "normalization consistency" header section). Entries are read at
  // the padded-column indices (col0 = 0,1,2 / col1 = 4,5,6 / col2 = 8,9,10),
  // so gCR names the entry in padded column C, row R — matching the WESL
  // `ginv[C].R` access exactly. Forming each minor here in double precision
  // eliminates the catastrophic f32 cancellation of the old difference-of-
  // products form (see the "adj identity" header section).
  const g00 = Ginv[0]!;
  const g01 = Ginv[1]!;
  const g02 = Ginv[2]!;
  const g10 = Ginv[4]!;
  const g11 = Ginv[5]!;
  const g12 = Ginv[6]!;
  const g20 = Ginv[8]!;
  const g21 = Ginv[9]!;
  const g22 = Ginv[10]!;

  const m1 = g00 * g12 - g10 * g02;
  const m2 = g00 * g22 - g20 * g02;
  const m3 = g10 * g22 - g20 * g12;
  const m4 = g01 * g12 - g11 * g02;
  const m5 = g01 * g22 - g21 * g02;
  const m6 = g11 * g22 - g21 * g12;

  // Narrow once at the GPU-upload boundary. minorS drives ∂s/∂p, minorT drives
  // ∂t/∂p; clipBasis carries (Cc, Ac, Bc) for the ribbon vertex stage — each
  // padded to four lanes so it streams as a float32x4 instance attribute (the
  // fourth lane is unused pad, like each Ginv column's).
  return {
    ginv: narrowMat3(Ginv),
    minorS: new Float32Array([m1, m2, m3, 0]),
    minorT: new Float32Array([m4, m5, m6, 0]),
    clipBasis: [
      new Float32Array([cC[0], cC[1], cC[2], 0]),
      new Float32Array([cS[0], cS[1], cS[2], 0]),
      new Float32Array([cT[0], cT[1], cT[2], 0]),
    ],
    ribbonEligible,
  };
}
