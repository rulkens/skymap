import type { TextureKind } from '../../@types/data/TextureKind';

/**
 * isLinearTextureKind — the single home for the "is this map linear-packed DATA,
 * not sRGB COLOUR?" axis of a texture kind.
 *
 * A body-texture map is one of two fundamentally different things:
 *
 *  - **sRGB colour** (`surface`, `night`, `clouds`) — pixels are a gamma-encoded
 *    picture. They ship as JPEG, and the GPU samples them through an
 *    `*-srgb` format so the hardware linearises on read.
 *  - **linear-packed data** (`material` today; `normal` when plan C lands) — the
 *    channels carry numeric fields (roughness, an ocean mask, a normal vector),
 *    NOT a colour. A gamma curve would corrupt those numbers, so they must ship
 *    as PNG (lossless, no chroma subsampling) and sample through a linear
 *    (`unorm`) format with no hardware de-gamma.
 *
 * Three consumers read this one predicate so the sRGB-vs-linear decision can
 * never drift between them: `bodyTextureFilename` (PNG vs JPEG extension),
 * `bodyTextureFetcher` (which decode path), and `earthRenderer.setMap` (which GPU
 * texture format). Hand-listing the linear kinds here — rather than a flag on
 * each `TextureKind` — keeps the vocabulary type (`TextureKind`) a plain string
 * union and puts the axis where the three consumers already look.
 */
export function isLinearTextureKind(kind: TextureKind): boolean {
  return kind === 'material';
}
