/**
 * selectionEncoding — single source of truth for the
 * `(sourceCode << 27) | localIdx` packed-identity encoding.
 *
 * ### Why this module exists
 *
 * skymap encodes a per-galaxy identity into one 32-bit unsigned integer
 * so the GPU pick texture (r32uint) can carry it as a single fragment
 * write. The encoding's magic numbers (the 27-bit shift, the 0x07ffffff
 * localIdx mask, the 0xFFFFFFFF "no selection" sentinel, the +1 pick
 * offset) used to be open-coded across three TS files and two WESL
 * files. That left no compile-time or test-time guard against drift
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
 *   bits 27..31  →  sourceCode      (5 bits, 0..31 — source code 31 is
 *                                   intentionally unallocated to keep
 *                                   the all-ones sentinel disjoint)
 *   bits  0..26  →  localIdx        (27 bits, 0..134M per source)
 *
 * The pick fragment writes `packed + PICK_SENTINEL_OFFSET` rather than
 * `packed` directly, so the cleared-to-zero pick texture remains
 * distinguishable from a legitimate (source=0, localIdx=0) hit. The
 * decode in `unpackPick` reverses the offset.
 */

import { Source } from './sources';
import type { SourceType } from '../@types/data/SourceType';

/** Bit shift for the source code in the packed identity. */
export const SELECTION_SOURCE_SHIFT = 27;

/** Mask for the localIdx bits (the bottom 27 bits). */
export const SELECTION_LOCAL_IDX_MASK = 0x07ffffff;

/**
 * "Nothing selected" sentinel written into `u.selectedPacked` when no
 * galaxy is selected. Chosen as the max u32 because top-5-bits-set
 * encodes source code 31, which we don't allocate.
 */
export const SELECTION_NONE_SENTINEL = 0xffffffff;

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
 * Decoded pick-buffer result. Discriminator `kind` says which of the
 * six categories the hit was, and the payload shape differs per kind:
 *
 *   - 'galaxy'     — a survey-galaxy hit. Carries the Source enum +
 *                    the per-source local index.
 *   - 'cluster'    — a cluster POI hit. Carries the POI index into
 *                    the cluster anchor table.
 *   - 'supercluster' — same as cluster, but for supercluster anchors.
 *   - 'void'       — same as cluster, but for void anchors.
 *   - 'group'      — same as cluster, but for nearby-galaxy-group anchors.
 *
 * The discriminated-union shape forces callers to switch on `kind`
 * (rather than read a magic source-code number) — the type system
 * surfaces every new POI variant at every call site the moment a
 * category is added. See spec §6.2 for the per-category allocation
 * rationale and §7.2 for the call-site impact (`wireInput.ts`).
 */
export type PickResult =
  | { readonly kind: 'galaxy'; readonly source: SourceType; readonly localIdx: number }
  | { readonly kind: 'cluster'; readonly poiIndex: number }
  | { readonly kind: 'supercluster'; readonly poiIndex: number }
  | { readonly kind: 'void'; readonly poiIndex: number }
  | { readonly kind: 'group'; readonly poiIndex: number };

/**
 * Decode a raw r32uint pick-buffer value into the canonical
 * {@link PickResult} discriminated union, or `null` for "no hit".
 *
 * The raw value carries the picker's `+ PICK_SENTINEL_OFFSET` (so the
 * cleared-zero background remains distinguishable from a legitimate
 * source=0/localIdx=0 hit); this function reverses both that offset
 * and the (sourceCode << 27) | localIdx layout, then dispatches on
 * the 5-bit source code:
 *
 *   - 0..4  → galaxy hit (Synthetic, SDSS, TwoMRS, Glade, Famous)
 *   - 5     → cluster POI
 *   - 6     → supercluster POI
 *   - 7     → void POI
 *   - 8     → Milliquas galaxy hit (point-source AGN)
 *   - 15    → group POI (nearby-galaxy-group anchors)
 *   - 9..14, 16..30 → unallocated; log a defensive warning and return null
 *   - 31    → reserved (all-ones sentinel); return null
 *
 * The 9..30 branch should never fire at runtime (we don't render any
 * pickable surface with those codes), but a stray frame from an old
 * shader or a misconfigured renderer would otherwise propagate a
 * "ghost" pick result into the focus subsystem. Logging + null keeps
 * the caller's switch exhaustive without crashing.
 */
export function unpackPick(rawPickValue: number): PickResult | null {
  if (rawPickValue === 0) return null;
  const sourceCode = rawPickValue >>> SELECTION_SOURCE_SHIFT;
  // Reserved sentinel band — never a real hit.
  if (sourceCode === 31) return null;
  const localIdx = (rawPickValue & SELECTION_LOCAL_IDX_MASK) - PICK_SENTINEL_OFFSET;
  if (sourceCode <= 4 || sourceCode === Source.Milliquas) {
    // Survey-galaxy hit. The contiguous 0..4 band carries the original
    // surveys (Synthetic, SDSS, TwoMRS, Glade, Famous); code 8 was
    // appended for Milliquas after the POI codes (5/6/7) were already
    // allocated, so the test is "low band OR exact match".
    return { kind: 'galaxy', source: sourceCode as SourceType, localIdx };
  }
  if (sourceCode === 5) return { kind: 'cluster', poiIndex: localIdx };
  if (sourceCode === 6) return { kind: 'supercluster', poiIndex: localIdx };
  if (sourceCode === 7) return { kind: 'void', poiIndex: localIdx };
  if (sourceCode === Source.Group) return { kind: 'group', poiIndex: localIdx };
  console.warn(
    `unpackPick: unexpected source code ${sourceCode} ` +
      `(raw=0x${rawPickValue.toString(16).padStart(8, '0')}); returning null`,
  );
  return null;
}

/**
 * @deprecated Use `unpackPick` directly; this shim exists for the
 * brief window between the foundations sub-plan (which lands the
 * discriminated-union return) and the pick-dispatch sub-plan (which
 * rewrites consumers to switch on `kind`). Remove when the last
 * caller is migrated.
 */
export function unpackPickGalaxyOnly(
  rawPickValue: number,
): { source: number; localIdx: number } | null {
  const result = unpackPick(rawPickValue);
  if (result === null) return null;
  if (result.kind !== 'galaxy') return null;
  return { source: result.source, localIdx: result.localIdx };
}
