import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';

/**
 * fetchSurfaceTileBitmap — one virtual-texture tile, decoded ready for atlas
 * upload, `'empty'` if stored empty, or `null` if it is not there.
 *
 * A miss (no bytes, or an undecodable payload) returns `null` and logs
 * nothing; the stream subsystem memoises it as failed.
 *
 * No `resizeWidth`/`resizeHeight`: the tile is already the atlas slot edge
 * (`SURFACE_TILE_PX`, which `derivePlannerParams` holds the manifest's `tilePx` to).
 *
 * `premultiplyAlpha: 'none'` because alpha is the land mask, not coverage: the
 * fragment multiplies it into the blend weight itself, so premultiplied RGB
 * would darken coastal pixels toward black first.
 */
export async function fetchSurfaceTileBitmap(
  tile: SurfaceTileId,
  source: SurfaceTileSource,
): Promise<ImageBitmap | 'empty' | null> {
  try {
    const read = await source.readTile(tile);
    if (read.kind === 'empty') return 'empty';
    if (read.kind !== 'bytes') return null;
    return await createImageBitmap(new Blob([read.bytes], { type: 'image/webp' }), {
      premultiplyAlpha: 'none',
    });
  } catch {
    return null;
  }
}
