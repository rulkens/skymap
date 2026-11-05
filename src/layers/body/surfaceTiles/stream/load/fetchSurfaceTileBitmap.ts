import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';

/**
 * fetchSurfaceTileBitmap — one virtual-texture tile, decoded ready for atlas
 * upload, or `null` if it is not there.
 *
 * A miss (no bytes, or an undecodable payload) returns `null` and logs
 * nothing; the stream subsystem memoises it as failed.
 *
 * No `resizeWidth`/`resizeHeight`: the tile is already the atlas slot edge
 * (both come from the manifest's `tilePx`).
 *
 * `premultiplyAlpha: 'none'` because alpha is the land mask, not coverage: the
 * fragment multiplies it into the blend weight itself, so premultiplied RGB
 * would darken coastal pixels toward black first.
 */
export async function fetchSurfaceTileBitmap(
  tile: SurfaceTileId,
  source: SurfaceTileSource,
): Promise<ImageBitmap | null> {
  try {
    const bytes = await source.readTile(tile);
    if (bytes === null) return null;
    return await createImageBitmap(new Blob([bytes], { type: 'image/webp' }), {
      premultiplyAlpha: 'none',
    });
  } catch {
    return null;
  }
}
