import type { BodyTextureId } from '../../@types/data/BodyTextureId';
import type { RingTextureId } from '../../@types/data/RingTextureId';
import type { TextureKind } from '../../@types/data/TextureKind';
import type { Tier } from '../../@types/data/Tier';
import { tierToTexturePx } from '../math/tierToTexturePx';
import { isGreyTextureKind } from './isGreyTextureKind';
import { isLinearTextureKind } from './isLinearTextureKind';

/**
 * bodyTextureFilename — a body-texture map's on-disk name, shared by the runtime
 * fetcher and `buildTextures` so URL and built file cannot drift (a mismatch
 * 404s the body). `surface` carries no kind segment, keeping every shipped
 * name. WebP where JPG cannot serve: the ring strip's alpha, a linear kind's
 * packed fields, a grey kind's shared format with the daily cloud bake. A grey
 * map's `-grey` segment keeps an open tab on the old RGBA-reading code from
 * fetching a grey file.
 */
export function bodyTextureFilename(
  bodyId: BodyTextureId | RingTextureId,
  kind: TextureKind,
  tier: Tier,
): string {
  const seg = kind === 'surface' ? '' : isGreyTextureKind(kind) ? `-${kind}-grey` : `-${kind}`;
  const px = tierToTexturePx(tier);
  const ext =
    bodyId === 'saturn-ring' || isLinearTextureKind(kind) || isGreyTextureKind(kind)
      ? 'webp'
      : 'jpg';
  return `${bodyId}${seg}-${px}.${ext}`;
}
