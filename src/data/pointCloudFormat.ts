/**
 * Binary on-disk format for a `PointCloud` — version 2.
 *
 * Why a custom binary format instead of JSON or CSV?
 *
 *   - SDSS subsets quickly hit millions of points. JSON for 1M points is
 *     ~40 MB of text; the same data as packed binary is ~48 MB but parses
 *     instantly (no string→number conversion, no GC churn).
 *   - The decoded layout (Float32Arrays of positions/magnitudes, BigUint64Array
 *     of objIDs) is what we upload to the GPU — zero conversion cost.
 *
 * Layout (little-endian, since x86/ARM both default to LE and WebGPU is too):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     offset  size  field
 *     ──────  ────  ─────
 *     0       4     magic    = "SKMP" (0x504d4b53)
 *     4       4     version  = 2 (uint32)
 *     8       4     count    = number of points (uint32)
 *     12      4     reserved = 0 (room for future flags without bumping version)
 *
 *     ── PER-POINT RECORD (48 bytes each) ───────────────────────────────────
 *     offset  size  field
 *     ──────  ────  ─────
 *     0       8     objID   (uint64, little-endian) — SDSS object identifier
 *     8       4     x       (float32) — Mpc
 *     12      4     y       (float32)
 *     16      4     z       (float32)
 *     20      4     magU    (float32) — modelMag_u
 *     24      4     magG    (float32) — modelMag_g
 *     28      4     magR    (float32) — modelMag_r
 *     32      4     magI    (float32) — modelMag_i
 *     36      4     magZ    (float32) — modelMag_z
 *     40      8     padding (zeroed)
 *
 * The 8-byte padding at the end of each record is intentional: it keeps the
 * per-point record on a 16-byte boundary, which lets us reuse the buffer
 * directly as a WebGPU uniform/storage-buffer payload without any restructuring
 * if we ever need per-point GPU access beyond vertex attributes.
 *
 * Total file size: 16 + count × 48.
 *
 * The `magic` lets us reject random files quickly. The `version` lets us
 * evolve the format — v1 files are rejected with a clear message instructing
 * the user to regenerate via `npm run csv-to-bin`.
 */

import type { PointCloud } from '../types';

/**
 * "SKMP" as a little-endian uint32. Reading 4 bytes at offset 0 with
 * `getUint32(0, true)` recovers this constant; any other value means the
 * file isn't ours.
 */
const MAGIC = 0x504d4b53;

/** Bump this when the layout changes incompatibly. */
const VERSION = 2;

/** Header size in bytes (4 × uint32). Body starts here. */
const HEADER_BYTES = 16;

/**
 * Per-point payload in bytes.
 *
 * Breakdown: 8 (objID) + 4×3 (xyz) + 4×5 (5 bands) + 8 (padding) = 48.
 * 48 is a multiple of 16, satisfying the GPU alignment note in the file header.
 */
const BYTES_PER_POINT = 48;

/**
 * Encode a `PointCloud` to an `ArrayBuffer` ready to write to disk
 * (or send over `fetch`/the network). Pure — no I/O.
 *
 * Throws if any typed array in `cloud` isn't sized consistently with
 * `cloud.count`. That's a programming error in the caller, so we fail
 * loud rather than producing a corrupt file.
 */
export function encodePointCloud(cloud: PointCloud): ArrayBuffer {
  const { count, objIDs, positions, magU, magG, magR, magI, magZ } = cloud;
  if (objIDs.length !== count) throw new Error('objIDs length mismatch');
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magU.length !== count) throw new Error('magU length mismatch');
  if (magG.length !== count) throw new Error('magG length mismatch');
  if (magR.length !== count) throw new Error('magR length mismatch');
  if (magI.length !== count) throw new Error('magI length mismatch');
  if (magZ.length !== count) throw new Error('magZ length mismatch');

  // Allocate exactly the bytes we need: header + per-point records.
  const buf = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_POINT);

  // DataView gives us byte-precise control with explicit endianness.
  // The `true` flag on every setter means "write little-endian".
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true); // reserved

  // Write each point's record. We use DataView.setBigUint64 for the 64-bit
  // objID (the only field that won't fit in a Float32), then a Float32Array
  // view for the bulk of the floats — cheaper than per-field setFloat32.
  //
  // The Float32Array view is created once over the entire buffer; we index
  // into it by converting the per-record byte offset to a float element index.
  // Note: HEADER_BYTES (16) is a multiple of 4, so the view is correctly aligned.
  const floatView = new Float32Array(buf);
  // floatView[0..3] cover the header (MAGIC, VERSION, count, reserved) but we
  // won't write there via floatView — the DataView calls above already filled
  // that region. We start writing point data at floatView index = HEADER_BYTES/4.

  for (let i = 0; i < count; i++) {
    // Byte offset of this record's start within the buffer.
    const byteBase = HEADER_BYTES + i * BYTES_PER_POINT;

    // objID: 64-bit unsigned integer — must use DataView, not Float32Array.
    dv.setBigUint64(byteBase + 0, objIDs[i]!, true);

    // Float fields: index into the Float32Array view using the byte offset
    // divided by 4 (Float32 = 4 bytes). byteBase is always a multiple of 8
    // (HEADER_BYTES=16, BYTES_PER_POINT=48, both multiples of 8), so
    // (byteBase + 8) is always a multiple of 4 — the Float32Array is aligned.
    const f = (byteBase + 8) / 4; // float index for the first float field (x)
    floatView[f + 0] = positions[i * 3 + 0]!;
    floatView[f + 1] = positions[i * 3 + 1]!;
    floatView[f + 2] = positions[i * 3 + 2]!;
    floatView[f + 3] = magU[i]!;
    floatView[f + 4] = magG[i]!;
    floatView[f + 5] = magR[i]!;
    floatView[f + 6] = magI[i]!;
    floatView[f + 7] = magZ[i]!;
    // The 8 bytes of padding (floatView[f+8] and [f+9]) remain zero because
    // `new ArrayBuffer` zero-initialises its memory. No explicit write needed.
  }
  return buf;
}

/**
 * Decode an `ArrayBuffer` (e.g. from `await fetch(...).arrayBuffer()`) back
 * into a `PointCloud`. Pure — no I/O.
 *
 * Validates magic and version. Rejects v1 files with a message instructing
 * the user to regenerate. Throws on other malformed input rather than
 * silently returning garbage.
 *
 * Note: allocates fresh typed arrays rather than viewing into the input buffer.
 * Slight memory overhead, but lets the caller keep the result after the input
 * buffer is GC'd, and keeps the SoA layout clean for the GPU upload path.
 */
export function decodePointCloud(buf: ArrayBuffer): PointCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKMP file');

  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `unsupported version: ${version} — please regenerate the .bin via "npm run csv-to-bin"`,
    );
  }

  const count = dv.getUint32(8, true);

  // Allocate destination typed arrays once, fill them in the loop, return.
  const objIDs = new BigUint64Array(count);
  const positions = new Float32Array(count * 3);
  const magU = new Float32Array(count);
  const magG = new Float32Array(count);
  const magR = new Float32Array(count);
  const magI = new Float32Array(count);
  const magZ = new Float32Array(count);

  // Same Float32Array-view trick as the encoder: read floats cheaply by index.
  const floatView = new Float32Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_POINT;

    // objID: 64-bit unsigned — must read via DataView.
    objIDs[i] = dv.getBigUint64(byteBase + 0, true);

    // Floats start 8 bytes into the record (after the uint64 objID).
    const f = (byteBase + 8) / 4;
    positions[i * 3 + 0] = floatView[f + 0]!;
    positions[i * 3 + 1] = floatView[f + 1]!;
    positions[i * 3 + 2] = floatView[f + 2]!;
    magU[i] = floatView[f + 3]!;
    magG[i] = floatView[f + 4]!;
    magR[i] = floatView[f + 5]!;
    magI[i] = floatView[f + 6]!;
    magZ[i] = floatView[f + 7]!;
    // Padding bytes (f+8, f+9) are ignored on decode.
  }

  return { count, objIDs, positions, magU, magG, magR, magI, magZ };
}
