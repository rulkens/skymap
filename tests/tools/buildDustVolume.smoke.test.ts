/**
 * End-to-end smoke test for tools/volumes/buildDustVolume.ts. Mirrors
 * tests/tools/buildMcpmVolume.smoke.test.ts's shape: write synthetic
 * .npy inputs, build, decode the .scfd, assert header fields — plus the
 * one thing buildDustVolume adds over buildMcpmVolume: collapsing a
 * mean+std pair via the log-normal median before packing.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDustVolume } from '../../tools/volumes/buildDustVolume';
import { decodeScalarField } from '../../src/data/volume/scalarFieldFormat';

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

describe('buildDustVolume (smoke)', () => {
  let dir: string;
  let meanNpyPath: string;
  let stdNpyPath: string;
  let outPath: string;
  const dims: [number, number, number] = [2, 2, 2];
  const overrideOrigin: [number, number, number] = [-0.00125, -0.00125, -0.00125];
  const overrideVoxelSize = 0.0000195;
  // Every voxel but the last has std=0, so its median equals its mean
  // unchanged; the last voxel has a large std, which pulls its median
  // well below its mean (8 → ~2.97) — this is what distinguishes a
  // median collapse from an accidental mean pass-through.
  const meanValues = [1, 2, 3, 4, 5, 6, 7, 8];
  const stdValues = [0, 0, 0, 0, 0, 0, 0, 20];

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'dust-build-'));
    meanNpyPath = join(dir, 'mean.npy');
    stdNpyPath = join(dir, 'std.npy');
    outPath = join(dir, 'dust-test.scfd');
    writeF32Npy(meanNpyPath, meanValues, dims);
    writeF32Npy(stdNpyPath, stdValues, dims);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('collapses mean+std to the log-normal median, then writes a decodable SCFD', async () => {
    await buildDustVolume({
      meanNpyPath,
      stdNpyPath,
      outPath,
      origin: overrideOrigin,
      voxelSizeMpc: overrideVoxelSize,
    });
    expect(existsSync(outPath)).toBe(true);
    const buf = readFileSync(outPath);
    const cube = decodeScalarField(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );

    expect(cube.dims).toEqual(dims);
    expect(cube.channels).toBe(1);
    // Native frame is galactic (Edenhofer's HEALPix maps + interp2box.py's
    // box are both galactic) — this is the assertion that catches a
    // frame-id transcription slip in the header (e.g. an accidental
    // 'equatorial-cartesian', which the SCFD id table would encode/decode
    // silently as a *different*, wrong frame rather than erroring).
    expect(cube.frameKind).toBe('galactic');
    expect(cube.voxelSize).toBeCloseTo(overrideVoxelSize, 10);
    expect(cube.origin[0]).toBeCloseTo(overrideOrigin[0], 6);
    expect(cube.origin[1]).toBeCloseTo(overrideOrigin[1], 6);
    expect(cube.origin[2]).toBeCloseTo(overrideOrigin[2], 6);
    expect(cube.rotation[0]).toBeCloseTo(0, 6);
    expect(cube.rotation[1]).toBeCloseTo(0, 6);
    expect(cube.rotation[2]).toBeCloseTo(0, 6);
    expect(cube.rotation[3]).toBeCloseTo(1, 6);

    // valueMin/valueMax are packLogTraceVoxels' raw min/max of the input
    // array — here, of the *median* array, not the raw mean array. Min
    // stays 1 (untouched by a zero std); max is the un-collapsed voxel
    // 7 (std=0), not 8 — the mean's own max was pulled down to ~2.97 by
    // its std=20, so if this ever regresses to a mean pass-through the
    // max would read 8 instead.
    expect(cube.valueMin).toBeCloseTo(1, 6);
    expect(cube.valueMax).toBeCloseTo(7, 6);

    expect(cube.voxels).toBeInstanceOf(Uint16Array);
    expect(cube.voxels.length).toBe(8);
  });

  it('rejects a mean/std shape mismatch', async () => {
    const mismatchDir = mkdtempSync(join(tmpdir(), 'dust-mismatch-'));
    const badStdPath = join(mismatchDir, 'std-bad.npy');
    writeF32Npy(badStdPath, [0, 0, 0, 0], [1, 2, 2]);
    await expect(
      buildDustVolume({
        meanNpyPath,
        stdNpyPath: badStdPath,
        outPath: join(mismatchDir, 'out.scfd'),
        origin: overrideOrigin,
        voxelSizeMpc: overrideVoxelSize,
      }),
    ).rejects.toThrow(/shape/);
    rmSync(mismatchDir, { recursive: true, force: true });
  });
});
