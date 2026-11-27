import { readSync } from 'node:fs';
import type { NpyHeader } from '../../@types/parsers/NpyHeader';

/** x-rows [x0, x0 + count) of an f32 `.npy`. x is slowest in C order, so the rows are one
 *  contiguous span: one positioned read, never the whole file (`readFileSync` refuses > 2 GiB). */
export function readNpySlab(
  fd: number,
  header: NpyHeader,
  x0: number,
  count: number,
): Float32Array {
  if (header.dtype !== '<f4') throw new Error(`readNpySlab: dtype ${header.dtype}, expected <f4`);
  const [nx, ...rest] = header.shape;
  if (x0 < 0 || x0 + count > nx!) {
    throw new Error(`readNpySlab: rows ${x0}..${x0 + count} leave the ${nx}-row file`);
  }
  const rowBytes = rest.reduce((a, b) => a * b, 4);
  const bytes = new Uint8Array(count * rowBytes);
  const start = header.dataOffset + x0 * rowBytes;
  // readSync may return short on a large read; only 0 means the file ended.
  for (let done = 0; done < bytes.length; ) {
    const n = readSync(fd, bytes, done, bytes.length - done, start + done);
    if (n === 0) throw new Error(`readNpySlab: file ends ${bytes.length - done} B short`);
    done += n;
  }
  return new Float32Array(bytes.buffer);
}
