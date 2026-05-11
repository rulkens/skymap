/**
 * End-to-end smoke test for tools/buildCf4Density.ts.
 *
 * Writes a synthetic 8x8x8 .npy into a tmpdir, invokes the build script's
 * `buildCf4Density` against it (passing a synthetic voxel size to avoid
 * baking the production CF4++ constant into test expectations), decodes
 * the resulting .scfd, and asserts every header field carries the expected
 * value.
 *
 * Avoids spawning a child process: the build script exports its entry
 * point so we can call it directly with custom paths.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildCf4Density } from '../../tools/buildCf4Density';
import { decodeScalarField } from '../../src/data/scalarFieldFormat';
import { SG_TO_EQ_QUATERNION } from '../../src/data/superGalacticTransform';

/** Write a flat C-order f32 .npy with the given shape and values. */
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

describe('buildCf4Density (smoke)', () => {
  let dir: string;
  let npyPath: string;
  let outPath: string;
  // Synthetic voxel size: 1000 Mpc box / 8 voxels = 125 Mpc/voxel.  Picked
  // to mirror the CF4++ 1000-Mpc box convention at a much smaller resolution
  // so the test cube fits in memory and runs fast.
  const voxelSizeMpc = 125;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cf4-build-'));
    npyPath = join(dir, 'cube.npy');
    outPath = join(dir, 'cf4_density.scfd');

    // 8^3 = 512 voxels with values 0..511 normalised so min=-1, max=+1.
    const values = Array.from({ length: 512 }, (_, i) => -1 + (2 * i) / 511);
    writeF32Npy(npyPath, values, [8, 8, 8]);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a decodable SCFD with correct header', async () => {
    await buildCf4Density({ npyPath, outPath, voxelSizeMpc });
    expect(existsSync(outPath)).toBe(true);

    const buf = readFileSync(outPath);
    const cube = decodeScalarField(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    expect(cube.dims).toEqual([8, 8, 8]);
    expect(cube.frameKind).toBe('supergalactic-cartesian');
    expect(cube.voxelSize).toBeCloseTo(voxelSizeMpc, 4);
    // Origin is voxel (0,0,0)'s corner in the native (SG) frame:
    // -voxelSize * (dims/2) per axis.
    const expectedCorner = -voxelSizeMpc * 4;
    expect(cube.origin[0]).toBeCloseTo(expectedCorner, 3);
    expect(cube.origin[1]).toBeCloseTo(expectedCorner, 3);
    expect(cube.origin[2]).toBeCloseTo(expectedCorner, 3);
    // Rotation matches the SG→eq quaternion exactly.
    expect(cube.rotation[0]).toBeCloseTo(SG_TO_EQ_QUATERNION[0]!, 6);
    expect(cube.rotation[1]).toBeCloseTo(SG_TO_EQ_QUATERNION[1]!, 6);
    expect(cube.rotation[2]).toBeCloseTo(SG_TO_EQ_QUATERNION[2]!, 6);
    expect(cube.rotation[3]).toBeCloseTo(SG_TO_EQ_QUATERNION[3]!, 6);
    // valueMin/valueMax are the *original* pre-normalisation range, kept
    // as diagnostic so a future consumer can recover the underlying
    // physical units.  The packed voxel payload itself has been remapped
    // to [0, 1] (see the f16-encode-decode assertions below).
    expect(cube.valueMin).toBeCloseTo(-1, 4);
    expect(cube.valueMax).toBeCloseTo(1, 4);
    expect(cube.voxels).toBeInstanceOf(Uint16Array);
    expect(cube.voxels.length).toBe(512);
    expect(['viridis', 'magma', 'blue-purple', 'yellow-green']).toContain(cube.paletteId);

    // densityScale is the fixed CF-4 constant (5.0), matching the
    // synthetic-Gaussian regime — see CF4_DENSITY_SCALE in
    // tools/buildCf4Density.ts.
    expect(cube.densityScale).toBeCloseTo(5.0, 4);

    // Verify normalisation: input ran linearly from -1 to +1, so the
    // packed voxel at index 0 should be ~0.0 (f16) and at index N-1
    // should be ~1.0.  We decode the f16 payload manually using the
    // standard IEEE-754 unpacking.
    const first = f16BitsToFloat(cube.voxels[0]!);
    const last = f16BitsToFloat(cube.voxels[cube.voxels.length - 1]!);
    expect(first).toBeCloseTo(0, 3);
    expect(last).toBeCloseTo(1, 3);
  });
});

/**
 * Unpack a single f16 bit pattern (as stored in SCFD voxel arrays) into
 * a JS number.  Inverse of the f32ToF16Bits packer in
 * `tools/buildCf4Density.ts`; only used here to verify the build
 * script's normalisation step round-trips through f16 storage.
 */
function f16BitsToFloat(bits: number): number {
  const sign = (bits & 0x8000) >> 15;
  const exp = (bits & 0x7c00) >> 10;
  const mant = bits & 0x03ff;
  if (exp === 0) {
    // Subnormal or zero.
    return (sign ? -1 : 1) * (mant / 1024) * Math.pow(2, -14);
  }
  if (exp === 31) {
    return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  }
  return (sign ? -1 : 1) * (1 + mant / 1024) * Math.pow(2, exp - 15);
}
