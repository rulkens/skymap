/**
 * Fix round 3 (T23 confirmed): fs.readFileSync refuses files over 2 GiB —
 * hit directly against the real 2.49 GB trace.bin — so readTraceCube reads
 * via this chunked reader instead. Can't exercise the actual >2 GiB ceiling
 * here (too slow/large for a unit test); a tiny chunk size on a small file
 * forces the same multi-iteration read loop and checks it against
 * fs.readFileSync's result, which is the ground truth for a file small
 * enough for that to work at all.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readFileChunked } from '../../../../tools/mcpm-workbench/validate/readFileChunked';

describe('readFileChunked', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'read-file-chunked-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads a file byte-identical to fs.readFileSync when the chunk size forces several loop iterations', () => {
    const path = join(dir, 'fixture.bin');
    // 37 bytes, all distinct, so any off-by-one in the read loop shows up
    // as a value mismatch rather than an accidental match.
    const bytes = Uint8Array.from({ length: 37 }, (_, i) => i * 7);
    writeFileSync(path, Buffer.from(bytes));

    // chunkBytes=8 over 37 bytes forces 5 iterations (8,8,8,8,5).
    const chunked = readFileChunked(path, 8);
    const plain = readFileSync(path);

    expect(chunked.byteLength).toBe(plain.byteLength);
    expect(Buffer.compare(chunked, plain)).toBe(0);
  });

  it('reads an empty file as a zero-length buffer', () => {
    const path = join(dir, 'empty.bin');
    writeFileSync(path, Buffer.alloc(0));

    expect(readFileChunked(path, 8).byteLength).toBe(0);
  });
});
