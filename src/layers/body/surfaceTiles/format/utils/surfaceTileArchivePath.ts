import type { SurfaceTileProduct } from '../@types/SurfaceTileProduct';

/**
 * surfaceTileArchivePath — the single home for an archive file's path, shared
 * by the packer and the runtime source. Omit `part` for the `.idx`.
 */
export function surfaceTileArchivePath(
  prefix: string,
  product: SurfaceTileProduct,
  z: number,
  part?: number,
): string {
  const base = `${prefix}/${product}/z${z}`;
  return part === undefined ? `${base}.idx` : `${base}.p${part}.pack`;
}
