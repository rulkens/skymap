/**
 * How far the camera has turned about its target, in radians, `turn` of the
 * way through a loop (0 to 1). An orbit goes once round; a sway swings out to
 * each side and back on a sine. Both are periodic in `turn`, position and
 * speed alike, which is what makes the loop seamless.
 */
export function loopYaw(motion: 'orbit' | { swayDeg: number }, turn: number): number {
  if (motion === 'orbit') return turn * 2 * Math.PI;
  return ((motion.swayDeg * Math.PI) / 180) * Math.sin(turn * 2 * Math.PI);
}
