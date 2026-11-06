import sharp from 'sharp';

/** Per-file cache: a GeoTIFF's page layout is fixed for the process's life,
 *  and a wide-box read (`geoTiffImagerySource.readBox`) calls this on every
 *  pan/zoom — re-probing each page over and over would add I/O per frame. */
const cache = new Map<
  string,
  Promise<ReadonlyArray<{ readonly width: number; readonly height: number }>>
>();

/**
 * geoTiffOverviewLevels — a COG's embedded pyramid, finest (page 0, the
 * native raster) to coarsest, by width/height. GDAL's COG driver (and
 * `sharp`'s own `pyramid: true` writer) stores each reduced-resolution
 * overview as its own IFD chained after the main one — the same on-disk
 * shape libvips already reads as TIFF "pages" (`metadata().pages`), so no
 * separate overview API is needed. A file built with no overviews reports
 * exactly one page, and the caller falls back to native.
 */
export async function geoTiffOverviewLevels(
  path: string,
): Promise<ReadonlyArray<{ readonly width: number; readonly height: number }>> {
  const cached = cache.get(path);
  if (cached !== undefined) return cached;

  const promise = (async () => {
    const base = await sharp(path, { limitInputPixels: false, unlimited: true }).metadata();
    const pageCount = base.pages ?? 1;
    const levels: Array<{ width: number; height: number }> = [];
    for (let page = 0; page < pageCount; page++) {
      const meta =
        page === 0
          ? base
          : await sharp(path, { limitInputPixels: false, unlimited: true, page }).metadata();
      if (meta.width === undefined || meta.height === undefined) {
        throw new Error(`geoTiffOverviewLevels: ${path} page ${page} reported no width/height`);
      }
      levels.push({ width: meta.width, height: meta.height });
    }
    return levels;
  })();
  cache.set(path, promise);
  return promise;
}
