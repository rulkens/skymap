/**
 * ToneMap — tone-mapping parameters for the Compositor's draw call.
 *
 * When `null` at the call site, the source is already LDR and passed through
 * unchanged. When non-null, the shared `lib/tonemap.wesl` shader library applies
 * the curve to compress HDR into display range. In phase 2 (CompositeStep data),
 * this type will be baked into the step sequence itself.
 */

import type { ToneMapCurve } from '../data/ToneMapCurve';

export type ToneMap = {
  /** Exposure (linear multiplier) applied before the tone curve. */
  readonly exposure: number;
  /**
   * Tone-mapping curve selector. Deliberately narrowed from a bare `number`
   * to enforce the existing `ToneMapCurve` literal union (0..4), keeping
   * this contract with `toneMap.wgsl` synchronized.
   */
  readonly curve: ToneMapCurve;
};
