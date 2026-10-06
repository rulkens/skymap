/** The camera's turn about its target in radians, `turn` (0 to 1) of the way through a loop; periodic in position and speed, so the loop has no seam. */
export function loopYaw(motion: 'orbit' | { swayDeg: number }, turn: number): number {
  if (motion === 'orbit') return turn * 2 * Math.PI;
  return ((motion.swayDeg * Math.PI) / 180) * Math.sin(turn * 2 * Math.PI);
}
