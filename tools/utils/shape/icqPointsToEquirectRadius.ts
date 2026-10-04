/**
 * icqPointsToEquirectRadius — rasterise a shape-model point cloud (body-fixed xyz,
 * km) into an equirect grid of radius, in the texture grid's convention: row 0 =
 * north, column u = 0.5 + eastLon/360, wrapping in x.
 *
 * The cube-face sampling is uneven on the sphere, so some cells (mostly near the
 * poles) receive no point; they are filled from filled neighbours until none are
 * left. `lonOffsetDeg` is how far the shape's east longitude runs AHEAD of the
 * texture's at the same surface spot (their prime-meridian constants differ).
 */

const DEG = Math.PI / 180;

export function icqPointsToEquirectRadius(
  points: ArrayLike<number>,
  width: number,
  height: number,
  lonOffsetDeg: number,
): Float32Array {
  const sum = new Float64Array(width * height);
  const weight = new Float64Array(width * height);

  for (let i = 0; i + 2 < points.length; i += 3) {
    const x = points[i]!;
    const y = points[i + 1]!;
    const z = points[i + 2]!;
    const r = Math.hypot(x, y, z);
    const textureLonDeg = Math.atan2(y, x) / DEG - lonOffsetDeg;
    // Cell centres sit at integer + 0.5, hence the -0.5 before flooring.
    const fx = (0.5 + textureLonDeg / 360) * width - 0.5;
    const fy = (0.5 - Math.asin(z / r) / Math.PI) * height - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    for (let dy = 0; dy <= 1; dy++) {
      const row = Math.min(height - 1, Math.max(0, y0 + dy));
      for (let dx = 0; dx <= 1; dx++) {
        const col = (((x0 + dx) % width) + width) % width;
        const w = (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
        sum[row * width + col]! += w * r;
        weight[row * width + col]! += w;
      }
    }
  }

  const grid = new Float32Array(width * height);
  const filled = new Uint8Array(width * height);
  let empty = 0;
  for (let i = 0; i < grid.length; i++) {
    if (weight[i]! > 1e-9) {
      grid[i] = sum[i]! / weight[i]!;
      filled[i] = 1;
    } else empty++;
  }

  while (empty > 0) {
    const newlyFilled: number[] = [];
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        if (filled[row * width + col]) continue;
        let acc = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const r2 = row + dy;
          if (r2 < 0 || r2 >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const idx = r2 * width + ((((col + dx) % width) + width) % width);
            if (filled[idx]) {
              acc += grid[idx]!;
              n++;
            }
          }
        }
        if (n > 0) {
          grid[row * width + col] = acc / n;
          newlyFilled.push(row * width + col);
        }
      }
    }
    // Commit after the pass so a fill reads only cells that were filled before it.
    for (const idx of newlyFilled) filled[idx] = 1;
    if (newlyFilled.length === 0) break;
    empty -= newlyFilled.length;
  }
  return grid;
}
