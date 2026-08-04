/**
 * starExposureRamp — the scale-dependent DISPLAY exposure for the survey
 * starfield: a camera-distance ramp that brightens the whole star bin as the
 * camera pulls back from solar-system scale to whole-galaxy scale.
 *
 * ── Why the exposure must depend on scale (the perceptual why) ──────────────
 *
 * The star pass already deposits physically-correct inverse-square APPARENT
 * flux (see the derivation in `shaders/starCatalog/vertex.wesl`): a star's dot
 * dims as 1/d² exactly as its light does. That is correct radiometry, but it is
 * not enough for a legible PICTURE, because a monitor cannot dark-adapt the way
 * an eye does. Near the Sun the field is a few bright POINT sources against
 * black, and the eye (and monitor) want a modest exposure. Pulled back to
 * 10+ kpc the same field becomes the Milky Way's diffuse SURFACE brightness —
 * millions of faint dots whose summed light the un-adapting monitor renders far
 * too dim unless the whole field is lifted. The user eye-tunes this need at
 * THREE anchors: a baseline exposure (`nearX`, default 6x) at solar-system
 * scale (1 pc), a middle one (`midX`, default 23x) at the intermediate few-kpc
 * scale (3 kpc), and a larger one (`farX`, default 28x) at whole-galaxy scale
 * (10 kpc). This ramp interpolates piecewise between adjacent anchors — all
 * three live, so they can be dialled against the running renderer as the star
 * bins' local flux changes.
 *
 * ── Why a middle anchor: the two ends were right, the middle wasn't ──────────
 *
 * The near and far anchors alone leave the intermediate zone (~1–6 kpc) with no
 * lever: `farX` must stay high (~28) for whole-galaxy legibility at ≥10 kpc, but
 * a single log-linear ramp forced by that far value over-exposes the dense
 * central clump on the way there. A third anchor at 3 kpc splits the ramp into
 * two independent segments (near→mid, mid→far), so pulling `midX` down darkens
 * only the middle while both ends hold their eye-tuned values.
 *
 * ── The key fact that makes the default a no-op ──────────────────────────────
 *
 * A piecewise log-linear curve through three points that ALL LIE ON the old
 * two-point curve is IDENTICAL to that old curve: adding a knot that already
 * sits on a straight line doesn't bend it. The default `midX` is chosen as the
 * old curve's value at the 3 kpc anchor (see DEFAULT_STAR_EXPOSURE_MID_X), so at
 * the defaults this three-anchor ramp reproduces the previous look; only pulling
 * the mid slider OFF that continuation bends the middle segment.
 *
 * ── Why the near anchor is a DIVISION, not a return of 1.0 ──────────────────
 *
 * The near-anchor exposure is already folded into STAR_FLUX_EXPOSURE in the
 * shader (SHADER_BAKED_NEAR_EXPOSURE = 6). So at the SHIPPED near anchor the
 * ramp returns exactly 1.0 — the shader carries the whole near exposure. But the
 * moment the user moves `nearX` off 6, the CPU ramp must hand the DIFFERENCE
 * back out: its near-end multiplier is `nearX / SHADER_BAKED_NEAR_EXPOSURE`, so
 * `nearX = 12` doubles the near end (the shader still bakes 6, the ramp lifts
 * the remaining 2×). Likewise the far end returns `farX / 6`. At the defaults
 * (6, 28) this is bit-for-bit the previous fixed ramp: 1.0 at/inside the near
 * anchor rising to RAMP_FAR_SCALE = 28/6 at/beyond the far anchor.
 *
 * ── The alternative considered, and why not ────────────────────────────────
 *
 * The "correct" answer is true measured auto-exposure — integrate the frame's
 * luminance histogram and drive exposure to a target, the way a real camera or
 * the eye's iris does. Rejected: it is a global, stateful, frame-latency-prone
 * feedback loop (needs a luminance read-back, temporal smoothing to avoid
 * pumping, and couples exposure to whatever happens to be on screen — a bright
 * galaxy swinging through frame would dim the stars). This ramp is instead two
 * eye-tuned anchors and a deterministic function of camera distance: no
 * read-back, no state, no pumping, and retuning either end is a one-number edit.
 *
 * ── The interpolation: geometric, over log distance ────────────────────────
 *
 * Exposure is perceived logarithmically (it is the magnitude system's own
 * currency), so the ramp is a straight line in log-exposure vs log-distance:
 * each equal step in log₁₀(distance) multiplies the exposure by an equal RATIO.
 * Equivalently `scale(d) = nearScale · (farX / nearX) ^ t` with `t` linear in
 * log₁₀(d) — so the log-distance midpoint between the anchors lands on the
 * GEOMETRIC mean of the two anchor scales, not the arithmetic mean. That keeps
 * the brightening perceptually even across the descent rather than lurching.
 */

// The near-anchor exposure the SHADER already bakes into STAR_FLUX_EXPOSURE
// (2400 = 400 × 6 in `shaders/lib/starPhotometry.wesl`). The CPU ramp divides
// the live `nearX` by this baked constant so that at the shipped default
// (nearX = 6) the near end returns exactly 1.0 — the shader carries the whole
// near exposure — and a user-dialled nearX hands the DIFFERENCE back out.
export const SHADER_BAKED_NEAR_EXPOSURE = 6;

// Near anchor: 1 pc in Mpc. At or inside this the camera is effectively AT the
// starfield (solar-system scale); the ramp holds at its near-end multiplier
// (`nearX / SHADER_BAKED_NEAR_EXPOSURE`, = 1.0 at the default nearX = 6).
export const RAMP_NEAR_MPC = 1e-6;

// Middle anchor: 3 kpc in Mpc — the intermediate zone where a single near→far
// ramp over-exposes the dense central clump. The ramp passes through `midX`'s
// multiplier here, joining the near→mid and mid→far segments.
export const RAMP_MID_MPC = 3e-3;

// Far anchor: 10 kpc in Mpc — the whole-galaxy view, where the star bin reads as
// the Milky Way's diffuse surface brightness. At or beyond this the ramp holds
// at its far-end multiplier (`farX / SHADER_BAKED_NEAR_EXPOSURE`).
export const RAMP_FAR_MPC = 1e-2;

// The DEFAULT far exposure relative to the baked near baseline: the ratio of the
// two shipped anchors, 28x (far) over 6x (near). This is what the ramp returns
// at/beyond the far anchor when `farX` is left at its default; retained as the
// regression constant the ramp's tests pin the default behaviour against.
export const RAMP_FAR_SCALE = 28 / 6;

/**
 * The display-exposure multiplier at a given camera distance (Mpc). `nearX` /
 * `midX` / `farX` are the ABSOLUTE eye-tuned exposures at the three distance
 * anchors (defaults 6 / 23 / 28); internally the ramp works in multiples of the
 * shader-baked near exposure, so it returns `nearX / SHADER_BAKED_NEAR_EXPOSURE`
 * at/inside the near anchor, `farX / SHADER_BAKED_NEAR_EXPOSURE` at/beyond the
 * far anchor, and a PIECEWISE geometric (log-exposure-vs-log-distance linear)
 * interpolation between — near→mid across [near, mid], mid→far across [mid, far],
 * passing exactly through `midX`'s multiplier at the 3 kpc knot. A non-positive
 * distance is the near case (guarding log₁₀(0) = -∞).
 */
export function starExposureRamp(
  camDistMpc: number,
  nearX: number = SHADER_BAKED_NEAR_EXPOSURE,
  midX: number = 23,
  farX: number = 28,
): number {
  // The anchor multipliers, each expressed relative to the shader-baked near
  // exposure so the shipped default (6) returns 1.0 at the near end.
  const nearScale = nearX / SHADER_BAKED_NEAR_EXPOSURE;
  const midScale = midX / SHADER_BAKED_NEAR_EXPOSURE;
  if (camDistMpc <= RAMP_NEAR_MPC) return nearScale;
  if (camDistMpc >= RAMP_FAR_MPC) return farX / SHADER_BAKED_NEAR_EXPOSURE;

  // Geometric interpolation within one segment: walk log-linearly from the low
  // anchor's scale (t=0) to the high anchor's by multiplying by the anchor RATIO
  // (`hiX / loX`) raised to t — so a segment's log-midpoint lands on the
  // geometric mean of its two anchor scales. `t` is the fraction of the way
  // across the segment in log₁₀(distance) space.
  const logD = Math.log10(camDistMpc);
  if (camDistMpc <= RAMP_MID_MPC) {
    const t =
      (logD - Math.log10(RAMP_NEAR_MPC)) / (Math.log10(RAMP_MID_MPC) - Math.log10(RAMP_NEAR_MPC));
    return nearScale * (midX / nearX) ** t;
  }
  const t =
    (logD - Math.log10(RAMP_MID_MPC)) / (Math.log10(RAMP_FAR_MPC) - Math.log10(RAMP_MID_MPC));
  return midScale * (farX / midX) ** t;
}
