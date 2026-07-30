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
 *  - **linear-packed data** (`material` and `normal`) — the channels carry
 *    numeric fields (roughness, an ocean mask, a tangent-space normal vector),
 *    NOT a colour. A gamma curve would corrupt those numbers, so they must ship
 *    losslessly (WebP lossless — no chroma subsampling, bit-exact bytes) and
 *    sample through a linear (`unorm`) format with no hardware de-gamma.
 *
 * Four read-sites use this one predicate so the sRGB-vs-linear decision can
 * never drift between them: `bodyTextureFilename` (WebP vs JPEG extension),
 * `bodyTextureFetcher` (which decode path), and earthRenderer (both `setMap` and
 * its placeholder factory, for which GPU texture format to allocate).
 * Hand-listing the linear kinds here — rather than a flag on each
 * `TextureKind` — keeps the vocabulary type (`TextureKind`) a plain string
 * union and puts the axis where the four read-sites already look.
 */
export function isLinearTextureKind(kind: TextureKind): boolean {
  return kind === 'material' || kind === 'normal';
}
