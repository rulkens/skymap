/** Snap a time to the nearest target within SNAP_PX on screen, else return it unchanged. */
const SNAP_PX = 6;

export function snapTime(sec: number, targets: readonly number[], secPerPx: number): number {
  let nearest: number | null = null;
  for (const target of targets) {
    if (nearest === null || Math.abs(target - sec) < Math.abs(nearest - sec)) nearest = target;
  }
  return nearest === null || Math.abs(nearest - sec) > SNAP_PX * secPerPx ? sec : nearest;
}
