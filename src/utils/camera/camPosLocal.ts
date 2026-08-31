/**
 * camPosLocal — the camera's position expressed in the frame where a body is
 * the UNIT SPHERE, in the world-mpc frame.
 *
 *   camera position + body position + radius + baked orientation + oblateness
 *                                                     →  local camera position
 *
 * The body render slabs migration moved every GPU-drawn body (Earth, planets,
 * textured bodies) onto `bodySlabCamLocal` — the metre-native, seam-relative
 * sibling that reduces this same per-axis divide to its final step, once the
 * seam has already subtracted the body centre and rotated into body axes. Its
 * header cites this one for the oblateness derivation rather than repeating
 * it, so this file's math stays live even though its own callers narrowed to
 * two: `drawFlooredSpherePick`'s r32uint pick-pass ray origin (the world-mpc
 * NEAR0 star-sphere layers) and `encodeAtmosphereSkyView`'s CPU-side altitude
 * + sun-zenith scalar bake — neither a PBR fragment, but both POSITION
 * consumers that need the same frame this util derives.
 *
 * ### What "local" means here — and when it is the model frame
 *
 * `composeBodyMvp` builds `T·R·S` with `S = diag(r, r, r·(1 − oblateness))`, so
 * the frame its shader-side vertices live in is the one where the body is the
 * unit sphere: dividing a world offset by the axis scales `S` applied is what
 * lands in it. For `oblateness = 0` those scales are equal and "the unit-sphere
 * frame" and "the model frame" are the same place. For a flattened body they are
 * NOT: the polar axis was shortened, so the polar component must be divided by
 * the SHORTENED radius `r·(1 − oblateness)`, not by the equatorial `r`. Getting
 * this wrong misplaces the camera by a factor `1/(1 − oblateness)` along the
 * pole — 54% at Achernar's 0.35 flattening.
 *
 * ### Why a POSITION consumer cares and a DIRECTION consumer barely does
 *
 * A direction consumer (Lambert `N·L`, the Minnaert view term) normalises what
 * it gets. A per-axis scale error survives normalisation only as a small angular
 * skew, which shifts a shading gradient a little and is invisible in practice —
 * which is why nothing noticed while every caller passed `oblateness = 0` and
 * the one caller that does not (`drawFlooredSpherePick`, via oblate scene stars)
 * fed a path that never read the value.
 *
 * A position consumer cannot absorb it. An analytic ray-sphere test takes this
 * vector as the RAY ORIGIN and intersects the unit sphere at the origin: put the
 * origin in a spheroid frame and the ray enters at the wrong point, so the
 * silhouette, the depth and the surface normal are all wrong together. Hence the
 * `oblateness` parameter, which is a FRAME correction, not an oblateness
 * feature — nothing downstream branches on "is this body flattened".
 *
 * ### Why this keeps magnitude where `sunDirLocal` does not
 *
 * `sunDirLocal` carries a *direction* into the local frame and normalises it —
 * a light direction has no length. The view vector, by contrast, is the
 * *difference of two positions*, so the camera's distance from the body centre
 * matters: it decides where on the sphere the specular highlight sits. Hence we
 * subtract the body centre, rotate, and DIVIDE by the per-axis radius (rather
 * than normalise) so a camera one radius above the surface lands at |local| = 2,
 * not on the unit sphere.
 *
 * ### Why transpose the orientation
 *
 * A body's baked `orientation` `R` is a *local→world* rotation (the same matrix
 * `composeBodyMvp` embeds as `T·R·S`): its columns are the body-local axes
 * written in world space. To carry a world-space vector *into* the local frame
 * we need the inverse, `R⁻¹`. `R` is orthonormal (a pure rotation), so its
 * inverse is exactly its transpose `Rᵀ` — no general 3×3 inversion required.
 * The local component along local axis `i` is the projection of the world offset
 * onto that axis, i.e. its dot with column `i` of `R`.
 *
 * ### Why compute this CPU-side, per body, per frame
 *
 * `camPosMpc` and `bodyPosMpc` are both origin-relative (heliocentric) Mpc; near
 * Earth their difference is a handful of Mpc riding on a ~kpc-to-Mpc pedestal,
 * so we take it in JS doubles where it resolves cleanly before narrowing to f32
 * — the same precision posture the `earthLayer` f64 seam documents
 * (`earthLayer.ts:16-30`). The shader then receives one already-local vector and
 * skips a per-fragment matrix multiply.
 */

import type { Mat3 } from '../../@types/math/Mat3';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * @param camPosMpc   Camera position in world-space Mpc (heliocentric).
 * @param bodyPosMpc  Body centre in world-space Mpc (heliocentric).
 * @param radiusMpc   EQUATORIAL body radius in Mpc — the same value passed to
 *                    `composeBodyMvp`.
 * @param orientation The body's baked local→world rotation `R` (`T·R·S`); pass
 *                    `IDENTITY_MAT3` for a rotation-invariant body.
 * @param oblateness  Flattening `(a − c)/a`, matching `composeBodyMvp`'s
 *                    parameter of the same name. The polar (local-Z) component
 *                    is divided by `radiusMpc·(1 − oblateness)`. Defaults to `0`
 *                    (a true sphere), which multiplies the polar divisor by
 *                    exactly 1.0 and so leaves every existing caller's result
 *                    bit-identical.
 */
export function camPosLocal(
  camPosMpc: Readonly<Vec3>,
  bodyPosMpc: Readonly<Vec3>,
  radiusMpc: number,
  orientation: Readonly<Mat3>,
  oblateness = 0,
): Vec3 {
  // World-space offset from the body centre to the camera.
  const wx = camPosMpc[0] - bodyPosMpc[0];
  const wy = camPosMpc[1] - bodyPosMpc[1];
  const wz = camPosMpc[2] - bodyPosMpc[2];

  // The two axis scales `composeBodyMvp` puts in `S`. `composeBodyMvp` documents
  // oblateness as `(a − c)/a` and imposes no runtime range, because it
  // MULTIPLIES by the factor: a non-physical 1 collapses the body to a disc and
  // anything larger mirrors it, both finite. Here we DIVIDE, so 1 would emit
  // ±Infinity into a ray origin and poison every dot product downstream. Same
  // posture — the range lives in the docblock, not in a validator — plus the one
  // guard division actually needs: a strictly positive floor, so a non-physical
  // input yields a meaningless-but-finite vector rather than a NaN cascade.
  const equatorialMpc = radiusMpc;
  const polarMpc = radiusMpc * Math.max(1 - oblateness, Number.EPSILON);

  // Rᵀ · offset: local component along local axis i = dot(offset, column i of R).
  // Column-major (cell row r, col c at m[c*3+r]) ⇒ column i occupies m[i*3..i*3+2].
  // Divide by the per-axis radius so the result is measured in the units of the
  // frame where the body is the unit sphere — the frame the interpolated
  // normalLocal surface positions live in.
  const m = orientation;
  return [
    (m[0] * wx + m[1] * wy + m[2] * wz) / equatorialMpc,
    (m[3] * wx + m[4] * wy + m[5] * wz) / equatorialMpc,
    (m[6] * wx + m[7] * wy + m[8] * wz) / polarMpc,
  ];
}
