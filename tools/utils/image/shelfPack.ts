/**
 * shelfPack — place rects on horizontal shelves, tallest first, no wider than
 * `maxWidth`. `gutter` px separate every rect from its neighbours and from the
 * atlas edge, so bilinear taps and mip levels never bleed across sprites.
 */
import type { PackedRect } from '../../@types/image/PackedRect';
import type { ShelfPacking } from '../../@types/image/ShelfPacking';

export function shelfPack(
  sizes: readonly Pick<PackedRect, 'w' | 'h'>[],
  maxWidth: number,
  gutter: number,
): ShelfPacking {
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.h - sizes[a]!.h);
  const rects: PackedRect[] = new Array(sizes.length);
  let x = gutter;
  let shelfY = gutter;
  let shelfH = 0;
  let width = 0;
  for (const i of order) {
    const { w, h } = sizes[i]!;
    if (w + 2 * gutter > maxWidth) throw new Error(`shelfPack: ${w} px rect exceeds ${maxWidth}`);
    if (x + w + gutter > maxWidth) {
      shelfY += shelfH + gutter;
      x = gutter;
      shelfH = 0;
    }
    rects[i] = { x, y: shelfY, w, h };
    x += w + gutter;
    shelfH = Math.max(shelfH, h);
    width = Math.max(width, x);
  }
  return { width, height: shelfY + shelfH + gutter, rects };
}
