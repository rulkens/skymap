/**
 * Pins the brief's one BINDING correction: element size is derived from
 * fileLength/voxelCount, never assumed — f16 vs f32 vs a hard error that
 * names both expected lengths (task-T22-brief.md).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readTraceCube } from '../../../../tools/mcpm-workbench/validate/readTraceCube';
import { f32ToF16Bits } from '../../../../src/utils/math/f32ToF16Bits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

describe('readTraceCube', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'read-trace-cube-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('decodes a buffer of exactly voxelCount*2 bytes as f16', () => {
    const dims: Vec3 = [2, 2, 2]; // 8 voxels
    const values = [0, 1, 2, 3, 4, 5, 6, 7];
    const bits = Uint16Array.from(values, (v) => f32ToF16Bits(v));
    const path = join(dir, 'f16.bin');
    writeFileSync(path, Buffer.from(bits.buffer));

    const decoded = readTraceCube(path, dims);

    expect(decoded.length).toBe(8);
    for (let i = 0; i < values.length; i++) {
      expect(decoded[i]).toBeCloseTo(values[i]!, 3); // f16 rounding, small integers are exact anyway
    }
  });

  it('decodes a buffer of exactly voxelCount*4 bytes as f32', () => {
    const dims: Vec3 = [2, 2, 2]; // 8 voxels
    const values = [0.1, 1.2, 2.3, 3.4, 4.5, 5.6, 6.7, 7.8];
    const path = join(dir, 'f32.bin');
    writeFileSync(path, Buffer.from(new Float32Array(values).buffer));

    const decoded = readTraceCube(path, dims);

    expect(Array.from(decoded)).toEqual(Array.from(new Float32Array(values)));
  });

  it('hard-errors on a length that is neither the f16 nor the f32 expectation', () => {
    const dims: Vec3 = [2, 2, 2]; // 8 voxels: f16 expects 16 bytes, f32 expects 32
    const path = join(dir, 'wrong-size.bin');
    writeFileSync(path, Buffer.alloc(20)); // neither

    expect(() => readTraceCube(path, dims)).toThrow(
      /20 bytes for dims 2x2x2 \(8 voxels\).*f16 \(16 bytes expected\).*f32 \(32 bytes expected\)/s,
    );
  });
});
