/**
 * Binary on-disk format for a `PointCloud`.
 *
 * Why a custom binary format instead of JSON or CSV?
 *
 *   - SDSS subsets quickly hit millions of points. JSON for 1M points is
 *     ~40 MB of text; the same data as packed Float32 is ~20 MB and parses
 *     instantly (no string→number conversion, no GC churn).
 *   - The decoded layout (Float32Array of positions/magnitudes/colorIndex)
 *     is *exactly* what we upload to the GPU — zero conversion cost.
 *
 * Layout (little-endian, since x86/ARM both default to LE and WebGPU is too):
 *
 *     offset  size  field
 *     ──────  ────  ─────
 *     0       4     magic  = "SKMP" (0x504d4b53)
 *     4       4     version = 1 (uint32)
 *     8       4     count   = number of points (uint32)
 *     12      4     reserved = 0 (room for future flags without bumping version)
 *     16      …     count × 5 × Float32 — interleaved (x, y, z, magnitude, colorIdx) per point
 *
 * The `magic` lets us reject random files quickly. The `version` lets us
 * evolve the format later without breaking old `.bin` files at runtime.
 */

import type { PointCloud } from '../types';

/**
 * "SKMP" as a little-endian uint32. Reading 4 bytes at offset 0 with
 * `getUint32(0, true)` recovers this constant; any other value means the
 * file isn't ours.
 */
const MAGIC = 0x504d4b53;

/** Bump this when the layout changes incompatibly. */
const VERSION = 1;

/** Header size in bytes (4 × uint32). Body starts here. */
const HEADER_BYTES = 16;

/** Per-point payload: x, y, z, magnitude, colorIndex. */
const FLOATS_PER_POINT = 5;

/**
 * Encode a `PointCloud` to an `ArrayBuffer` ready to write to disk
 * (or send over `fetch`/the network). Pure — no I/O.
 *
 * Throws if the three typed arrays in `cloud` aren't sized consistently
 * with `cloud.count`. That's a programming error in the caller, so we fail
 * loud rather than producing a corrupt file.
 */
export function encodePointCloud(cloud: PointCloud): ArrayBuffer {
  const { count, positions, magnitudes, colorIndex } = cloud;
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magnitudes.length !== count) throw new Error('magnitudes length mismatch');
  if (colorIndex.length !== count) throw new Error('colorIndex length mismatch');

  // Allocate exactly the bytes we need: header + payload.
  const buf = new ArrayBuffer(HEADER_BYTES + count * FLOATS_PER_POINT * 4);

  // DataView gives us byte-precise control with explicit endianness.
  // The `true` flag on every setter means "write little-endian".
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true); // reserved

  // For the bulk float payload we get a *typed view* over the same backing
  // buffer at offset HEADER_BYTES — no copy, no allocation per point.
  // The view is implicitly little-endian (Float32Array uses host byte order,
  // which on x86/ARM is LE — true for every browser target we care about).
  const floats = new Float32Array(buf, HEADER_BYTES, count * FLOATS_PER_POINT);
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_POINT;
    // Interleaving keeps each point's data contiguous, which matches the
    // GPU vertex-buffer layout we'll declare in `pointRenderer.ts` later.
    floats[o + 0] = positions[i * 3 + 0]!;
    floats[o + 1] = positions[i * 3 + 1]!;
    floats[o + 2] = positions[i * 3 + 2]!;
    floats[o + 3] = magnitudes[i]!;
    floats[o + 4] = colorIndex[i]!;
  }
  return buf;
}

/**
 * Decode an `ArrayBuffer` (e.g. from `await fetch(...).arrayBuffer()`) back
 * into a `PointCloud`. Pure — no I/O.
 *
 * Validates magic and version. Throws on malformed input rather than
 * silently returning garbage.
 *
 * Note: this allocates *new* Float32Arrays for positions/magnitudes/colorIndex
 * rather than viewing into the input buffer. Slight memory overhead, but
 * lets the caller keep the result after the input buffer is GC'd, and
 * matches the "interleaved on disk, separated in memory" split that the
 * rest of the code expects.
 */
export function decodePointCloud(buf: ArrayBuffer): PointCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKMP file');
  const version = dv.getUint32(4, true);
  if (version !== VERSION) throw new Error(`unsupported version: ${version}`);
  const count = dv.getUint32(8, true);

  // Same trick as in encode: a typed view over the existing buffer, no copy.
  const floats = new Float32Array(buf, HEADER_BYTES, count * FLOATS_PER_POINT);

  // Allocate the destination arrays once, fill them, return.
  const positions = new Float32Array(count * 3);
  const magnitudes = new Float32Array(count);
  const colorIndex = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * FLOATS_PER_POINT;
    positions[i * 3 + 0] = floats[o + 0]!;
    positions[i * 3 + 1] = floats[o + 1]!;
    positions[i * 3 + 2] = floats[o + 2]!;
    magnitudes[i] = floats[o + 3]!;
    colorIndex[i] = floats[o + 4]!;
  }
  return { count, positions, magnitudes, colorIndex };
}
