// Tuning anchors live in `data/starExposureRamp.ts`, documented there.
import {
  SHADER_BAKED_NEAR_EXPOSURE,
  RAMP_NEAR_MPC,
  RAMP_MID_MPC,
  RAMP_FAR_MPC,
} from '../../data/starExposureRamp';

/**
 * DISPLAY exposure multiplier at a camera distance, lifting the starfield
 * from a near-field baseline to a whole-galaxy anchor as the camera pulls
 * back (physically-correct inverse-square flux dims too fast for a monitor
 * that can't dark-adapt). Three eye-tuned ABSOLUTE anchors (`nearX`/`midX`/
 * `farX`, defaults 6/23/28 at the `RAMP_*_MPC` distances), geometric
 * (log-exposure vs log-distance) between them. The near anchor is a
 * DIVISION, not 1.0: the shader already bakes `SHADER_BAKED_NEAR_EXPOSURE`
 * into `STAR_FLUX_EXPOSURE`, so this hands back only the DIFFERENCE —
 * `nearX / SHADER_BAKED_NEAR_EXPOSURE`, exactly 1.0 at the shipped default.
 */
export function starExposureRamp(
  camDistMpc: number,
  nearX: number = SHADER_BAKED_NEAR_EXPOSURE,
  midX: number = 23,
  farX: number = 28,
): number {
  const nearScale = nearX / SHADER_BAKED_NEAR_EXPOSURE;
  const midScale = midX / SHADER_BAKED_NEAR_EXPOSURE;
  if (camDistMpc <= RAMP_NEAR_MPC) return nearScale;
  if (camDistMpc >= RAMP_FAR_MPC) return farX / SHADER_BAKED_NEAR_EXPOSURE;

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
