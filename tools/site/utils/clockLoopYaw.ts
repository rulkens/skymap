import { loopYaw } from './loopYaw';

/** The camera's turn in radians `turn` (0 to 1) of the way through a clock film: whole turns about its target plus a swing out and back; zero when it has neither. */
export function clockLoopYaw(
  motion: { orbitTurns?: number; swayDeg?: number },
  turn: number,
): number {
  const { orbitTurns = 0, swayDeg = 0 } = motion;
  return loopYaw('orbit', turn * orbitTurns) + loopYaw({ swayDeg }, turn);
}
