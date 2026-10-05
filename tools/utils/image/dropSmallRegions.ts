/**
 * dropSmallRegions — set to NaN every 8-connected region of valid (non-NaN)
 * cells smaller than `minFraction` of the largest region, in place. Wraps in x.
 * The Schenk Ariel DEM carries digitised limb-profile arcs, one cell thin,
 * far from the stereo coverage; left in, they bake into ridges. Dotted arcs are
 * 8-connected, so the diagonal neighbours are needed to see them as one region.
 */
export function dropSmallRegions(
  grid: Float32Array,
  width: number,
  height: number,
  minFraction: number,
): void {
  const label = new Int32Array(grid.length).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let seed = 0; seed < grid.length; seed++) {
    if (Number.isNaN(grid[seed]!) || label[seed]! >= 0) continue;
    const id = sizes.length;
    let size = 0;
    label[seed] = id;
    stack.push(seed);
    while (stack.length > 0) {
      const i = stack.pop()!;
      size++;
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const j = yy * width + ((x + dx + width) % width);
          if (Number.isNaN(grid[j]!) || label[j]! >= 0) continue;
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
  }
  const keepAbove = minFraction * Math.max(0, ...sizes);
  for (let i = 0; i < grid.length; i++) {
    if (label[i]! >= 0 && sizes[label[i]!]! < keepAbove) grid[i] = NaN;
  }
}
