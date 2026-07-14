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
 * level, not from a marker bit in the record — which is why the record's
 * 5 spare bits stay reserved and zeroed in v1 rather than spending one
 * on a leaf flag.
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

/** File magic "SKST" (little-endian ASCII), distinct from the galaxy "SKMP". */
export const MAGIC = 0x54534b53;

/** On-disk format version. Bumping this rejects every older `.bin` on load. */
export const VERSION = 1;

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
const STAR_COLORIDX_STEP = (STAR_COLORIDX_MAX - STAR_COLORIDX_MIN) / STAR_COLORIDX_LEVELS;

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
