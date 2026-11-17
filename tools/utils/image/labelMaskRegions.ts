/**
 * labelMaskRegions — number every 4-connected region of 1-pixels in a 0/1 mask:
 * each pixel's region index, -1 off the mask, and how many regions there are.
 * 4-connected, so a one-pixel diagonal line (an engraved stroke) still parts two regions.
 */
export function labelMaskRegions(
  mask: Uint8Array,
  width: number,
  height: number,
): { readonly labels: Int32Array; readonly count: number } {
  const labels = new Int32Array(mask.length).fill(-1);
  const stack: number[] = [];
  let count = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || labels[seed]! >= 0) continue;
    labels[seed] = count;
    stack.push(seed);
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width]) {
        if (j < 0 || j >= width * height || !mask[j] || labels[j]! >= 0) continue;
        labels[j] = count;
        stack.push(j);
      }
    }
    count++;
  }
  return { labels, count };
}
