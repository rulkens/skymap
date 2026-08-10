/**
 * Binary on-disk format for a star catalog — version 1.
 *
 * The galaxy catalogs (see `galaxyCatalogFormat.ts`) spend 64 bytes per
 * object: absolute cartesian floats plus a dozen photometric and
 * morphological fields, because a few million galaxies fit that budget
 * and every field earns its keep on the InfoCard. Stars are a different
 * problem. There are far more of them, they carry far less per-object
 * metadata that a viewer cares about, and they cluster hard — so the
 * star format trades the galaxy format's flat float-per-field record for
 * a *cell-quantized* 6-byte record hung off a spatial octree.
 *
 * ── Why cell-quantized 6-byte records ─────────────────────────────────────
 *
 * A star's world position is reconstructed as `cellOrigin + offset /
 * 1024 * cellEdgePc`, where `cellOrigin` and `cellEdgePc` come from the
 * owning octree node and `offset` is a per-record triple of 10-bit
 * in-cell coordinates. Ten bits (0..1023) across a leaf cell is finer
 * than the astrometry warrants at any zoom the renderer reaches, so the
 * quantization is lossless *in practice* while costing 30 bits instead
 * of three float32s (96 bits). Absolute magnitude and BP-RP colour are
 * likewise quantized to small LUT indices (7 and 6 bits) rather than
 * stored as floats — a star's point sprite only needs enough precision
 * to pick a brightness and a colour-temperature tint, not a photometric
 * measurement. The whole record is 48 bits = 6 bytes, an ~11x shrink
 * over the galaxy layout, which is what lets a star count an order of
 * magnitude larger than the galaxy catalogs still fit a tier budget.
 *
 * ── Why an in-file octree flux mip ────────────────────────────────────────
 *
 * The same 6-byte record shape describes both a *leaf* star and an
 * *aggregate* — a single record standing in for all the stars under an
 * interior octree node, positioned at their flux-weighted centroid and
 * carrying their summed brightness. That aggregate is a flux mip: at a
 * distance where ten thousand individual leaf stars would render as an
 * unresolved smudge, the renderer draws the one aggregate record for
 * their node instead and gets the same integrated glow for a fraction of
 * the vertices. Because a leaf and an aggregate are byte-identical, the
 * leaf-vs-aggregate distinction is recovered from the owning node's
 * `childMask` (0 ⇒ leaf), not from a marker bit in the record — which is
 * why the record's 5 spare bits stay reserved and zeroed in v1 rather than
 * spending one on a leaf flag. (The distinction is NOT the node's level:
 * a fat leaf — a sparse subtree merged into one node to shrink the node
 * table — lives at level > 0 yet is a leaf whose records are real stars.)
 *
 * ── Serialization, compression, and the loud regenerate contract ──────────
 *
 * This module lands only the *record-level* primitives: the format
 * constants, the magnitude/colour LUT quantizers, and the 6-byte
 * pack/unpack. The file-level header/node/record serialization arrives
 * alongside it, and the on-disk payload is run through the sealed
 * compression codec in `starBinCodec.ts` (this module never names a
 * compression algorithm — that decision lives sealed in one place).
 *
 * Like the galaxy format, a star `.bin` opens with a magic + version
 * header, and a reader that sees the wrong magic or an unknown version
 * fails loudly with a "regenerate the .bin" error rather than
 * misreading stale bytes. The header is the single source of truth for
 * "do I understand this file?" — bumping `VERSION` means every consumer
 * rejects old bins until the build pipeline re-emits them.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { StarCatalog } from '../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogNode } from '../../@types/data/starCatalog/StarCatalogNode';
import { compressStarBin, decompressStarBin } from './starBinCodec';

/** File magic "SKST" (little-endian ASCII), distinct from the galaxy "SKMP". */
export const MAGIC = 0x54534b53;

/** On-disk format version. Bumping this rejects every older `.bin` on load. */
export const VERSION = 1;

// Version-stamped folder: max-age=86400 lets a CDN serve an old .bin
// alongside new code for up to a day, so the epoch has to live in the
// path itself to make that pairing impossible (images/earth-tiles/'s
// TILE_PREFIX precedent).
export const STAR_CATALOG_DATA_PREFIX = `star-catalog/v${VERSION}`;

/** Fixed file-header size in bytes (magic, version, count, octree bounds …). */
export const HEADER_BYTES = 64;

/** Fixed per-octree-node size in bytes. */
export const NODE_BYTES = 16;

/** Fixed per-record size in bytes — a leaf star or an aggregate. */
export const RECORD_BYTES = 6;

/**
 * ── Magnitude / colour LUT windows (frozen constants) ─────────────────────
 *
 * Absolute magnitude and BP-RP colour are quantized to small integer LUT
 * indices packed into each record. The windows below are *astrophysically
 * motivated*, chosen to bracket the real stellar population the catalog
 * ships: the bright-blue end covers hot O stars and white dwarfs, and the
 * faint-red end reaches the late-M dwarfs of the Gaia Catalogue of Nearby
 * Stars. The absolute-magnitude span is fixed at `128 x 0.19 = 24.32` mag,
 * so `STAR_ABSMAG_MIN = -6.0` sets a ceiling of `+18.32`.
 *
 * These endpoints were *intended* to be measured from the fetched Gaia +
 * GCNS + Hipparcos distribution; that fetch is deferred, so the plan's
 * starting windows are frozen here verbatim. They are not a guess left
 * unchecked: at encode time the build pipeline runs a counted-clamp log
 * that counts every value saturating against these endpoints. A window
 * that is too narrow surfaces as a loud clamp count against the real
 * data — a wrong endpoint is caught, not silently saturated — which is
 * exactly why the quantizers below clamp rather than reject: the caller
 * compares its inputs against these constants and reports, the quantizer
 * stays a pure total function.
 */

/** Absolute-magnitude LUT resolution — 7-bit index (0..127). */
export const STAR_ABSMAG_LEVELS = 128;

/** Absolute-magnitude LUT step in mag/level: `128 x 0.19 = 24.32` mag span. */
export const STAR_ABSMAG_STEP = 0.19;

/** Absolute-magnitude window floor; ceiling is `MIN + LEVELS x STEP = +18.32`. */
export const STAR_ABSMAG_MIN = -6.0;

/** BP-RP colour LUT resolution — 6-bit index (0..63). */
export const STAR_COLORIDX_LEVELS = 64;

/** BP-RP colour window floor (bluest bin edge). */
export const STAR_COLORIDX_MIN = -0.6;

/** BP-RP colour window ceiling (reddest bin edge). */
export const STAR_COLORIDX_MAX = 4.4;

/** Width of one BP-RP colour bin, derived from the frozen window. */
export const STAR_COLORIDX_STEP = (STAR_COLORIDX_MAX - STAR_COLORIDX_MIN) / STAR_COLORIDX_LEVELS;

/**
 * In-cell offset resolution — the 10-bit per-axis offset triple spans `[0, 1024)`
 * of the owning node's box edge (see the record layout above). This is the one
 * home for that span: both the reconstruction in `resolveStarRecord` and the
 * vertex shader's `OFFSET_SCALE` (`1 / 1024`) invert it, so they must read the
 * same 1024. Sibling of `STAR_ABSMAG_LEVELS` / `STAR_COLORIDX_LEVELS`.
 */
export const STAR_OFFSET_LEVELS = 1024;

/**
 * Clamp `value` into the inclusive integer range `[0, maxIndex]`.
 * Out-of-range inputs saturate at the endpoints — the caller (encode
 * time) is responsible for counting saturations against the frozen
 * windows, so the quantizer itself stays a pure total function.
 */
function clampIndex(value: number, maxIndex: number): number {
  if (value < 0) return 0;
  if (value > maxIndex) return maxIndex;
  return value;
}

/** Quantize an absolute magnitude to its 7-bit LUT index (clamped 0..127). */
export function absMagToLutIndex(absMag: number): number {
  const i = Math.floor((absMag - STAR_ABSMAG_MIN) / STAR_ABSMAG_STEP);
  return clampIndex(i, STAR_ABSMAG_LEVELS - 1);
}

/** Dequantize a 7-bit magnitude index to its bin *centre* in mag. */
export function lutIndexToAbsMag(i: number): number {
  return STAR_ABSMAG_MIN + (i + 0.5) * STAR_ABSMAG_STEP;
}

/** Quantize a BP-RP colour to its 6-bit LUT index (clamped 0..63). */
export function bpRpToColorIdx(bpRp: number): number {
  const i = Math.floor((bpRp - STAR_COLORIDX_MIN) / STAR_COLORIDX_STEP);
  return clampIndex(i, STAR_COLORIDX_LEVELS - 1);
}

/** Dequantize a 6-bit colour index to its bin *centre* in BP-RP. */
export function colorIdxToBpRp(i: number): number {
  return STAR_COLORIDX_MIN + (i + 0.5) * STAR_COLORIDX_STEP;
}

/**
 * Pack one 6-byte record from already-quantized fields.
 *
 * Bit layout (little-endian across 48 bits):
 *
 *     bits  0-9   offsetX   (10 bits, 0..1023)
 *     bits 10-19  offsetY   (10 bits)
 *     bits 20-29  offsetZ   (10 bits)
 *     bits 30-36  absMagIdx ( 7 bits)
 *     bits 37-42  colorIdx  ( 6 bits)
 *     bits 43-47  spare     ( 5 bits, always zero in v1)
 *
 * The 48-bit field is composed as two independent 24-bit halves rather
 * than one integer, because JavaScript's bitwise operators coerce their
 * operands to *signed 32-bit* — any `<<`/`|` touching a bit at position
 * 32 or above wraps or sign-flips. Each half stays under 2^24, so the
 * arithmetic below is entirely within the safe int32 bitwise range.
 * `offsetZ` straddles the 24-bit boundary: its low 4 bits ride in the
 * low half, its high 6 bits in the high half. The spare bits are never
 * written, so they inherit zero from the fresh buffer.
 */
export function packStarRecord(offset: Vec3, absMagIdx: number, colorIdx: number): Uint8Array {
  const [ox, oy, oz] = offset;

  // Low half = bits 0..23: offsetX, offsetY, and offsetZ's low 4 bits.
  const lo = (ox & 0x3ff) | ((oy & 0x3ff) << 10) | ((oz & 0xf) << 20);
  // High half = bits 24..47: offsetZ's high 6 bits, absMagIdx, colorIdx.
  const hi = (oz >>> 4) | ((absMagIdx & 0x7f) << 6) | ((colorIdx & 0x3f) << 13);

  const rec = new Uint8Array(RECORD_BYTES);
  rec[0] = lo & 0xff;
  rec[1] = (lo >>> 8) & 0xff;
  rec[2] = (lo >>> 16) & 0xff;
  rec[3] = hi & 0xff;
  rec[4] = (hi >>> 8) & 0xff;
  rec[5] = (hi >>> 16) & 0xff;
  return rec;
}

/**
 * Unpack the 6-byte record starting at byte offset `at` within `rec`.
 * The 5 spare high bits (43-47) are ignored, per the reserved-bit
 * contract — a decoder must not depend on their value.
 */
export function unpackStarRecord(
  rec: Uint8Array,
  at: number,
): { offset: Vec3; absMagIdx: number; colorIdx: number } {
  const lo = rec[at]! | (rec[at + 1]! << 8) | (rec[at + 2]! << 16);
  const hi = rec[at + 3]! | (rec[at + 4]! << 8) | (rec[at + 5]! << 16);

  const ox = lo & 0x3ff;
  const oy = (lo >>> 10) & 0x3ff;
  // offsetZ: low 4 bits from the low half, high 6 bits from the high half.
  const oz = ((lo >>> 20) & 0xf) | ((hi & 0x3f) << 4);

  const absMagIdx = (hi >>> 6) & 0x7f;
  const colorIdx = (hi >>> 13) & 0x3f;

  return { offset: [ox, oy, oz], absMagIdx, colorIdx };
}

/**
 * ── File-level serialization ──────────────────────────────────────────────
 *
 * On-disk order is header (`HEADER_BYTES`) → node table
 * (`nodeCount × NODE_BYTES`) → the packed record blob, and the whole
 * uncompressed image is then run through the sealed `compressStarBin`
 * codec (this module never names a compression algorithm — that decision
 * lives sealed in `starBinCodec.ts`, which is why encode/decode are
 * async).
 *
 * `totalRecords` is deliberately *not* a header field: the record blob
 * simply runs to the end of the decompressed buffer, and its record count
 * is recovered on decode as `remainingBytes / RECORD_BYTES`. A file whose
 * record region is not a whole multiple of `RECORD_BYTES` is truncated or
 * corrupt, so decode throws rather than silently mis-parsing the tail.
 *
 * Header layout (little-endian):
 *
 *      0   4   magic = "SKST" (uint32)
 *      4   4   version (uint32)
 *      8   4   starCount — leaf star records (uint32)
 *     12   4   nodeCount — octree nodes, leaf + aggregate (uint32)
 *     16   4   mortonBitsPerAxis (uint32)
 *     20   4   cellEdgePc (float32, parsecs)
 *     24   8   gridOriginX (float64, parsecs — kept f64 for the precision story)
 *     32   8   gridOriginY (float64)
 *     40   8   gridOriginZ (float64)
 *     48  16   reserved (zeroed)
 *
 * Node layout (16 bytes, little-endian):
 *
 *      0   4   mortonIndex (uint32)
 *      4   1   level (uint8)
 *      5   3   childMask — 24-bit uint, three LE bytes (byte 5 = bits 0-7,
 *              byte 6 = bits 8-15, byte 7 = bits 16-23)
 *      8   4   firstRecord (uint32)
 *     12   4   recordCount (uint32)
 */

/**
 * Serialize `cat` into a compressed `.bin` payload: header + node table +
 * record blob through `compressStarBin`. Async because the codec is.
 */
export async function encodeStarCatalog(cat: StarCatalog): Promise<ArrayBuffer> {
  const { starCount, nodeCount, mortonBitsPerAxis, cellEdgePc, gridOrigin, nodes, records } = cat;
  if (nodes.length !== nodeCount) throw new Error('nodes length mismatch');
  if (records.length % RECORD_BYTES !== 0)
    throw new Error('records length not a whole number of records');

  const buf = new ArrayBuffer(HEADER_BYTES + nodeCount * NODE_BYTES + records.length);
  const dv = new DataView(buf);

  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, starCount, true);
  dv.setUint32(12, nodeCount, true);
  dv.setUint32(16, mortonBitsPerAxis, true);
  dv.setFloat32(20, cellEdgePc, true);
  dv.setFloat64(24, gridOrigin[0], true);
  dv.setFloat64(32, gridOrigin[1], true);
  dv.setFloat64(40, gridOrigin[2], true);
  // reserved bytes 48..63 stay zero from the fresh ArrayBuffer.

  for (let i = 0; i < nodeCount; i++) {
    const node = nodes[i]!;
    const base = HEADER_BYTES + i * NODE_BYTES;
    dv.setUint32(base + 0, node.mortonIndex, true);
    dv.setUint8(base + 4, node.level & 0xff);
    // childMask as three little-endian bytes composing a 24-bit uint.
    dv.setUint8(base + 5, node.childMask & 0xff);
    dv.setUint8(base + 6, (node.childMask >>> 8) & 0xff);
    dv.setUint8(base + 7, (node.childMask >>> 16) & 0xff);
    dv.setUint32(base + 8, node.firstRecord, true);
    dv.setUint32(base + 12, node.recordCount, true);
  }

  // Copy the packed record blob in right after the node table.
  new Uint8Array(buf).set(records, HEADER_BYTES + nodeCount * NODE_BYTES);

  const packed = await compressStarBin(new Uint8Array(buf));
  // `compressStarBin` returns a freshly allocated Uint8Array (offset 0,
  // exactly sized); slice hands back an owned buffer. The `as ArrayBuffer`
  // narrows the lib's `ArrayBufferLike` union — our buffers are never
  // SharedArrayBuffer-backed.
  return packed.buffer.slice(
    packed.byteOffset,
    packed.byteOffset + packed.byteLength,
  ) as ArrayBuffer;
}

/**
 * Inflate and parse a `.bin` payload produced by {@link encodeStarCatalog}.
 * Fails loudly on a wrong magic or an unknown version — the header is the
 * single source of truth for "do I understand this file?". Async because
 * the codec is.
 */
export async function decodeStarCatalog(buf: ArrayBuffer): Promise<StarCatalog> {
  const plain = await decompressStarBin(new Uint8Array(buf));
  const dv = new DataView(plain.buffer, plain.byteOffset, plain.byteLength);

  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKST file');

  // A version mismatch surfaces as the documented "regenerate" error —
  // stale bins fail on every load until the build pipeline re-emits them.
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `unsupported version: ${version} — please regenerate the .bin via "npm run build-stars"`,
    );
  }

  const starCount = dv.getUint32(8, true);
  const nodeCount = dv.getUint32(12, true);
  const mortonBitsPerAxis = dv.getUint32(16, true);
  const cellEdgePc = dv.getFloat32(20, true);
  const gridOrigin: Vec3 = [
    dv.getFloat64(24, true),
    dv.getFloat64(32, true),
    dv.getFloat64(40, true),
  ];

  const nodes: StarCatalogNode[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    const base = HEADER_BYTES + i * NODE_BYTES;
    const mortonIndex = dv.getUint32(base + 0, true);
    const level = dv.getUint8(base + 4);
    // childMask: three little-endian bytes composing a 24-bit uint.
    const childMask =
      dv.getUint8(base + 5) | (dv.getUint8(base + 6) << 8) | (dv.getUint8(base + 7) << 16);
    const firstRecord = dv.getUint32(base + 8, true);
    const recordCount = dv.getUint32(base + 12, true);
    nodes[i] = { mortonIndex, level, childMask, firstRecord, recordCount };
  }

  // The record blob runs from the end of the node table to EOF. Its byte
  // length must be a whole number of records or the file is truncated —
  // fail loudly rather than mis-parse the tail.
  const recordsStart = HEADER_BYTES + nodeCount * NODE_BYTES;
  const recordBytes = plain.byteLength - recordsStart;
  if (recordBytes < 0 || recordBytes % RECORD_BYTES !== 0) {
    throw new Error(
      `truncated SKST file — record region is ${recordBytes} bytes, not a multiple of ${RECORD_BYTES}`,
    );
  }
  // A fresh copy (not a view): contiguous, zero byteOffset, GPU-upload-ready
  // and decoupled from the transient decompression buffer.
  const records = plain.slice(recordsStart, recordsStart + recordBytes);

  return { starCount, nodeCount, mortonBitsPerAxis, cellEdgePc, gridOrigin, nodes, records };
}

/** The empty catalog — zero stars, zero nodes. The renderer's initial state. */
export function emptyStarCatalog(): StarCatalog {
  return {
    starCount: 0,
    nodeCount: 0,
    mortonBitsPerAxis: 0,
    cellEdgePc: 0,
    gridOrigin: [0, 0, 0],
    nodes: [],
    records: new Uint8Array(0),
  };
}
