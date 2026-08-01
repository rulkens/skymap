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
 * ### Why the return is `Ginv` PLUS the clip basis
 *
 * `Ginv` is the only per-orbit matrix the fragment needs to back-project a
 * pixel: from the single product `q = Ginv·(px, py, 1)` it derives the
 * behind-camera clip (`q.z = 1/w`), the plane coords / eccentric anomaly
 * (`s = q.x/q.z`, `t = q.y/q.z`, `E = atan2(t, s)`) and the stroke `r = √(s²+t²)`.
 * The pixel gradient of `r` that the antialiasing needs is measured
 * EMPIRICALLY on the GPU with screen-space derivatives (`dpdx`/`dpdy` of `r` in
 * the fragment), not derived analytically here — see `fragment.wesl`'s header
 * for why that sidesteps the f32 cancellation an analytic gradient hit for a
 * hugely-projected orbit.
 *
 * The ribbon-impostor plan's Task 3 (spec §2) is why the second return field,
 * `clipBasis`, is `(Cc, Ac, Bc)` — the same `cC`/`cS`/`cT` triple below,
 * narrowed rather than rederived — so the vertex stage can walk a screen-space
 * ribbon across exactly the third return field, `arc`: the in-front-of-camera
 * E-interval this function clips to in closed form (see its own doc below).
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
 *           `mat3x3<f32>` (`Float32Array`, column-major std140); `clipBasis` —
 *           `(Cc, Ac, Bc)`, each length-4 padded, for the ribbon vertex stage.
 *           Both composed in f64 and narrowed once at return.
 */

import { mat3d } from 'wgpu-matrix';
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { narrowMat3 } from '../math/narrowMat3';

export function composeOrbitConic(
  slabVpF64: Float64Array,
  centerMpc: Readonly<Vec3>,
  semiMajorMpc: Readonly<Vec3>,
  semiMinorMpc: Readonly<Vec3>,
  viewportPx: Readonly<Vec2>,
  renderOriginMpc: Readonly<Vec3>,
): {
  ginv: Float32Array;
  /** (Cc, Ac, Bc), each a length-4 padded (clip.x, clip.y, clip.w, 0) — see the record layout. */
  clipBasis: readonly [Float32Array, Float32Array, Float32Array];
  /**
   * The in-front-of-camera arc as `[eStart, eSpan]` (radians). Clip-w along the
   * orbit is `w(E) = Cw + R·cos(E − φ)` — a pure sinusoid — so the visible part
   * is EXACTLY one E-interval, computed here in closed form (f64). `eSpan` is
   * `TAU` when the whole orbit is in front (also the fallthrough for a
   * non-finite `Cw`/`R`, contained downstream: NaN vertices drop the
   * primitive and the fragment's guards fail closed), `0` when none of it is
   * (cull); the vertex stage samples only inside the interval, so geometry
   * for the behind-camera arc never exists.
   */
  arc: readonly [number, number];
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

  // Visible arc in closed form, in f64. w(E) = Cw + Aw·cosE + Bw·sinE
  // = Cw + R·cos(E − φ); the arc is where w exceeds epsW, the same threshold
  // the vertex stage's unguarded clip.w divide depends on staying positive.
  // epsW is a RELATIVE fraction of the clip-w swing (|cw| + wAmp), unrelated
  // to vertex.wesl's CLOSED_SPAN_EPS (radians of E) despite the coincident
  // 1e-4 magnitude. 1e-4, not 1e-6: at the worst pose (cw ≈ 0) f32-narrowing
  // eStart/eSpan alone spends ~75% of a 1e-6 budget, leaving ~50-180× margin
  // (measured, worst to best endpoint) against the shader re-sampling w(E)
  // from the narrowed basis. That margin rests on real hardware trig being
  // ~1 ulp, NOT on WGSL's guaranteed-but-loose 2^-11 sin/cos floor, which
  // this epsW would not clear — at the cost of ≤1e-4 rad of arc that was
  // already >1e4 px off-screen.
  const cw = cC[2];
  const aw = cS[2];
  const bw = cT[2];
  const wAmp = Math.hypot(aw, bw);
  const epsW = 1e-4 * (Math.abs(cw) + wAmp);
  const TAU = 2 * Math.PI;
  let eStart = 0;
  let eSpan = TAU;
  if (cw + wAmp <= epsW) {
    eSpan = 0; // entirely behind — the caller culls the instance
  } else if (cw - wAmp <= epsW) {
    const phi = Math.atan2(bw, aw);
    const alpha = Math.acos(Math.min(1, Math.max(-1, (epsW - cw) / wAmp)));
    eStart = phi - alpha;
    eSpan = 2 * alpha;
  }

  // Narrow once at the GPU-upload boundary. clipBasis carries (Cc, Ac, Bc)
  // for the ribbon vertex stage — each padded to four lanes so it streams as
  // a float32x4 instance attribute (the fourth lane is unused pad, like each
  // Ginv column's).
  return {
    ginv: narrowMat3(Ginv),
    clipBasis: [
      new Float32Array([cC[0], cC[1], cC[2], 0]),
      new Float32Array([cS[0], cS[1], cS[2], 0]),
      new Float32Array([cT[0], cT[1], cT[2], 0]),
    ],
    arc: [eStart, eSpan],
  };
}
