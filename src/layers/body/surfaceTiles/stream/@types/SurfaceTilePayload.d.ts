import type { ResidentSurfaceTile } from './ResidentSurfaceTile';

/** SurfaceTilePayload — one fetched tile as every lane uploads it: the bitmap the
 *  atlas copies, plus the height-only facts the residency record keeps (null for imagery). */
export type SurfaceTilePayload = {
  readonly bitmap: ImageBitmap;
  readonly subtreeRangeM: ResidentSurfaceTile['subtreeRangeM'];
  readonly gridCodes: ResidentSurfaceTile['gridCodes'];
};
