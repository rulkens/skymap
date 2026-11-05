/**
 * readIcqPoints — parse a Gaskell `*_quadQ.tab` shape model: line 1 is Q, then
 * 6·(Q+1)² lines of `x y z` in km. The cube-face order is irrelevant to the
 * rasteriser, so the result is a flat xyz point cloud.
 */

import { readFileSync } from 'node:fs';

export function readIcqPoints(path: string): Float32Array {
  const lines = readFileSync(path, 'latin1').split('\n');
  const q = Number(lines[0]!.trim());
  const count = 6 * (q + 1) ** 2;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = lines[i + 1]!.trim().split(/\s+/);
    out[i * 3] = Number(x);
    out[i * 3 + 1] = Number(y);
    out[i * 3 + 2] = Number(z);
  }
  return out;
}
