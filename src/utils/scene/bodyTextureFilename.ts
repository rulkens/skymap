import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import type { TextureKind } from '../../@types/data/TextureKind';
import type { Tier } from '../../@types/data/Tier';
import { tierToTexturePx } from '../math/tierToTexturePx';

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
 * `${bodyId}-${px}.{jpg|png}`. Only non-surface kinds
 * (`night`/`clouds`/`material`/`normal`) carry a `-${kind}-` segment. Omitting
 * the segment for `surface` is what keeps this a zero-data-op refactor: the build
 * re-emits byte-identical surface files, so no rebuild / R2 re-sync / CDN purge
 * is needed. The `-${kind}-` maps land with their own feature PRs.
 *
 * ### PNG for the ring, JPG for every sphere
 *
 * The Saturn ring strip carries a real alpha channel (transparent centre + soft
 * radial gaps) a JPG cannot hold, so `saturn-ring` names a `.png`; every opaque
 * spherical body names a `.jpg`. `bodyId === 'saturn-ring'` is the whole branch —
 * only the ring is non-opaque.
 */
export function bodyTextureFilename(
  bodyId: BodyTextureId | RingTextureId,
  kind: TextureKind,
  tier: Tier,
): string {
  const seg = kind === 'surface' ? '' : `-${kind}`;
  const px = tierToTexturePx(tier);
  const ext = bodyId === 'saturn-ring' ? 'png' : 'jpg';
  return `${bodyId}${seg}-${px}.${ext}`;
}
