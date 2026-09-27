import sharp from 'sharp';

/**
 * readGeoTiffRgbWindow — one pixel window of an 8-bit colour or grey GeoTIFF
 * (Viking, the HiRISE orthos), as RGBA; sharp's raw output replicates grey
 * (Jezero) to RGB on its own. `ensureAlpha` only synthesises opacity for this
 * image's own bands — a GDAL internal mask sits in a separate IFD libvips's
 * tiff reader can't open via `page` ("samples_per_pixel not a whole number
 * of bytes", confirmed on the Gale ortho COG), so a masked COG's fringe
 * pixels currently come back opaque, not transparent. `page` selects an
 * overview level (see `geoTiffOverviewLevels`); `left/top/width/height` are
 * already in THAT level's own pixel space, never the native raster's.
 */
export async function readGeoTiffRgbWindow(
  path: string,
  left: number,
  top: number,
  width: number,
  height: number,
  page = 0,
): Promise<Uint8Array> {
  const image = sharp(path, { limitInputPixels: false, unlimited: true, page });
  const depth = (await image.metadata()).depth;
  // An 8-bit depth is the one this reader is for; anything else is a file
  // this function was never meant to see (readGeoTiffWindow reads DEMs).
  if (depth !== 'uchar') {
    throw new Error(`readGeoTiffRgbWindow: ${path} has depth '${depth}', expected 8-bit colour`);
  }

  const { data, info } = await image
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) {
    throw new Error(`readGeoTiffRgbWindow: ${path} yielded ${info.channels} channels, expected 4`);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
