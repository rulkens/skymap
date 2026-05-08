/**
 * youAreHereVisibility — alpha-from-distance for the "YOU ARE HERE"
 * marker on the Milky Way.
 *
 * Why these numbers?  At >2 Mpc the camera is looking at large-scale
 * structure (the Local Volume disappears as a single pixel cluster);
 * a label there would be visual noise.  At <0.6 Mpc the camera is
 * inside the Local Group, where the marker is genuinely useful for
 * orientation.  Values are tuneable; tweak after visual review.
 *
 * The fade band uses `smoothstep` for ease-in/ease-out so the marker
 * doesn't pop in or snap out — render-on-demand will keep the frame
 * loop awake as long as alpha is mid-transition.
 */

export const YOU_ARE_HERE_NEAR_MPC = 0.6;
export const YOU_ARE_HERE_FAR_MPC = 2.0;

export function youAreHereAlpha(cameraDistMpc: number): number {
  if (cameraDistMpc <= YOU_ARE_HERE_NEAR_MPC) return 1;
  if (cameraDistMpc >= YOU_ARE_HERE_FAR_MPC) return 0;
  const t = (cameraDistMpc - YOU_ARE_HERE_NEAR_MPC) / (YOU_ARE_HERE_FAR_MPC - YOU_ARE_HERE_NEAR_MPC);
  // smoothstep, inverted so the result is 1 at t=0 and 0 at t=1.
  const s = t * t * (3 - 2 * t);
  return 1 - s;
}
