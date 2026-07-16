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
 * too dim unless the whole field is lifted. The user eye-tuned this need at two
 * anchors: ~15x baseline exposure at solar-system scale, ~70x at whole-galaxy
 * scale. This ramp interpolates between those two eye-tuned anchors.
 *
 * (The 15x near anchor is already folded into STAR_FLUX_EXPOSURE in the shader,
 * so this ramp returns a RELATIVE trim: 1.0 at/inside the near anchor, rising to
 * RAMP_FAR_SCALE = 70/15 at/beyond the far anchor.)
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
 * Equivalently `scale(d) = RAMP_FAR_SCALE ^ t` with `t` linear in log₁₀(d) — so
 * the log-distance midpoint between the anchors lands on the GEOMETRIC mean of
 * the two anchor scales (√RAMP_FAR_SCALE), not the arithmetic mean. That keeps
 * the brightening perceptually even across the descent rather than lurching.
 */

// Near anchor: 1 pc in Mpc. At or inside this the camera is effectively AT the
// starfield (solar-system scale) and the ramp is the identity (1.0). The near
// eye-tuned exposure (15x) is already baked into STAR_FLUX_EXPOSURE.
export const RAMP_NEAR_MPC = 1e-6;

// Far anchor: 10 kpc in Mpc — the whole-galaxy view, where the star bin reads as
// the Milky Way's diffuse surface brightness. At or beyond this the ramp holds
// at RAMP_FAR_SCALE.
export const RAMP_FAR_MPC = 1e-2;

// The far exposure relative to the near baseline: the ratio of the user's two
// eye-tuned display exposures, 70x (far) over 15x (near). Written as the quotient
// so retuning either eye-tuned end is a one-number edit here.
export const RAMP_FAR_SCALE = 70 / 15;

/**
 * The display-exposure multiplier at a given camera distance (Mpc): 1.0 at/inside
 * the near anchor, RAMP_FAR_SCALE at/beyond the far anchor, and a geometric
 * (log-exposure-vs-log-distance linear) interpolation between. A non-positive
 * distance returns 1.0 — a camera coincident with the origin is the near case,
 * and it also guards log₁₀(0) = -∞.
 */
export function starExposureRamp(camDistMpc: number): number {
  if (camDistMpc <= RAMP_NEAR_MPC) return 1.0;
  if (camDistMpc >= RAMP_FAR_MPC) return RAMP_FAR_SCALE;

  // t: the fraction of the way across the band in log₁₀(distance) space.
  const t =
    (Math.log10(camDistMpc) - Math.log10(RAMP_NEAR_MPC)) /
    (Math.log10(RAMP_FAR_MPC) - Math.log10(RAMP_NEAR_MPC));
  // Geometric interpolation: the near scale is 1.0 = RAMP_FAR_SCALE^0, so raising
  // RAMP_FAR_SCALE to t walks log-linearly from 1.0 (t=0) to RAMP_FAR_SCALE (t=1),
  // with the log-midpoint on the geometric mean of the anchor scales.
  return RAMP_FAR_SCALE ** t;
}
