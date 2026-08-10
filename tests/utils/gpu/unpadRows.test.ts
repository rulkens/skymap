import { describe, it, expect } from 'vitest';
import { unpadRows } from '../../../src/utils/gpu/unpadRows';

describe('unpadRows', () => {
  it('extracts each row from its padded stride in order, dropping the tail padding', () => {
    // 3 rows, real row width 4 bytes, padded stride 8 bytes (WebGPU's 256-byte
    // rule shrunk here to keep the fixture readable). Row N's live bytes are
    // N*10..N*10+3 so a stride mistake (row-shear) shows up as wrong values,
    // not just wrong length.
    const rowBytes = 4;
    const paddedBytesPerRow = 8;
    const rows = 3;
    const padded = new Uint8Array(paddedBytesPerRow * rows);
    for (let row = 0; row < rows; row++) {
      for (let b = 0; b < rowBytes; b++) {
        padded[row * paddedBytesPerRow + b] = row * 10 + b;
      }
      // tail padding bytes — must never appear in the output
      for (let b = rowBytes; b < paddedBytesPerRow; b++) {
        padded[row * paddedBytesPerRow + b] = 0xff;
      }
    }

    const result = unpadRows(padded, paddedBytesPerRow, rowBytes, rows);

    expect(Array.from(result)).toEqual([0, 1, 2, 3, 10, 11, 12, 13, 20, 21, 22, 23]);
  });
});
