/**
 * RenderTargetSpec — the second of the three axes a content layer is
 * positioned on: which texture it draws into (an offscreen, or the swap
 * chain itself).
 *
 * A target is independent of slab and blend: the cosmological slab hosts
 * layers that go to `hdr` (additive accumulation) and also layers that go
 * to `swap` (OVER overlays), and both groups share the same slab. Naming
 * the target by a plain string `id` — rather than a typed enum — keeps the
 * registry data-driven: a new offscreen (a third pick target, say) is a new
 * row in the concrete target table plus a new `target` string on the
 * layers that use it, not a new literal added everywhere the union is
 * matched.
 *
 * See the renderer unification design's "RenderTarget" section for the
 * concrete target table (`hdr`, `volume`, `foreground:0`, `swap`,
 * `pick:cosmo`, `pick:near0`) this spec instantiates.
 */

import type { EngineState } from '../state/EngineState';

export type RenderTargetSpec = {
  /** e.g. 'hdr' | 'volume' | 'foreground:0' | 'swap' | 'pick:cosmo' | 'pick:near0'. */
  id: string;
  /** rgba16float offscreen / swap format / r32uint for pick. */
  format: GPUTextureFormat;
  /** 'depth32float' for opaque slabs, 'depth24plus' for pick, null for additive/over targets. */
  depth: GPUTextureFormat | null;
  /**
   * Downsample divisor: 1 = full resolution; 3 = volume's. A FUNCTION for a row
   * whose divisor is a live setting (`mw-aggregate`) — `reconcile` resolves it
   * every frame and reallocates only when the resulting pixel size moved, so a
   * knob-driven row needs no rebuild path of its own.
   */
  scale: number | ((state: EngineState) => number);
  /**
   * First-touch colour clear, read by `executeFrame`/`runBloom`: the first
   * pass opened against this target in a frame clears to this colour; later
   * passes load. This field is what rung 2 (target-contributions)
   * deliberately unlocks from the "locked cross-plan contract" this type used
   * to be — see `renderTargets.ts`'s `buildSpecs` rows for the per-target
   * rationale, so a future reader doesn't re-lock it.
   *
   * The paired DEPTH clear is NOT here — it is the far-plane depth (`0.0`
   * under the NEAR0 `foreground:0` row's reversed-Z convention), supplied by
   * `depthClearValueFor` when `executeFrame`'s `depthAttachment` opens the
   * pass, not fixed table data.
   */
  clearValue: GPUColor;
};
