import type { SurfaceTileId } from '../../format/@types/SurfaceTileId';
import { HORIZON_TILE_PX } from '../../format/data/surfaceTileParams';
import type { SurfaceTileSource } from '../@types/SurfaceTileSource';

/**
 * fetchHorizonTile — one packed horizon tile decoded for atlas upload, `'empty'` for a flat
 * tile (zero-length entry), `null` if missing or undecodable. The texels are angle bytes, not
 * colour, so `colorSpaceConversion` and `premultiplyAlpha` are both off: premultiplying would
 * zero the RGB of every post whose channel A (sectors 3, 7, 11, 15) is lit.
 */
export async function fetchHorizonTile(
  tile: SurfaceTileId,
  source: SurfaceTileSource,
): Promise<ImageBitmap | 'empty' | null> {
  try {
    const read = await source.readTile(tile);
    if (read.kind === 'empty') return 'empty';
    if (read.kind !== 'bytes') return null;
    const bitmap = await createImageBitmap(new Blob([read.bytes], { type: 'image/webp' }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    // The atlas copies exactly one slot, so a wrong-sized image would read as cropped posts.
    if (bitmap.width !== HORIZON_TILE_PX || bitmap.height !== HORIZON_TILE_PX) {
      bitmap.close();
      return null;
    }
    return bitmap;
  } catch {
    return null;
  }
}
