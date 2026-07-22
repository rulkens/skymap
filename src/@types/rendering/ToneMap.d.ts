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
   * this contract synchronized with the curve dispatch in
   * `src/services/gpu/shaders/compositor/fragment.wesl` and the curve math
   * in `src/services/gpu/shaders/lib/tonemap.wesl`.
   */
  readonly curve: ToneMapCurve;

  /**
   * HDR-output spike: the knee above which over-white energy spills back on
   * top of the tone-mapped result, in the SAME scaled (post-exposure) units
   * the curve operates on. 0 disables the spill outright — every value the
   * curve compressed into [0,1] stays there, bit-identical to the pre-spike
   * output. Only meaningful when `hdrHeadroom` is non-zero and the compositor
   * is drawing into an HDR (`rgba16float`, `toneMapping: 'extended'`) swap
   * chain; on an SDR swap chain the spilled energy would just get clamped
   * straight back to 1.0 by the display, so callers set both fields to 0.
   */
  readonly hdrKneeStart: number;

  /**
   * HDR-output spike: multiplier on the over-white energy above
   * `hdrKneeStart`. 0 = SDR — no headroom spill, the curve's compressed
   * [0,1] result is the final output. Above 0, the brightest sources (sun,
   * bloom, saturated star cores) punch above 1.0 into the extended-range
   * swap chain instead of flattening to paper-white, so a real HDR display
   * shows them with visibly more presence than the SDR tone curve alone
   * allows. This has no visible effect unless the swap chain is actually an
   * HDR surface — see `GpuContext.hdr`.
   */
  readonly hdrHeadroom: number;
};
