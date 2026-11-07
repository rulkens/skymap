/**
 * How much of a star at (x, y) stays beside the boxes (left, top, right, bottom per four numbers): none
 * within `pad` of a box, rising smoothly to all of it `feather` further out. The website's rule, so
 * words sit on clear black here as they do on its pages.
 */
export function starFade(
  x: number,
  y: number,
  boxes: readonly number[],
  pad: number,
  feather: number,
): number {
  let fade = 1;
  for (let k = 0; k < boxes.length; k += 4) {
    const dx = Math.max(boxes[k]! - x, 0, x - boxes[k + 2]!);
    const dy = Math.max(boxes[k + 1]! - y, 0, y - boxes[k + 3]!);
    const d = Math.hypot(dx, dy);
    if (d >= pad + feather) continue;
    const t = Math.max(0, d - pad) / feather;
    fade = Math.min(fade, t * t * (3 - 2 * t));
    if (fade === 0) return 0;
  }
  return fade;
}
