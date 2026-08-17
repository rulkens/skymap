/**
 * End-to-end smoke test for tools/volumes/buildRhizomeVolume.ts. Mirrors
 * tests/tools/buildMcpmVolume.smoke.test.ts's shape: write a synthetic
 * .npy (+ here, a sidecar) into a tmpdir, build, decode the .scfd, assert
 * header fields. Local fixture helpers only — see buildMcpmVolume's smoke
 * test for the precedent against extracting a shared one.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildRhizomeVolume, isQuickLookOutput } from '../../tools/volumes/buildRhizomeVolume';
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

// Values are irrelevant to the rejection test this fixture serves — only
// the dtype byte and the zero-filled f16 payload matter.
function writeF16Npy(path: string, count: number, shape: readonly number[]): void {
  const headerDict = `{'descr': '<f2', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length === 1 ? ',' : ''}), }`;
  const baseLen = 10 + headerDict.length + 1;
  const padded = baseLen + ((64 - (baseLen % 64)) % 64);
  const headerLen = padded - 10;
  const headerStr = headerDict + ' '.repeat(headerLen - headerDict.length - 1) + '\n';
  const dataBytes = count * 2;
  const buf = new ArrayBuffer(10 + headerLen + dataBytes);
  const u8 = new Uint8Array(buf);
  u8.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
  new DataView(buf).setUint16(8, headerLen, true);
  for (let i = 0; i < headerStr.length; i++) u8[10 + i] = headerStr.charCodeAt(i);
  writeFileSync(path, Buffer.from(buf));
}

function writeSidecar(
  path: string,
  overrides: {
    dims: readonly [number, number, number];
    originMpc?: readonly [number, number, number];
    voxelSizeMpc?: readonly [number, number, number];
    frame?: string;
  },
): void {
  const sidecar = {
    format: 'polyphy-trace',
    version: 1,
    dims: overrides.dims,
    origin_mpc: overrides.originMpc ?? [0, 0, 0],
    voxel_size_mpc: overrides.voxelSizeMpc ?? [1, 1, 1],
    frame: overrides.frame ?? 'supergalactic-cartesian',
  };
  writeFileSync(path, JSON.stringify(sidecar));
}

describe('isQuickLookOutput', () => {
  // Pure path comparison — no fs I/O, so it's safe to exercise directly
  // against the real 'public/data/...' string without ever touching the
  // filesystem.
  it('matches only the resolved MCPM large-tier path under the epoch folder', () => {
    expect(isQuickLookOutput('public/data/scalar-field/v3/mcpm-large.scfd')).toBe(true);
    expect(isQuickLookOutput('./public/data/scalar-field/v3/mcpm-large.scfd')).toBe(true);
    expect(isQuickLookOutput('public/data/scalar-field/v3/mcpm-medium.scfd')).toBe(false);
    expect(isQuickLookOutput('/tmp/somewhere/cube.scfd')).toBe(false);
    // The pre-v9 root path is dead — guarding it again would re-strand
    // quick-look on a file the manifest-driven viewer never fetches.
    expect(isQuickLookOutput('public/data/mcpm-large.scfd')).toBe(false);
  });
});

describe('buildRhizomeVolume (smoke)', () => {
  let dir: string;
  let npyPath: string;
  let outPath: string;
  const dims: [number, number, number] = [4, 4, 4];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rhizome-build-'));
    npyPath = join(dir, 'cube.npy');
    outPath = join(dir, 'cube.scfd');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes a decodable SCFD carrying the sidecar's frame, origin and mean voxel size", async () => {
    // Raw values 0..63 (not 0..1) so valueMin/valueMax visibly differ from
    // the normalised [0,1] range the pack step produces internally.
    const values = Array.from({ length: 64 }, (_, i) => i);
    writeF32Npy(npyPath, values, dims);
    writeSidecar(join(dir, 'cube.json'), {
      dims,
      originMpc: [-100, -50, 25],
      voxelSizeMpc: [1.8367, 1.8351, 1.8394],
      frame: 'supergalactic-cartesian',
    });

    await buildRhizomeVolume({ npyPath, outPath });
    expect(existsSync(outPath)).toBe(true);
    const buf = readFileSync(outPath);
    const cube = decodeScalarField(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );

    expect(cube.dims).toEqual(dims);
    expect(cube.frameKind).toBe('supergalactic-cartesian');
    expect(cube.origin[0]).toBeCloseTo(-100, 3);
    expect(cube.origin[1]).toBeCloseTo(-50, 3);
    expect(cube.origin[2]).toBeCloseTo(25, 3);
    // Hand-computed mean, never read from the code: (1.8367+1.8351+1.8394)/3
    // = 5.5112/3 = 1.83707 (rounded).
    expect(cube.voxelSize).toBeCloseTo(1.83707, 4);
    expect(cube.rotation[0]).toBeCloseTo(0, 6);
    expect(cube.rotation[1]).toBeCloseTo(0, 6);
    expect(cube.rotation[2]).toBeCloseTo(0, 6);
    expect(cube.rotation[3]).toBeCloseTo(1, 6);
    // Raw pre-normalisation stats — the input ramp ran 0..63.
    expect(cube.valueMin).toBeCloseTo(0, 4);
    expect(cube.valueMax).toBeCloseTo(63, 4);
  });

  it('refuses to build without a sidecar', async () => {
    const values = Array.from({ length: 64 }, (_, i) => i / 63);
    writeF32Npy(npyPath, values, dims);
    // No sidecar written.

    await expect(buildRhizomeVolume({ npyPath, outPath })).rejects.toThrow(/no sidecar at/);
  });

  it('refuses a stale sidecar whose dims disagree with the npy', async () => {
    const values = Array.from({ length: 64 }, (_, i) => i / 63);
    writeF32Npy(npyPath, values, dims);
    writeSidecar(join(dir, 'cube.json'), { dims: [4, 4, 8] });

    await expect(buildRhizomeVolume({ npyPath, outPath })).rejects.toThrow(
      /does not match sidecar dims/,
    );
  });

  it('refuses an f16 npy', async () => {
    writeF16Npy(npyPath, 64, dims);
    writeSidecar(join(dir, 'cube.json'), { dims });

    await expect(buildRhizomeVolume({ npyPath, outPath })).rejects.toThrow(/export f32/);
  });

  it('refuses a cube whose per-axis voxel sizes disagree beyond 0.5%', async () => {
    const values = Array.from({ length: 64 }, (_, i) => i / 63);
    writeF32Npy(npyPath, values, dims);
    // Spread = (1.02 - 1.0) / mean(1.0, 1.0, 1.02) = 0.02 / 1.006667 ≈ 1.99%.
    writeSidecar(join(dir, 'cube.json'), { dims, voxelSizeMpc: [1.0, 1.0, 1.02] });

    let error: Error | undefined;
    try {
      await buildRhizomeVolume({ npyPath, outPath });
    } catch (err) {
      error = err as Error;
    }
    expect(error?.message).toMatch(/exceeds 0.5%/);
    expect(error?.message).toContain('sizes 1, 1, 1.02');
  });

  it('places a hot voxel at the x-fastest index after the C-order transpose', async () => {
    // Asymmetric dims (2x3x4) so an axis swap is observable — a symmetric
    // cube can't distinguish a transpose from a straight copy. All zero
    // except C-order index 9, which is (i,j,k)=(0,2,1) since
    // 9 = 0*3*4 + 2*4 + 1. The x-fastest index is
    // i + j*Nx + k*Nx*Ny = 0 + 2*2 + 1*(2*3) = 10 — a straight no-transpose
    // copy would leave the hot value at index 9 instead.
    const cubeDims: [number, number, number] = [2, 3, 4];
    const values = new Array(24).fill(0);
    values[9] = 1.0;
    writeF32Npy(npyPath, values, cubeDims);
    writeSidecar(join(dir, 'cube.json'), { dims: cubeDims });

    await buildRhizomeVolume({ npyPath, outPath });
    const buf = readFileSync(outPath);
    const cube = decodeScalarField(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );

    // valueMax = 1 (only one nonzero input), so the hot voxel normalises
    // to log(2)/log(2) = 1 exactly (f16 bit pattern 0x3C00) and every
    // other voxel stays at log(1)/log(2) = 0.
    expect(cube.voxels[10]).toBe(0x3c00);
    for (let i = 0; i < cube.voxels.length; i++) {
      if (i !== 10) expect(cube.voxels[i]).toBe(0);
    }
  });

  it('accepts a raw PolyPhy 4D cube with a trailing singleton', async () => {
    const cubeDims: [number, number, number] = [2, 3, 4];
    const values = Array.from({ length: 24 }, (_, i) => i / 23);
    writeF32Npy(npyPath, values, [2, 3, 4, 1]);
    // Sidecar dims are post-squeeze per the schema — 3D, not 4D.
    writeSidecar(join(dir, 'cube.json'), { dims: cubeDims });

    await buildRhizomeVolume({ npyPath, outPath });
    const buf = readFileSync(outPath);
    const cube = decodeScalarField(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    );

    expect(cube.dims).toEqual(cubeDims);
  });

  it('refuses a 4D cube whose last axis is not a singleton', async () => {
    const values = new Array(48).fill(0);
    writeF32Npy(npyPath, values, [2, 3, 4, 2]);
    // dims here are irrelevant — the rank check fires before the npy is
    // compared against the sidecar's dims.
    writeSidecar(join(dir, 'cube.json'), { dims: [2, 3, 4] });

    await expect(buildRhizomeVolume({ npyPath, outPath })).rejects.toThrow(/expected 3D cube/);
  });
});
