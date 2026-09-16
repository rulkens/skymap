import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import type { TextureKind } from '../../@types/data/TextureKind';
import type { Tier } from '../../@types/data/Tier';
import { tierToTexturePx } from '../math/tierToTexturePx';
import { isAlphaTextureKind } from './isAlphaTextureKind';
import { isLinearTextureKind } from './isLinearTextureKind';

/**
 * bodyTextureFilename — the single home for a body-texture map's on-disk name,
 * called by BOTH the runtime fetcher (`bodyTextureFetcher`) and the build tool
 * (`buildTextures`). Because the two sides construct the name through one helper,
 * the load-bearing coupling "runtime URL ⇔ built file" can no longer drift — a
 * mismatch would 404 every body and render the blue placeholder.
 *
 * ### `surface` is the default kind — unsegmented
 *
 * The `surface` (day/albedo) map keeps the exact name every body ships today:
 * `${bodyId}-${px}.{jpg|webp}`. Only non-surface kinds
 * (`night`/`clouds`/`material`/`normal`) carry a `-${kind}-` segment. Omitting
 * the segment for `surface` is what keeps this a zero-data-op refactor: the build
 * re-emits byte-identical surface files, so no rebuild / R2 re-sync / CDN purge
 * is needed. The `-${kind}-` maps land with their own feature PRs.
 *
 * ### Lossless WebP for the ring, a linear-data map, OR an alpha map; JPG for opaque sRGB
 *
 * Three things force a non-JPG encoding. The Saturn ring strip carries a real
 * alpha channel (transparent centre + soft radial gaps) a JPG cannot hold. A
 * linear kind (`material`, `normal`) packs numeric fields — roughness, an ocean
 * mask, a normal vector — into its channels; a lossy codec's chroma subsampling
 * and sRGB assumption would corrupt those numbers along coastlines. An alpha kind
 * (`clouds`) is still sRGB COLOUR but carries a transparency channel a JPG cannot
 * hold. All three ship as LOSSLESS WebP — bit-exact for the numeric maps, exact
 * alpha for the ring and clouds, and ~40% smaller than the PNG it replaces (the
 * build emits `.webp({ lossless: true })` for these). The three cases route
 * through the ring id, `isLinearTextureKind` (the sRGB-vs-linear precision axis),
 * and `isAlphaTextureKind` (the channel-count axis) respectively; every opaque
 * sRGB-colour sphere still names a `.jpg`.
 */
export function bodyTextureFilename(
  bodyId: BodyTextureId | RingTextureId,
  kind: TextureKind,
  tier: Tier,
): string {
  const seg = kind === 'surface' ? '' : `-${kind}`;
  const px = tierToTexturePx(tier);
  const ext =
    bodyId === 'saturn-ring' || isLinearTextureKind(kind) || isAlphaTextureKind(kind)
      ? 'webp'
      : 'jpg';
  return `${bodyId}${seg}-${px}.${ext}`;
}
