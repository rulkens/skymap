/**
 * fillEquirectNodata — replace NaN cells of an equirect grid, in place, with the
 * mean of their filled 4-neighbours, growing inward one ring per pass until none
 * are left. Wraps in x, clamps in y (the poles). The ring grows from a snapshot
 * so the fill does not smear directionally with scan order.
 */
export function fillEquirectNodata(grid: Float32Array, width: number, height: number): void {
  let remaining = 1;
  while (remaining > 0) {
    remaining = 0;
    let progressed = false;
    const next = grid.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!Number.isNaN(grid[i]!)) continue;
        let acc = 0;
        let n = 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const yy = y + dy;
          if (yy < 0 || yy >= height) continue;
          const v = grid[yy * width + ((x + dx + width) % width)]!;
          if (!Number.isNaN(v)) {
            acc += v;
            n++;
          }
        }
        if (n > 0) {
          next[i] = acc / n;
          progressed = true;
        } else remaining++;
      }
    }
    grid.set(next);
    if (!progressed) break; // an all-NaN grid has nothing to grow from
  }
}
