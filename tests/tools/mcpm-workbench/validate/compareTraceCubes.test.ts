/**
 * Tests for the trace-cube comparator (task T22). Pure-function cases
 * (TV distance, axis marginals) use hand-computed expectations directly;
 * the shape-mismatch case writes tiny fixture files to a tmpdir — see
 * tests/tools/buildRhizomeVolume.smoke.test.ts for the .npy-writer
 * precedent this borrows.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { totalVariation } from '../../../../tools/mcpm-workbench/validate/totalVariation';
import { axisMarginals } from '../../../../tools/mcpm-workbench/validate/axisMarginals';
import { compareTraceCubes } from '../../../../tools/mcpm-workbench/validate/compareTraceCubes';

function writeF32Npy(path: string, values: number[], shape: readonly number[]): void {
  const headerDict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  const baseLen = 10 + headerDict.length + 1;
  const padded = baseLen + ((64 - (baseLen % 64)) % 64);
  const headerLen = padded - 10;
  const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
  const dataBytes = values.length * 4;
  const buf = new ArrayBuffer(10 + headerLen + dataBytes);
  const u8 = new Uint8Array(buf);
  u8.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
  new DataView(buf).setUint16(8, headerLen, true);
  for (let i = 0; i < headerStr.length; i++) u8[10 + i] = headerStr.charCodeAt(i);
  new Float32Array(buf, 10 + headerLen, values.length).set(values);
  writeFileSync(path, Buffer.from(buf));
}

describe('totalVariation', () => {
  it('is 0 for identical histograms', () => {
    const a = new Float64Array([5, 10, 3, 0, 7]);
    expect(totalVariation(a, a.slice())).toBe(0);
  });

  it('is 1 for disjoint supports', () => {
    const a = new Float64Array([1, 0, 0]);
    const b = new Float64Array([0, 1, 0]);
    expect(totalVariation(a, b)).toBe(1);
  });

  it('matches the hand-computed value on a two-bin case', () => {
    // 0.5 * (|0.7-0.4| + |0.3-0.6|) = 0.5 * (0.3 + 0.3) = 0.3
    const a = new Float64Array([0.7, 0.3]);
    const b = new Float64Array([0.4, 0.6]);
    expect(totalVariation(a, b)).toBeCloseTo(0.3, 10);
  });
});

describe('axisMarginals', () => {
  it("puts all mass in the hot plane's bin", () => {
    // 3x3x3 cube, x-fastest: offset = z*9 + y*3 + x. Every voxel with x=1
    // (a full y-z plane) is 1, everything else 0.
    const dims: [number, number, number] = [3, 3, 3];
    const values = new Float64Array(27);
    for (let z = 0; z < 3; z++) {
      for (let y = 0; y < 3; y++) {
        values[z * 9 + y * 3 + 1] = 1;
      }
    }
    const [mx, my, mz] = axisMarginals(values, dims);

    // x-marginal: all 9 units of mass land in bin 1, the rest are 0.
    expect(Array.from(mx)).toEqual([0, 9, 0]);
    // y- and z-marginals: the plane spans every y and every z equally,
    // so each bin picks up exactly 3 (one per value of the other free axis).
    expect(Array.from(my)).toEqual([3, 3, 3]);
    expect(Array.from(mz)).toEqual([3, 3, 3]);
  });
});

describe('compareTraceCubes', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'compare-trace-cubes-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('errors when a .npy shape disagrees with --dims', async () => {
    const dims: [number, number, number] = [2, 2, 2];
    const binPath = join(dir, 'a.bin');
    writeFileSync(binPath, Buffer.from(new Float32Array(8).buffer)); // 2x2x2 f32

    const npyPath = join(dir, 'b.npy');
    writeF32Npy(npyPath, new Array(12).fill(0), [2, 2, 3]); // deliberately mismatched shape

    await expect(compareTraceCubes({ aPath: binPath, bPath: npyPath, dims })).rejects.toThrow(
      /shape mismatch/,
    );
  });
});
