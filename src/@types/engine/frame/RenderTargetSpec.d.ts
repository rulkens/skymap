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

export type RenderTargetSpec = {
  /** e.g. 'hdr' | 'volume' | 'foreground:0' | 'swap' | 'pick:cosmo' | 'pick:near0'. */
  id: string;
  /** rgba16float offscreen / swap format / r32uint for pick. */
  format: GPUTextureFormat;
  /** 'depth32float' for opaque slabs, 'depth24plus' for pick, null for additive/over targets. */
  depth: GPUTextureFormat | null;
  /** 1 = full resolution; 3 = volume's downsample divisor. */
  scale: number;
};
