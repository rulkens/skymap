/**
 * SCFD v3 — Scalar/Vector Field binary format.  Self-describing; one cube
 * per file.  Carries enough metadata that the renderer never needs
 * a sidecar JSON.
 *
 * **Breaking change vs v2:** the binary carries a `channels` byte
 * (1 = single-channel `r16float`, 4 = `rgba16float`).  It reuses byte 22 —
 * the slot that held `palette_id` in v1 and was `reserved` in v2.  This
 * generalises the format from scalar-only density cubes to also carry
 * 4-component vector cubes (e.g. a flow / velocity field) without forking a
 * second cube type.  The voxel-array length is channel-aware:
 * `Nx*Ny*Nz*channels` f16 values.
 *
 * **Breaking change vs v1 (still in force):** the binary no longer carries
 * `palette_id` (formerly at offset 22) or `density_scale` (formerly at
 * offsets 64..67).  The density-scale slot stays `reserved` and zero-filled.
 * Palette and density-scale are presentation, not data, and live in
 * `src/data/volumeFieldDefaults.ts` keyed by the renderer's field handle.
 *
 * v1 and v2 files are rejected outright with a "regenerate" hint — same
 * precedent as the GalaxyCatalog and Filament decoders.  Operators run
 * `npm run build-cf4-density` (or the relevant builder) and re-sync R2 in
 * lockstep with the code deploy.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (96 bytes) ────────────────────────────────────────────
 *   0    4   magic       = "SCFD"  (0x44464353)
 *   4    4   version     = 3
 *   8   12   dims        : uint32 × 3 (Nx, Ny, Nz)
 *  20    1   dtype       : uint8  (0 = f16; only value supported in v3)
 *  21    1   value_kind  : uint8  (0 = pre-normalised scalar [0,1];
 *                                    1 = velocity + overdensity field)
 *  22    1   channels    : uint8  (1 = r16float single-channel,
 *                                    4 = rgba16float; only these two in v3)
 *  23    1   frame_kind  : uint8  (0 = supergalactic-cartesian,
 *                                    1 = equatorial-cartesian,
 *                                    2 = galactic)
 *  24   12   origin      : float32 × 3
 *  36    4   voxel_size  : float32
 *  40   16   rotation    : float32 × 4 (unit quaternion x, y, z, w)
 *  56    4   value_min   : float32 (= δ_min  when value_kind = 1)
 *  60    4   value_max   : float32 (= δ_max  when value_kind = 1)
 *  64    4   speed_max   : float32 (value_kind = 1; was density_scale in v1)
 *  68    4   speed_p99   : float32 (value_kind = 1; reserved/zero otherwise)
 *  72    4   delta_p99   : float32 (value_kind = 1; reserved/zero otherwise)
 *  76   20   reserved    : uint8 × 20 (zero-filled)
 *
 *   ── value_kind = 1 (velocity + overdensity field) ────────────────
 *   A `channels = 4` cube whose voxels are (vx, vy, vz, δ).  Its renderer
 *   normalises particle speed and seeding weight from three derived stats
 *   that a per-channel min/max can't express — velocity magnitude is a
 *   *cross-channel* quantity, not the range of any single component.  Those
 *   stats fold into the reserved region (no JSON sidecar) and are discriminated
 *   by value_kind so a scalar reader never mis-reads stale bytes:
 *     - value_min / value_max double as the δ (overdensity) range;
 *     - byte 64 = max velocity magnitude (km/s);
 *     - byte 68 = 99th-percentile velocity magnitude (km/s);
 *     - byte 72 = 99th-percentile δ.
 *   For value_kind = 0 (the original density cubes) bytes 64..95 stay zero.
 *
 *   ── VOXEL ARRAY (Nx*Ny*Nz*channels × 2 bytes) ────────────────────
 *   voxels[i] : f16 (stored as Uint16 raw bits), channels interleaved per cell
 *
 * v3 keeps palette and densityScale out of the binary — those are
 * presentation concerns and live in `src/data/volumeFieldDefaults.ts`.
 * The format remains self-describing for everything that IS data: dims,
 * channels, dtype, frame, origin, voxelSize, rotation, valueMin/valueMax,
 * voxels.
 */

import type { ScalarCube } from '../../@types/data/volume/ScalarCube';
import type { ScalarFieldFrameKind } from '../../@types/data/volume/ScalarFieldFrameKind';
import type { Vec3 } from '../../@types/math/Vec3';
import type { Vec4 } from '../../@types/math/Vec4';

const MAGIC = 0x44464353; // "SCFD" little-endian
const VERSION = 3;
export const SCFD_HEADER_BYTES = 96;

// Version-stamped folder: max-age=86400 lets a CDN serve an old .scfd
// alongside new code for up to a day, so the epoch has to live in the
// path itself to make that pairing impossible (images/earth-tiles/'s
// TILE_PREFIX precedent).
export const SCALAR_FIELD_DATA_PREFIX = `scalar-field/v${VERSION}`;

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

/**
 * Encode a `ScalarCube` to an ArrayBuffer.  Pure — no I/O.
 *
 * Voxels are stored as raw Uint16 (f16 bit patterns), x-fastest, channels
 * interleaved per cell, matching the on-disk layout that the WebGPU
 * `r16float` / `rgba16float` 3D texture upload expects.  We copy the
 * Uint16Array bytes verbatim — no per-element conversion.
 *
 * Throws on a length mismatch between `cube.voxels` and
 * `dims[0]*dims[1]*dims[2]*channels`.
 *
 * The `value_kind` byte is *derived*, not passed: it is `1` iff
 * `cube.velocityStats` is present and `0` otherwise.  Tying the discriminator
 * to the presence of the stats keeps a single source of truth — there's no way
 * to produce a header claiming value_kind=1 with no stats, or vice versa.  We
 * additionally require that `velocityStats` only appears on a 4-channel cube
 * (the stats describe a velocity vector; a 1-channel scalar has none), and
 * throw a clear error otherwise rather than writing a self-contradictory
 * header.
 */
export function encodeScalarField(cube: ScalarCube): ArrayBuffer {
  const expectedVoxels = cube.dims[0] * cube.dims[1] * cube.dims[2] * cube.channels;
  if (cube.voxels.length !== expectedVoxels) {
    throw new Error(
      `encodeScalarField: voxel count ${cube.voxels.length} does not match Nx*Ny*Nz*channels = ${expectedVoxels}`,
    );
  }
  if (cube.velocityStats !== undefined && cube.channels !== 4) {
    throw new Error(
      `encodeScalarField: velocityStats is only valid on a 4-channel velocity field, but channels = ${cube.channels}`,
    );
  }
  const buf = new ArrayBuffer(SCFD_HEADER_BYTES + cube.voxels.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, cube.dims[0], true);
  dv.setUint32(12, cube.dims[1], true);
  dv.setUint32(16, cube.dims[2], true);
  dv.setUint8(20, 0); // dtype = f16 (the only dtype supported in v3)
  // value_kind: 0 = pre-normalised scalar, 1 = velocity + overdensity field.
  // Derived from velocityStats presence so the two can never disagree.
  dv.setUint8(21, cube.velocityStats !== undefined ? 1 : 0);
  dv.setUint8(22, cube.channels); // 1 = r16float, 4 = rgba16float
  dv.setUint8(23, FRAME_KIND_TO_ID[cube.frameKind]);
  dv.setFloat32(24, cube.origin[0], true);
  dv.setFloat32(28, cube.origin[1], true);
  dv.setFloat32(32, cube.origin[2], true);
  dv.setFloat32(36, cube.voxelSize, true);
  dv.setFloat32(40, cube.rotation[0], true);
  dv.setFloat32(44, cube.rotation[1], true);
  dv.setFloat32(48, cube.rotation[2], true);
  dv.setFloat32(52, cube.rotation[3], true);
  dv.setFloat32(56, cube.valueMin, true); // = δ_min when value_kind = 1
  dv.setFloat32(60, cube.valueMax, true); // = δ_max when value_kind = 1
  if (cube.velocityStats !== undefined) {
    // Velocity field: fold the three cross-channel normalisation stats into
    // the reserved region (offsets 64/68/72).  Byte 64 was `density_scale`
    // in v1 and reserved since v2; the value_kind discriminator means a
    // scalar reader still sees zero there and never mis-reads these slots.
    dv.setFloat32(64, cube.velocityStats.speedKmsMax, true);
    dv.setFloat32(68, cube.velocityStats.speedKmsP99, true);
    dv.setFloat32(72, cube.velocityStats.deltaP99, true);
  }
  // For value_kind = 0 (scalar density) bytes 64..95 stay zero — relying on
  // ArrayBuffer's zero-init.  Bytes 76..95 are reserved for both kinds;
  // future extensions land there without bumping the version, as long as
  // decoders skip them unconditionally.

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
 *     decoder's style so operators know what command to run).  In
 *     particular, v1 and v2 files are rejected outright — v3 dropped the
 *     palette/densityScale bytes and added the channels byte; both are
 *     hard breaks by design.
 *   - unknown frame_kind byte
 *   - unsupported channel count (anything other than 1 or 4)
 *   - unknown value_kind byte (anything other than 0 or 1)
 *   - byte-length mismatch between header dims/channels and actual buffer size
 *
 * When value_kind = 1 the decoded cube carries `velocityStats` read from the
 * reserved region; when value_kind = 0 `velocityStats` is omitted (undefined).
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
  const dims: Vec3 = [dv.getUint32(8, true), dv.getUint32(12, true), dv.getUint32(16, true)];
  const dtype = dv.getUint8(20);
  if (dtype !== 0) {
    throw new Error(`decodeScalarField: unsupported dtype ${dtype} (v3 supports f16 only)`);
  }
  // `getUint8` is typed `number`, so an explicit narrow to the `1 | 4`
  // union the ScalarCube field demands is needed — TS won't infer it from
  // the inequality guard alone.  We branch rather than cast so the union is
  // proven, not asserted.
  const channelsByte = dv.getUint8(22);
  let channels: 1 | 4;
  if (channelsByte === 1) {
    channels = 1;
  } else if (channelsByte === 4) {
    channels = 4;
  } else {
    throw new Error(
      `decodeScalarField: unsupported channel count ${channelsByte} (v3 supports 1 or 4)`,
    );
  }
  // value_kind discriminates a plain scalar (0) from a velocity + overdensity
  // field (1).  It gates whether the reserved region holds velocity stats —
  // read it before the stat slots so a scalar cube never interprets stale
  // bytes.  Any other value is out of contract and rejected.
  const valueKind = dv.getUint8(21);
  if (valueKind !== 0 && valueKind !== 1) {
    throw new Error(
      `decodeScalarField: unknown value_kind ${valueKind} (v3 supports 0 = scalar, 1 = velocity field)`,
    );
  }
  const frameKindIdx = dv.getUint8(23);
  const frameKind = ID_TO_FRAME_KIND[frameKindIdx];
  if (frameKind === undefined) {
    throw new Error(`decodeScalarField: unknown frameKind id ${frameKindIdx}`);
  }
  const origin: Vec3 = [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)];
  const voxelSize = dv.getFloat32(36, true);
  const rotation: Vec4 = [
    dv.getFloat32(40, true),
    dv.getFloat32(44, true),
    dv.getFloat32(48, true),
    dv.getFloat32(52, true),
  ];
  const valueMin = dv.getFloat32(56, true);
  const valueMax = dv.getFloat32(60, true);
  // Velocity stats live in the reserved region only when value_kind = 1.
  // Read them here (not below) so the cube assembly stays a single return.
  const velocityStats =
    valueKind === 1
      ? {
          speedKmsMax: dv.getFloat32(64, true),
          speedKmsP99: dv.getFloat32(68, true),
          deltaP99: dv.getFloat32(72, true),
        }
      : undefined;

  const expectedVoxels = dims[0] * dims[1] * dims[2] * channels;
  const expectedBytes = SCFD_HEADER_BYTES + expectedVoxels * 2;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `decodeScalarField: byte length ${buf.byteLength} does not match expected ${expectedBytes} for dims ${dims.join('x')} × ${channels} channels`,
    );
  }
  // Copy the voxels into a freshly-owned buffer so the caller can hold
  // it independent of the underlying ArrayBuffer's lifetime (matches the
  // GalaxyCatalog decoder's contract).
  const voxels = new Uint16Array(expectedVoxels);
  voxels.set(new Uint16Array(buf, SCFD_HEADER_BYTES, expectedVoxels));

  // Decoded cube is data-only; presentation defaults flow through
  // `volumeFieldDefaults.ts` at registration time.
  return {
    dims,
    channels,
    voxels,
    frameKind,
    origin,
    voxelSize,
    rotation,
    valueMin,
    valueMax,
    // Spread conditionally so a scalar cube omits the key entirely rather
    // than carrying an explicit `undefined` — keeps `'velocityStats' in cube`
    // an honest presence check, mirroring the encoder's derive-from-presence.
    ...(velocityStats !== undefined ? { velocityStats } : {}),
  };
}
