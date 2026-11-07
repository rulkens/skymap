import type { Rectangle } from 'electron';

/**
 * Where a windowed sky goes: its remembered bounds while their top edge (the drag strip) still lies on
 * some screen, so it can be moved; otherwise three quarters of `home`, centred.
 */
export function windowBounds(
  remembered: Rectangle | null,
  workAreas: readonly Rectangle[],
  home: Rectangle,
): Rectangle {
  const reachable =
    remembered !== null &&
    workAreas.some(
      (a) =>
        remembered.y >= a.y &&
        remembered.y < a.y + a.height &&
        Math.min(remembered.x + remembered.width, a.x + a.width) - Math.max(remembered.x, a.x) >=
          100,
    );
  if (reachable) return remembered;
  return {
    x: Math.round(home.x + home.width * 0.125),
    y: Math.round(home.y + home.height * 0.125),
    width: Math.round(home.width * 0.75),
    height: Math.round(home.height * 0.75),
  };
}
