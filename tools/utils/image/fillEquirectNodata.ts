/**
 * fillEquirectNodata — replace NaN cells of an equirect grid, in place, with the
 * mean of their filled 4-neighbours, growing inward one ring per pass until none
 * are left. Wraps in x, clamps in y (the poles). Each ring is computed from the
 * grid as the previous pass left it, so the fill does not smear directionally
 * with scan order. Only the ring's own cells are visited, so a regional map on a
 * mostly empty globe costs the filled area, not rings times the whole grid.
 */
export function fillEquirectNodata(grid: Float32Array, width: number, height: number): void {
  const neighbours = (i: number): number[] => {
    const x = i % width;
    const y = (i - x) / width;
    const out = [y * width + ((x + 1) % width), y * width + ((x - 1 + width) % width)];
    if (y + 1 < height) out.push(i + width);
    if (y > 0) out.push(i - width);
    return out;
  };

  const queued = new Uint8Array(grid.length);
  let ring: number[] = [];
  const enqueueEmptyNeighbours = (i: number): void => {
    for (const n of neighbours(i)) {
      if (Number.isNaN(grid[n]!) && !queued[n]) {
        queued[n] = 1;
        ring.push(n);
      }
    }
  };
  for (let i = 0; i < grid.length; i++) if (!Number.isNaN(grid[i]!)) enqueueEmptyNeighbours(i);

  while (ring.length > 0) {
    const cells = ring;
    const values = cells.map((i) => {
      let acc = 0;
      let n = 0;
      for (const j of neighbours(i)) {
        const v = grid[j]!;
        if (!Number.isNaN(v)) {
          acc += v;
          n++;
        }
      }
      return acc / n;
    });
    ring = [];
    cells.forEach((i, k) => (grid[i] = values[k]!));
    for (const i of cells) enqueueEmptyNeighbours(i);
  }
}
