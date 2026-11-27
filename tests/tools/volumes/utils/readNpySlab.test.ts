import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeNpy } from '../../../../tools/parsers/npyWriter';
import { readNpyHeader } from '../../../../tools/parsers/readNpyHeader';
import { readNpySlab } from '../../../../tools/volumes/utils/readNpySlab';

describe('readNpySlab', () => {
  it('readNpySlab reads x-rows [x0, x0 + count) of a C-order file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npy-slab-'));
    try {
      const file = new Uint8Array(
        writeNpy(
          Float32Array.from({ length: 30 }, (_, i) => i),
          [5, 3, 2],
          '<f4',
        ),
      );
      const path = join(dir, 'cube.npy');
      writeFileSync(path, file);
      const fd = openSync(path, 'r');
      try {
        const slab = readNpySlab(fd, readNpyHeader(file), 2, 2);
        // A row is 3 · 2 = 6 values, so rows 2 and 3 are values 12 … 23.
        expect([...slab]).toEqual(Array.from({ length: 12 }, (_, i) => 12 + i));
      } finally {
        closeSync(fd);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
