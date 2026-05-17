/**
 * End-to-end smoke test for tools/buildMcpmVolume.ts. Mirrors the
 * tests/tools/buildCf4Density.smoke.test.ts shape: write a synthetic
 * .npy, build, decode the .scfd, assert header fields.
 *
 * MCPM differs from CF-4 in two ways the test must exercise:
 *   - frameKind = 'equatorial-cartesian' (CF-4 is 'supergalactic-cartesian')
 *   - origin = grid_center − grid_size/2 (CF-4 centers on observer)
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildMcpmVolume } from '../../tools/volumes/buildMcpmVolume';
import { decodeScalarField } from '../../src/data/scalarFieldFormat';

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

describe('buildMcpmVolume (smoke)', () => {
  let dir: string;
  let npyPath: string;
  let outPath: string;
  // Synthetic 4×4×4 cube with a synthetic origin/voxelSize override so the
  // assertions don't bake in the production MCPM constants.
  const dims: [number, number, number] = [4, 4, 4];
  const overrideOrigin: [number, number, number] = [-100, -50, 25];
  const overrideVoxelSize = 10;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcpm-build-'));
    npyPath = join(dir, 'cube.npy');
    outPath = join(dir, 'mcpm-test.scfd');
    const values = Array.from({ length: 64 }, (_, i) => i / 63); // 0..1 ramp
    writeF32Npy(npyPath, values, dims);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes a decodable SCFD with equatorial-cartesian frame', async () => {
    await buildMcpmVolume({
      npyPath,
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
    // MCPM uses equatorial-cartesian (id=1 in the SCFD spec); this is the
    // assertion that catches an accidental copy-paste of CF-4's frameKind.
    expect(cube.frameKind).toBe('equatorial-cartesian');
    expect(cube.voxelSize).toBeCloseTo(overrideVoxelSize, 4);
    expect(cube.origin[0]).toBeCloseTo(overrideOrigin[0], 3);
    expect(cube.origin[1]).toBeCloseTo(overrideOrigin[1], 3);
    expect(cube.origin[2]).toBeCloseTo(overrideOrigin[2], 3);
    // Identity rotation — see CF-4 smoke test's matching assertion for the
    // pre-existing rotation-doubling pitfall this guards against.
    expect(cube.rotation[0]).toBeCloseTo(0, 6);
    expect(cube.rotation[1]).toBeCloseTo(0, 6);
    expect(cube.rotation[2]).toBeCloseTo(0, 6);
    expect(cube.rotation[3]).toBeCloseTo(1, 6);
    // Input ran 0..1, no negative values — symmetric normalisation:
    // half = max(|0|, |1|) = 1; normalised = clamp(0.5 + v/2, 0, 1).
    // First voxel (input 0) → 0.5; last (input 1) → 1.0.
    expect(cube.valueMin).toBeCloseTo(0, 4);
    expect(cube.valueMax).toBeCloseTo(1, 4);
    expect(cube.voxels).toBeInstanceOf(Uint16Array);
    expect(cube.voxels.length).toBe(64);
  });
});
