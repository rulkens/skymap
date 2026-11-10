/** Snap a time to the nearest target within SNAP_PX on screen; `snapped` is the target hit, or null. */
const SNAP_PX = 6;

export function snapTime(
  sec: number,
  targets: readonly number[],
  secPerPx: number,
): { sec: number; snapped: number | null } {
  let nearest: number | null = null;
  for (const target of targets) {
    if (nearest === null || Math.abs(target - sec) < Math.abs(nearest - sec)) nearest = target;
  }
  if (nearest === null || Math.abs(nearest - sec) > SNAP_PX * secPerPx)
    return { sec, snapped: null };
  return { sec: nearest, snapped: nearest };
}
