import type { NpyHeader } from '../../@types/parsers/NpyHeader';
import { readNpySlab } from './readNpySlab';

/** The raw max over a whole f32 `.npy`, read in slabs of about 128 MiB. */
export function npyPeak(fd: number, header: NpyHeader): number {
  const [nx, ...rest] = header.shape;
  const rowBytes = rest.reduce((a, b) => a * b, 4);
  const rowsPerRead = Math.max(1, Math.floor(2 ** 27 / rowBytes));
  let peak = -Infinity;
  for (let x0 = 0; x0 < nx!; x0 += rowsPerRead) {
    for (const v of readNpySlab(fd, header, x0, Math.min(rowsPerRead, nx! - x0))) {
      if (v > peak) peak = v;
    }
  }
  return peak;
}
