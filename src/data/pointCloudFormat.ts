/**
 * Binary on-disk format for a `PointCloud` — version 3.
 *
 * Why a custom binary format instead of JSON or CSV?
 *
 *   - SDSS subsets quickly hit millions of points. JSON for 1M points is
 *     ~40 MB of text; the same data as packed binary parses instantly with
 *     no string→number conversion and no GC churn.
 *   - The decoded layout (Float32Arrays of positions/magnitudes, BigUint64Array
 *     of objIDs) is what we upload to the GPU — zero conversion cost.
 *
 * What changed in v3?
 *
 *   v3 adds per-galaxy orientation: `axisRatio` (b/a in [0, 1]) and
 *   `positionAngleDeg` (PA in [0, 180), measured east of north). These drive
 *   the projected disk shapes introduced in the galaxy-orientation-disks plan.
 *
 *   We deliberately preserve NaN as a legitimate decoded value: NaN means
 *   "no measurement / no fallback applied yet". In practice the build pipeline
 *   always fills these in (real value when a cross-match succeeds, deterministic
 *   fallback otherwise), but the encoder/decoder must round-trip NaN without
 *   substitution so they remain pure functions — easy to unit-test in isolation
 *   and independent of however callers populate the cloud upstream.
 *
 *   The trailing per-record padding shrinks from 8 bytes (v2) to 8 bytes
 *   (v3) — wait, that's the same. The math: we added two new f32 fields
 *   (8 bytes), so to keep the record size on a 16-byte boundary we needed to
 *   add at least 8 bytes of payload, which we did. Total grows 48 → 56 B/point.
 *
 * Layout (little-endian — x86/ARM both default to LE and WebGPU does too):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     offset  size  field
 *     ──────  ────  ─────
 *     0       4     magic    = "SKMP" (0x504d4b53)
 *     4       4     version  = 3 (uint32)
 *     8       4     count    = number of points (uint32)
 *     12      4     reserved = 0 (room for future flags without bumping version)
 *
 *     ── PER-POINT RECORD (56 bytes each) ───────────────────────────────────
 *     offset  size  field
 *     ──────  ────  ─────
 *     0       8     objID            (uint64) — SDSS object identifier
 *     8       4     x                (float32) — Mpc
 *     12      4     y                (float32)
 *     16      4     z                (float32)
 *     20      4     magU             (float32) — modelMag_u
 *     24      4     magG             (float32) — modelMag_g
 *     28      4     magR             (float32) — modelMag_r
 *     32      4     magI             (float32) — modelMag_i
 *     36      4     magZ             (float32) — modelMag_z
 *     40      4     axisRatio        (float32) — b/a in [0,1] or NaN
 *     44      4     positionAngleDeg (float32) — PA in [0,180) or NaN
 *     48      8     padding          (zeroed)
 *
 * The 8-byte tail padding keeps the per-point record on a 16-byte boundary,
 * so the buffer remains usable as a WebGPU uniform/storage-buffer payload
 * without any restructuring if we ever need per-point GPU access beyond
 * vertex attributes.
 *
 * Total file size: 16 + count × 56.
 *
 * The `magic` lets us reject random files quickly. The `version` lets us
 * evolve the format — both v1 and v2 files are now rejected with a clear
 * message instructing the user to regenerate via `npm run build-all`
 * (the modern entrypoint that supersedes the old `csv-to-bin`).
 */

import type { PointCloud } from '../@types';

/**
 * "SKMP" as a little-endian uint32. Reading 4 bytes at offset 0 with
 * `getUint32(0, true)` recovers this constant; any other value means the
 * file isn't ours.
 */
const MAGIC = 0x504d4b53;

/** Bump this when the layout changes incompatibly. */
const VERSION = 3;

/** Header size in bytes (4 × uint32). Body starts here. */
const HEADER_BYTES = 16;

/**
 * Per-point payload in bytes.
 *
 * Breakdown: 8 (objID) + 4×3 (xyz) + 4×5 (5 photometric bands)
 *          + 4×2 (axisRatio + positionAngleDeg) + 8 (tail padding) = 56.
 * 56 is a multiple of 16, satisfying the GPU-alignment note above.
 */
const BYTES_PER_POINT = 56;

/**
 * Encode a `PointCloud` to an `ArrayBuffer` ready to write to disk
 * (or send over `fetch`/the network). Pure — no I/O.
 *
 * Throws if any typed array in `cloud` isn't sized consistently with
 * `cloud.count`. That's a programming error in the caller, so we fail
 * loud rather than producing a corrupt file.
 */
export function encodePointCloud(cloud: PointCloud): ArrayBuffer {
  const {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
  } = cloud;
  if (objIDs.length !== count) throw new Error('objIDs length mismatch');
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magU.length !== count) throw new Error('magU length mismatch');
  if (magG.length !== count) throw new Error('magG length mismatch');
  if (magR.length !== count) throw new Error('magR length mismatch');
  if (magI.length !== count) throw new Error('magI length mismatch');
  if (magZ.length !== count) throw new Error('magZ length mismatch');
  if (axisRatio.length !== count) throw new Error('axisRatio length mismatch');
  if (positionAngleDeg.length !== count)
    throw new Error('positionAngleDeg length mismatch');

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
  //
  // Subtle but important for v3: writing NaN through a Float32Array preserves
  // the IEEE-754 NaN bit pattern losslessly, so NaN sentinels round-trip.
  const floatView = new Float32Array(buf);

  for (let i = 0; i < count; i++) {
    // Byte offset of this record's start within the buffer.
    const byteBase = HEADER_BYTES + i * BYTES_PER_POINT;

    // objID: 64-bit unsigned integer — must use DataView, not Float32Array.
    dv.setBigUint64(byteBase + 0, objIDs[i]!, true);

    // Float fields: index into the Float32Array view using the byte offset
    // divided by 4 (Float32 = 4 bytes). byteBase is always a multiple of 8
    // (HEADER_BYTES=16, BYTES_PER_POINT=56, both multiples of 8), so
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
    floatView[f + 8] = axisRatio[i]!;
    floatView[f + 9] = positionAngleDeg[i]!;
    // The 8 bytes of tail padding (floatView[f+10] and [f+11]) remain zero
    // because `new ArrayBuffer` zero-initialises its memory. No write needed.
  }
  return buf;
}

/**
 * Decode an `ArrayBuffer` (e.g. from `await fetch(...).arrayBuffer()`) back
 * into a `PointCloud`. Pure — no I/O.
 *
 * Validates magic and version. Rejects v1 and v2 files with a message
 * instructing the user to regenerate. Throws on other malformed input rather
 * than silently returning garbage.
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
    // Single error path covers v1, v2, and any other foreign version. The
    // regenerate hint points at the modern build entrypoint (`build-all`),
    // which now also writes the v3 orientation fields.
    throw new Error(
      `unsupported version: ${version} — please regenerate the .bin via "npm run build-all"`,
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
  const axisRatio = new Float32Array(count);
  const positionAngleDeg = new Float32Array(count);

  // Same Float32Array-view trick as the encoder: read floats cheaply by index.
  // NaN bit patterns survive this view-read just like they do on write.
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
    axisRatio[i] = floatView[f + 8]!;
    positionAngleDeg[i] = floatView[f + 9]!;
    // Padding bytes (f+10, f+11) are ignored on decode.
  }

  return {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
  };
}
