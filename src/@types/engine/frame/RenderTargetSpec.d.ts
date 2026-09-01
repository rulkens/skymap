/**
 * RenderTargetSpec — the second of the three axes a content layer is
 * positioned on: which texture it draws into (an offscreen, or the swap
 * chain itself). A target is independent of slab/blend: the cosmological
 * slab hosts layers going to both `hdr` (additive) and `swap` (OVER). `id`
 * is a plain string, not a typed enum, so a new offscreen is a new registry
 * row, not a new literal added everywhere the union is matched. See the
 * renderer unification design's "RenderTarget" section for the concrete
 * target table this spec instantiates.
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
   * passes load. See `renderTargets.ts`'s `renderTargetRows` for the
   * per-target rationale.
   *
   * The paired DEPTH clear is NOT here — it is the far-plane depth (`0.0`
   * under the NEAR0 `foreground:0` row's reversed-Z convention), supplied by
   * `depthClearValueFor` when `executeFrame`'s `depthAttachment` opens the
   * pass, not fixed table data.
   */
  clearValue: GPUColor;
  /**
   * When present, this row's pixel size is `fixedSizePx.size` on each axis
   * regardless of canvas size, and its texture has `fixedSizePx.layers`
   * array layers (a `2d-array` texture, sampled as `texture_cube` by a
   * consumer that binds all six as a cube — WebGPU has no cube-view render
   * attachment). `scale` is ignored when this is present.
   *
   * `size` may be a FUNCTION for a row whose declared size is a live setting
   * (`sky-cubemap`'s DebugPanel knob) — the same
   * `scale`-is-a-function shape `mw-aggregate` uses, resolved by `reconcile`
   * every frame so a knob-driven row needs no rebuild path of its own.
   */
  fixedSizePx?: {
    readonly size: number | ((state: EngineState) => number);
    readonly layers: number;
  };
  /**
   * When present, this row's texture exists only on the frames this returns
   * `true`; `reconcile` releases it (and its views) again the frame it turns
   * `false`. Absent — every other row — means "always allocated", which is
   * the right default for a viewport-sized row a pass may touch on any frame.
   * It is worth declaring for a row whose VRAM is large and whose consumers
   * are gated on one narrow condition (`sky-cubemap`: 50 MB at the shipped
   * resolution, read only within ~500 AU of Sgr A*). A consumer must be
   * gated on the SAME condition — `viewOf`/`sizeOf` throw while the row is
   * released.
   */
  allocateWhen?: (state: EngineState) => boolean;
};
