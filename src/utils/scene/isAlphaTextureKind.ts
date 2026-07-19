import type { TextureKind } from '../../@types/data/TextureKind';

/**
 * isAlphaTextureKind — the single home for the "does this kind carry an ALPHA
 * channel (transparency), so it must ship as PNG rather than JPEG?" axis of a
 * texture kind.
 *
 * ### Orthogonal to `isLinearTextureKind`
 *
 * Two independent properties force PNG over JPEG, and conflating them would be a
 * knot:
 *
 *  - **linear-packed data** (`isLinearTextureKind` — `material`, `normal`): the
 *    channels are numeric FIELDS, not colour, so JPEG's gamma + chroma
 *    subsampling would corrupt them. That is the DATA-PRECISION axis.
 *  - **an alpha channel** (this predicate — `clouds`): the map is still sRGB
 *    COLOUR (it samples through an `*-srgb` format like the day albedo), but it
 *    carries a transparency channel a JPEG cannot hold. That is the
 *    CHANNEL-COUNT axis.
 *
 * Clouds are sRGB colour AND carry alpha, so they are `false` for
 * `isLinearTextureKind` but `true` here — do NOT fold clouds into the linear
 * predicate, which would wrongly route them through the gamma-stripped
 * linear-unorm sample path. `bodyTextureFilename` ORs both predicates (plus the
 * ring) into its PNG condition. A future alpha-bearing sRGB kind adds here.
 */
export function isAlphaTextureKind(kind: TextureKind): boolean {
  return kind === 'clouds';
}
