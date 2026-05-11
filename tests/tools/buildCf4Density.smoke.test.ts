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
    // Palette + densityScale are no longer encoded in the binary — they
    // live in `src/data/volumeFieldDefaults.ts` keyed by the `'cf4-density'`
    // handle.  See `tests/data/volumeFieldDefaults.test.ts` for the
    // registry-side coverage.

    // Verify symmetric normalisation: input ran linearly from -1 to +1
    // (so half-range = 1), giving (v + 1) / 2 → first voxel → 0, last
    // voxel → 1, and the value that lands at v=0 → 0.5 (the divergent-
    // palette transparent midpoint).  We decode the f16 payload
    // manually using the standard IEEE-754 unpacking.
    const first = f16BitsToFloat(cube.voxels[0]!);
    const last = f16BitsToFloat(cube.voxels[cube.voxels.length - 1]!);
    expect(first).toBeCloseTo(0, 3);
    expect(last).toBeCloseTo(1, 3);
    // NOTE: an earlier version of this test asserted that voxels[255]
    // and voxels[256] decode to ~0.5 (the near-zero middle of the
    // -1..+1 ramp).  Those positional assertions were correct under
    // the old straight-copy build but no longer hold once the build
    // transposes numpy axes 0↔2 into WebGPU x-fastest layout — the
    // input values that USED to live at flat indices 255/256 now sit
    // elsewhere in the output.  The first/last assertions above still
    // hold because corner cells (npy[0,0,0] and npy[N-1,N-1,N-1]) are
    // invariant under the X↔Z transpose.  The axis-ordering contract
    // is now verified by the two axis-aware tests below.
  });

  it('transposes numpy axes 0↔2 into WebGPU x-fastest layout', async () => {
    // The CF4++ .npy is C-order with axis 0 = SGX (slowest in memory)
    // and axis 2 = SGZ (fastest).  WebGPU's writeTexture interprets the
    // buffer as x-fastest.  A straight-copy build would place SGZ data
    // into the cube's local-x axis (which the model matrix labels as
    // the +SGX direction), visually swapping the cube X↔Z.  The build
    // script's transpose pass guards against this.
    //
    // This test seeds a single non-zero voxel at numpy[1, 0, 0] in an
    // asymmetric cube (different counts along each axis would make
    // accidental axis permutations even more obvious, but a small cube
    // with one non-zero is enough to pin which slot the data lands in).
    //
    // The symmetric normalisation has min = -1 (a sentinel value at
    // npy[0, 0, 0] makes the min/max defined and forces half = 1.0, so
    // input value v lands at LUT coord 0.5 + v/2 ∈ [0, 1]).  With the
    // sentinel at -1 and a "marker" of +1 at npy[1, 0, 0], the marker
    // round-trips to LUT 1.0; all other zeros round-trip to LUT 0.5.
    const dims = [4, 4, 4] as const;
    const Nx = dims[0];
    const Ny = dims[1];
    const Nz = dims[2];
    const values = new Array(Nx * Ny * Nz).fill(0);
    // npy[0, 0, 0] = -1 sentinel (sets the negative half-range)
    values[0 * Ny * Nz + 0 * Nz + 0] = -1;
    // npy[1, 0, 0] = +1 marker (the cell whose location we're verifying)
    values[1 * Ny * Nz + 0 * Nz + 0] = +1;

    const axisDir = mkdtempSync(join(tmpdir(), 'cf4-axis-'));
    const axisNpy = join(axisDir, 'cube.npy');
    const axisOut = join(axisDir, 'cf4_density.scfd');
    try {
      writeF32Npy(axisNpy, values, [...dims]);
      await buildCf4Density({ npyPath: axisNpy, outPath: axisOut, voxelSizeMpc: 1 });
      const buf = readFileSync(axisOut);
      const cube = decodeScalarField(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      );

      // WebGPU offset for texture coord (xt, yt, zt) is zt*Ny*Nx + yt*Nx + xt.
      // After the transpose, npy[1, 0, 0] (the marker) should sit at
      // texture coord (1, 0, 0) — memory offset 1.  Without the transpose,
      // npy[1, 0, 0] would land at memory offset 16 (texture (0, 0, 1)
      // — i.e. local-z = 1, which the renderer would interpret as +SGZ
      // direction, NOT +SGX).
      const offMarker = 0 * Ny * Nx + 0 * Nx + 1; // tex (1, 0, 0) — expected
      const offSwapped = 1 * Ny * Nx + 0 * Nx + 0; // tex (0, 0, 1) — old buggy site
      expect(f16BitsToFloat(cube.voxels[offMarker]!)).toBeCloseTo(1.0, 2);
      expect(f16BitsToFloat(cube.voxels[offSwapped]!)).toBeCloseTo(0.5, 2);

      // The sentinel at npy[0, 0, 0] sits at the origin of both layouts
      // (offset 0), so it shouldn't move.  Confirm.
      expect(f16BitsToFloat(cube.voxels[0]!)).toBeCloseTo(0.0, 2);
    } finally {
      rmSync(axisDir, { recursive: true, force: true });
    }
  });

  it('places a Y-axis marker at WebGPU y=1 (not z or x)', async () => {
    // Companion to the X-axis test: pin the Y → Y mapping (this is the
    // axis that is supposed to pass through unchanged under axis 0↔2
    // transpose).  If anyone ever mistakenly transposes Y as well, this
    // test catches it.
    const dims = [4, 4, 4] as const;
    const Nx = dims[0];
    const Ny = dims[1];
    const Nz = dims[2];
    const values = new Array(Nx * Ny * Nz).fill(0);
    values[0 * Ny * Nz + 0 * Nz + 0] = -1; // sentinel for half=1
    values[0 * Ny * Nz + 1 * Nz + 0] = +1; // marker at npy[0, 1, 0]

    const axisDir = mkdtempSync(join(tmpdir(), 'cf4-axis-y-'));
    const axisNpy = join(axisDir, 'cube.npy');
    const axisOut = join(axisDir, 'cf4_density.scfd');
    try {
      writeF32Npy(axisNpy, values, [...dims]);
      await buildCf4Density({ npyPath: axisNpy, outPath: axisOut, voxelSizeMpc: 1 });
      const buf = readFileSync(axisOut);
      const cube = decodeScalarField(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      );

      // Marker should land at texture (0, 1, 0) — offset 0*16 + 1*4 + 0 = 4.
      const offMarker = 0 * Ny * Nx + 1 * Nx + 0;
      expect(f16BitsToFloat(cube.voxels[offMarker]!)).toBeCloseTo(1.0, 2);
    } finally {
      rmSync(axisDir, { recursive: true, force: true });
    }
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
