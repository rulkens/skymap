import type { HeightTileHeader } from './HeightTileHeader';

/** HeightTileImage — a fetched height tile as the runtime keeps it: the header
 *  plus the still-encoded Terrain-RGB bitmap, which the shader decodes. */
export type HeightTileImage = HeightTileHeader & { readonly bitmap: ImageBitmap };
