/**
 * orbitTrailFade — the per-orbit visibility fade in `[0, 1]` for one conic
 * orbit trail, computed on the CPU from the camera-to-orbit geometry.
 *
 * ### Why a two-sided fade
 *
 * A screen-space conic trail is drawn by inverting the plane→pixel homography
 * `H` (see `composeOrbitConic`). That homography is well-conditioned only when
 * the camera sits comfortably OUTSIDE the ellipse and the ellipse subtends a
 * sane on-screen size. Two regimes break it, and both are culled here:
 *
 *   - **Inside-cull.** When the camera enters / sits on an orbit (standing at
 *     Earth you are ON the 1-AU heliocentric orbit and INSIDE Jupiter's 5.2-AU
 *     orbit), the plane→pixel homography becomes ill-conditioned, `Ginv` blows
 *     up, and the fixed-pixel Sampson stroke smears into a screen-filling
 *     "bowtie" wedge. Fading OUT before the camera reaches the orbit kills the
 *     degeneracy before it can be projected at all.
 *
 *   - **Far-cull.** Zoomed far out, an orbit shrinks below a pixel yet its
 *     stroke never fades — a persistent painted dot. Fading OUT as the apparent
 *     semi-major drops toward a pixel removes it cleanly.
 *
 * ### Why distance-vs-semi-major, not the projected ellipse
 *
 * The inside test compares the camera→centre distance against the semi-major
 * length — a ratio that is ALWAYS well-defined, in plain world Mpc. The
 * tempting alternative — projecting the ellipse and measuring its on-screen
 * extent — is exactly the computation that degenerates in the regime we are
 * trying to detect, so it cannot be the detector. The far test uses the
 * small-angle apparent size `(a / dc) · pxPerRad`, which stays finite for any
 * outside camera.
 *
 * Both bounds are smoothsteps so orbits fade in/out instead of popping. The
 * magnitudes are tiny — semi-major axes run ~1e-12..1e-14 Mpc — but f64 resolves
 * their differences to ~14 significant figures, so the arithmetic runs in plain
 * JS numbers with no special scaling.
 */

import type { Vec3 } from '../../@types/math/Vec3';

// Fade OUT as the camera enters the orbit. `ratio = camera→centre distance /
// semi-major`: <1 inside, 1 on the orbit, >1 outside. The window is generous
// because the homography is already visibly straining well before the camera
// literally crosses the ellipse.
const INSIDE_LO_RATIO = 1.5; // fade reaches 0 when the camera is within 1.5× semi-major of the centre
const INSIDE_HI_RATIO = 4.0; // full brightness once ≥4× semi-major outside
// Fade OUT as the ellipse goes sub-pixel. Bounds are apparent semi-major in
// screen pixels.
const FAR_LO_PX = 6; // fade reaches 0 below ~6 px apparent semi-major
const FAR_HI_PX = 40; // full brightness at ≥40 px

// Hermite smoothstep — GLSL's, in JS. Private local: the util exports exactly
// one symbol, and this is a two-line helper the fade owns rather than a shared
// concept worth its own file. Guards `edge1 <= edge0` so a degenerate window
// behaves as a hard step instead of dividing by zero.
function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * @param camPosRel        `view.camPos` — origin-relative eye (== `cam.position`).
 * @param centerMpc        Absolute orbit centre (`SCENE_ORBIT_CONICS[i].centerMpc`).
 * @param semiMajorMpc     World semi-major vector `A`.
 * @param renderOriginMpc  `RENDER_ORIGIN_MPC` — the frame `camPosRel` is relative to.
 * @param drawPxPerRad     `ctx.drawPxPerRad` = canvasHeight / (2·tan(fovY/2)).
 * @returns  Visibility fade in `[0, 1]`; 0 means "do not draw".
 */
export function orbitTrailFade(
  camPosRel: Readonly<Vec3>,
  centerMpc: Readonly<Vec3>,
  semiMajorMpc: Readonly<Vec3>,
  renderOriginMpc: Readonly<Vec3>,
  drawPxPerRad: number,
): number {
  // Semi-major length in Mpc.
  const a = Math.hypot(semiMajorMpc[0], semiMajorMpc[1], semiMajorMpc[2]);

  // Origin-relative centre — the same subtraction composeOrbitConic performs,
  // so both speak the frame `camPosRel` lives in.
  const crx = centerMpc[0] - renderOriginMpc[0];
  const cry = centerMpc[1] - renderOriginMpc[1];
  const crz = centerMpc[2] - renderOriginMpc[2];

  // Camera→centre distance in Mpc.
  const dc = Math.hypot(camPosRel[0] - crx, camPosRel[1] - cry, camPosRel[2] - crz);

  // Degenerate orbit or camera exactly at the centre — nothing sane to draw.
  if (a <= 0 || dc <= 0) return 0;

  const ratio = dc / a; // <1 inside, 1 on the orbit, >1 outside
  const fadeInside = smoothstep(INSIDE_LO_RATIO, INSIDE_HI_RATIO, ratio);

  const apparentPx = (a / dc) * drawPxPerRad; // small-angle apparent semi-major, px
  const fadeFar = smoothstep(FAR_LO_PX, FAR_HI_PX, apparentPx);

  return fadeInside * fadeFar;
}
