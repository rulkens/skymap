import { openSync, closeSync, fstatSync, readSync } from 'node:fs';

const DEFAULT_CHUNK_BYTES = 256 * 1024 * 1024; // 256 MiB, comfortably under fs's 2 GiB single-read ceiling

/**
 * readFileChunked — read a whole file into one preallocated `Buffer` via
 * repeated `fs.readSync` calls, not `fs.readFileSync`. Node's
 * `readFileSync` hard-refuses files over 2 GiB (`ERR_FS_FILE_TOO_LARGE`,
 * confirmed against the real 2.49 GB `trace.bin` — T23's report);
 * `readSync` has no such ceiling since each call is bounded by `chunkBytes`.
 * One allocation, filled in place — no chunk-then-concat double copy.
 * `chunkBytes` is a parameter (not hardcoded) so tests can force multiple
 * loop iterations against a small fixture file.
 */
export function readFileChunked(
  filePath: string,
  chunkBytes: number = DEFAULT_CHUNK_BYTES,
): Buffer {
  const fd = openSync(filePath, 'r');
  try {
    const size = fstatSync(fd).size;
    const buf = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const length = Math.min(chunkBytes, size - offset);
      const bytesRead = readSync(fd, buf, offset, length, offset);
      if (bytesRead === 0) {
        throw new Error(`readFileChunked: ${filePath} hit EOF after ${offset} of ${size} bytes`);
      }
      offset += bytesRead;
    }
    return buf;
  } finally {
    closeSync(fd);
  }
}
