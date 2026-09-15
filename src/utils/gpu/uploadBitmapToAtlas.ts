import type { TextureAtlas } from '../../services/gpu/resources/textureAtlas';

/** `TileStreamDeps<ImageBitmap>.upload` for a bitmap-payload atlas (galaxy
 *  thumbnails, surface-tile albedo). Closes the bitmap once the copy is
 *  enqueued — `copyExternalImageToTexture` reads its pixels synchronously,
 *  so the source has nothing left to give after this call returns. */
export function uploadBitmapToAtlas(
  atlas: TextureAtlas,
  slotIdx: number,
  bitmap: ImageBitmap,
): void {
  atlas.uploadBitmap(slotIdx, bitmap);
  bitmap.close();
}
