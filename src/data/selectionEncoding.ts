/**
 * selectionEncoding — single source of truth for the
 * `(sourceCode << 26) | localIdx` packed-identity encoding.
 *
 * ### Why this module exists
 *
 * skymap encodes a per-galaxy identity into one 32-bit unsigned integer
 * so the GPU pick texture (r32uint) can carry it as a single fragment
 * write. The encoding's magic numbers (the 26-bit shift, the 0x03ffffff
 * localIdx mask, the 0xFFFFFFFF "no selection" sentinel, the +1 pick
 * offset) are consumed from both TS and WESL. Open-coding them at each
 * use site leaves no compile-time or test-time guard against drift
 * between the two languages — bump the shift on the TS side, forget
 * the matching WESL change, and the symptom is "the wrong galaxy
 * highlights when you click".
 *
 * This module exports the canonical TS values plus encode/decode
 * helpers. A sister `selectionEncoding.wesl` mirrors the same constants
 * for the shader side; the parity test in
 * `tests/data/selectionEncoding.test.ts` asserts the two stay in
 * lockstep.
 *
 * ### The encoding
 *
 *   bits 26..31  →  sourceCode      (6 bits, 0..63 — source code 63 is
 *                                   intentionally unallocated to keep
 *                                   the all-ones sentinel disjoint)
 *   bits  0..25  →  localIdx        (26 bits, 0..67M per source)
 *
 * Widened 5→6 bits (shift 27→26) in the mcpm-workbench prep task: the
 * 5-bit space (codes 0..30 + sentinel 31) was fully allocated, and this
 * change is byte-behavior-identical for every source that existed
 * before it — see `SELECTION_NONE_SENTINEL`'s docstring for why the
 * literal sentinel value itself didn't need to change.
 *
 * The pick fragment writes `packed + PICK_SENTINEL_OFFSET` rather than
 * `packed` directly, so the cleared-to-zero pick texture remains
 * distinguishable from a legitimate (source=0, localIdx=0) hit. The
 * decode in `unpackPick` reverses the offset.
 */

import type { SourceType } from '../@types/data/SourceType';
import type { PickResult } from '../@types/data/PickResult';

/** Bit shift for the source code in the packed identity. */
export const SELECTION_SOURCE_SHIFT = 26;

/** Mask for the localIdx bits (the bottom 26 bits). */
export const SELECTION_LOCAL_IDX_MASK = 0x03ffffff;

/**
 * "Nothing selected" sentinel written into `u.selectedPacked` when no
 * galaxy is selected. Chosen as the max u32 because top-bits-set always
 * decodes to the reserved all-ones sourceCode of whatever field width
 * `SELECTION_SOURCE_SHIFT` currently is (31 at 5 bits, 63 at 6) — the
 * literal is representation-independent, so widening the shift does not
 * require touching this constant.
 */
export const SELECTION_NONE_SENTINEL = 0xffffffff;

/**
 * The reserved all-ones sourceCode — the top of whatever field width
 * `SELECTION_SOURCE_SHIFT` leaves for the source (63 at 6 bits).
 * Derived, not hand-maintained, so a future shift change can't leave
 * this comparison stale.
 */
export const SELECTION_SOURCE_SENTINEL_CODE = SELECTION_NONE_SENTINEL >>> SELECTION_SOURCE_SHIFT;

/**
 * Offset added by the pick fragment before writing into the r32uint
 * texture, so the cleared-to-zero background pixel is unambiguously
 * "no hit" even when a real (source=0, localIdx=0) hit would otherwise
 * pack to zero. `unpackPick` subtracts this before returning the
 * decoded local index.
 */
export const PICK_SENTINEL_OFFSET = 1;

/**
 * Pack a `(sourceCode, localIdx)` pair into the canonical u32 layout.
 *
 * `>>> 0` is the standard JS trick to force the result back into the
 * u32 range — without it, the bitwise OR returns a signed i32, which
 * then sign-extends if you try to read it as u32 elsewhere.
 */
export function packSelection(sourceCode: number, localIdx: number): number {
  return ((sourceCode << SELECTION_SOURCE_SHIFT) | localIdx) >>> 0;
}

/**
 * Decode a raw r32uint pick value into a {@link PickResult}, or `null` for no
 * hit. Reverses the `+ PICK_SENTINEL_OFFSET` and the `(code << 26) | localIdx`
 * layout. `0` is the cleared-texture background; the reserved all-ones
 * sentinel band (`SELECTION_SOURCE_SENTINEL_CODE`) — both return null.
 * Whether the decoded code is a pickable surface is `resolvePick`'s call.
 */
export function unpackPick(rawPickValue: number): PickResult | null {
  if (rawPickValue === 0) return null;
  const sourceCode = rawPickValue >>> SELECTION_SOURCE_SHIFT;
  // Reserved sentinel band — never a real hit.
  if (sourceCode === SELECTION_SOURCE_SENTINEL_CODE) return null;
  const localIdx = (rawPickValue & SELECTION_LOCAL_IDX_MASK) - PICK_SENTINEL_OFFSET;
  return { sourceCode: sourceCode as SourceType, localIdx };
}
