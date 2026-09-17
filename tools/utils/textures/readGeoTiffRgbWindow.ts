import sharp from 'sharp';

/**
 * readGeoTiffRgbWindow — one pixel window of an 8-bit colour GeoTIFF (Viking,
 * the HiRISE colour orthos), as RGBA. `ensureAlpha` adds an opaque channel
 * only where the file has none; a real embedded mask band survives it, so a
 * masked COG's transparency reaches the caller rather than being flattened.
 */
export async function readGeoTiffRgbWindow(
  path: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const image = sharp(path, { limitInputPixels: false, unlimited: true });
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
