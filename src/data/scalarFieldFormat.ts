/**
 * SCFD v1 — Scalar Field binary format.  Self-describing; one cube
 * per file.  Carries enough metadata that the renderer never needs
 * a sidecar JSON.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (96 bytes) ────────────────────────────────────────────
 *   0    4   magic       = "SCFD"  (0x44464353)
 *   4    4   version     = 1
 *   8   12   dims        : uint32 × 3 (Nx, Ny, Nz)
 *  20    1   dtype       : uint8  (0 = f16; only value supported in v1)
 *  21    1   value_kind  : uint8  (0 = pre-normalised [0,1]; 1 reserved)
 *  22    1   palette_id  : uint8  (index into the palette table; see
 *                                    src/data/scalarFieldPalettes.ts)
 *  23    1   frame_kind  : uint8  (0 = supergalactic-cartesian,
 *                                    1 = equatorial-cartesian,
 *                                    2 = galactic)
 *  24   12   origin      : float32 × 3
 *  36    4   voxel_size  : float32
 *  40   16   rotation    : float32 × 4 (unit quaternion x, y, z, w)
 *  56    4   value_min   : float32
 *  60    4   value_max   : float32
 *  64    4   density_scale : float32 (per-cube opacity multiplier; see
 *                                       ScalarCube.densityScale.  Files
 *                                       written before this field existed
 *                                       carry 0 here and are decoded as
 *                                       densityScale=1.0 — the back-compat
 *                                       sentinel.)
 *  68   28   reserved    : uint8 × 28 (zero-filled)
 *
 *   ── VOXEL ARRAY (Nx*Ny*Nz × 2 bytes) ─────────────────────────────
 *   voxels[i] : f16 (stored as Uint16 raw bits)
 *
 * Why bake palette + frame into the binary instead of a sidecar JSON:
 * the existing `.bin` files in skymap (PointCloud, FilamentCloud) are
 * all single-file self-describing — having one consumer require a
 * sidecar would break the precedent and add a fetch.  All metadata
 * here is fixed-width, so the cost is 96 bytes regardless of cube size.
 */

import type {
  ScalarCube,
  ScalarFieldFrameKind,
  ScalarFieldPaletteId,
} from '../@types/ScalarCube';

const MAGIC = 0x44464353; // "SCFD" little-endian
const VERSION = 1;
export const SCFD_HEADER_BYTES = 96;

const FRAME_KIND_TO_ID: Record<ScalarFieldFrameKind, number> = {
  'supergalactic-cartesian': 0,
  'equatorial-cartesian': 1,
  galactic: 2,
};

const ID_TO_FRAME_KIND: ReadonlyArray<ScalarFieldFrameKind> = [
  'supergalactic-cartesian',
  'equatorial-cartesian',
  'galactic',
];

const PALETTE_ID_TO_INDEX: Record<ScalarFieldPaletteId, number> = {
  viridis: 0,
  magma: 1,
  'blue-purple': 2,
  'yellow-green': 3,
  coolwarm: 4,
};

const INDEX_TO_PALETTE_ID: ReadonlyArray<ScalarFieldPaletteId> = [
  'viridis',
  'magma',
  'blue-purple',
  'yellow-green',
  'coolwarm',
];

/**
 * Encode a `ScalarCube` to an ArrayBuffer.  Pure — no I/O.
 *
 * Voxels are stored as raw Uint16 (f16 bit patterns), x-fastest, matching
 * the on-disk layout that the WebGPU `r16float` 3D texture upload expects.
 * We copy the Uint16Array bytes verbatim — no per-element conversion.
 *
 * Throws on a length mismatch between `cube.voxels` and `dims[0]*dims[1]*dims[2]`.
 */
export function encodeScalarField(cube: ScalarCube): ArrayBuffer {
  const expectedVoxels = cube.dims[0] * cube.dims[1] * cube.dims[2];
  if (cube.voxels.length !== expectedVoxels) {
    throw new Error(
      `encodeScalarField: voxel count ${cube.voxels.length} does not match Nx*Ny*Nz = ${expectedVoxels}`,
    );
  }
  const buf = new ArrayBuffer(SCFD_HEADER_BYTES + cube.voxels.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, cube.dims[0], true);
  dv.setUint32(12, cube.dims[1], true);
  dv.setUint32(16, cube.dims[2], true);
  dv.setUint8(20, 0); // dtype = f16 (the only dtype supported in v1)
  dv.setUint8(21, 0); // value_kind = pre-normalised [0,1]
  dv.setUint8(22, PALETTE_ID_TO_INDEX[cube.paletteId]);
  dv.setUint8(23, FRAME_KIND_TO_ID[cube.frameKind]);
  dv.setFloat32(24, cube.origin[0], true);
  dv.setFloat32(28, cube.origin[1], true);
  dv.setFloat32(32, cube.origin[2], true);
  dv.setFloat32(36, cube.voxelSize, true);
  dv.setFloat32(40, cube.rotation[0], true);
  dv.setFloat32(44, cube.rotation[1], true);
  dv.setFloat32(48, cube.rotation[2], true);
  dv.setFloat32(52, cube.rotation[3], true);
  dv.setFloat32(56, cube.valueMin, true);
  dv.setFloat32(60, cube.valueMax, true);
  dv.setFloat32(64, cube.densityScale, true);
  // bytes 68..95 stay zero (reserved — future extensions land here without
  // bumping the version, as long as decoders skip them unconditionally)

  // Voxel array follows the header.  Source is Uint16Array of f16 bits
  // — copy bytes directly, no per-element conversion.
  new Uint8Array(buf, SCFD_HEADER_BYTES).set(
    new Uint8Array(cube.voxels.buffer, cube.voxels.byteOffset, cube.voxels.byteLength),
  );
  return buf;
}

/**
 * Decode an ArrayBuffer to a `ScalarCube`.  Throws on:
 *   - bad magic (not an SCFD file)
 *   - unsupported version (with a "regenerate" hint, matching the filament
 *     decoder's style so operators know what command to run)
 *   - unknown palette_id or frame_kind byte
 *   - byte-length mismatch between header dims and actual buffer size
 *
 * Voxels are copied into a freshly-owned `Uint16Array` so the caller can
 * hold it independent of the source ArrayBuffer's lifetime.
 */
export function decodeScalarField(buf: ArrayBuffer): ScalarCube {
  if (buf.byteLength < SCFD_HEADER_BYTES) {
    throw new Error(
      `decodeScalarField: buffer too small (${buf.byteLength} < ${SCFD_HEADER_BYTES})`,
    );
  }
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(`decodeScalarField: bad magic 0x${magic.toString(16)} (expected SCFD)`);
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeScalarField: unsupported version ${version} (expected ${VERSION}); regenerate the cube via the dataset's build pipeline`,
    );
  }
  const dims: [number, number, number] = [
    dv.getUint32(8, true),
    dv.getUint32(12, true),
    dv.getUint32(16, true),
  ];
  const dtype = dv.getUint8(20);
  if (dtype !== 0) {
    throw new Error(`decodeScalarField: unsupported dtype ${dtype} (v1 supports f16 only)`);
  }
  const paletteIdIdx = dv.getUint8(22);
  const paletteId = INDEX_TO_PALETTE_ID[paletteIdIdx];
  if (paletteId === undefined) {
    throw new Error(`decodeScalarField: unknown palette id ${paletteIdIdx}`);
  }
  const frameKindIdx = dv.getUint8(23);
  const frameKind = ID_TO_FRAME_KIND[frameKindIdx];
  if (frameKind === undefined) {
    throw new Error(`decodeScalarField: unknown frameKind id ${frameKindIdx}`);
  }
  const origin: [number, number, number] = [
    dv.getFloat32(24, true),
    dv.getFloat32(28, true),
    dv.getFloat32(32, true),
  ];
  const voxelSize = dv.getFloat32(36, true);
  const rotation: [number, number, number, number] = [
    dv.getFloat32(40, true),
    dv.getFloat32(44, true),
    dv.getFloat32(48, true),
    dv.getFloat32(52, true),
  ];
  const valueMin = dv.getFloat32(56, true);
  const valueMax = dv.getFloat32(60, true);
  // densityScale was added after v1 shipped.  Files written before that
  // carry zero in this slot (the reserved region was zero-filled), and
  // a zero scale would multiply per-step alpha by zero — invisible.
  // Substitute the neutral default 1.0 in that case so legacy files
  // still render with the un-tuned look they had before this field
  // existed.  Newly-encoded files always write a real value here.
  const densityScaleRaw = dv.getFloat32(64, true);
  const densityScale = densityScaleRaw === 0 ? 1.0 : densityScaleRaw;

  const expectedVoxels = dims[0] * dims[1] * dims[2];
  const expectedBytes = SCFD_HEADER_BYTES + expectedVoxels * 2;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `decodeScalarField: byte length ${buf.byteLength} does not match expected ${expectedBytes} for dims ${dims.join('x')}`,
    );
  }
  // Copy the voxels into a freshly-owned buffer so the caller can hold
  // it independent of the underlying ArrayBuffer's lifetime (matches the
  // PointCloud decoder's contract).
  const voxels = new Uint16Array(expectedVoxels);
  voxels.set(new Uint16Array(buf, SCFD_HEADER_BYTES, expectedVoxels));

  return { dims, voxels, frameKind, origin, voxelSize, rotation, paletteId, densityScale, valueMin, valueMax };
}
