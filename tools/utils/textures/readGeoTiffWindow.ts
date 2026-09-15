import sharp from 'sharp';

/** sharp's `metadata().depth` names that carry real elevation numbers, mapped
 *  to the `raw({ depth })` request and the view that reads the bytes back. */
const DEPTHS = {
  float: { raw: 'float' as const, view: Float32Array },
  short: { raw: 'short' as const, view: Int16Array },
  ushort: { raw: 'ushort' as const, view: Uint16Array },
  int: { raw: 'int' as const, view: Int32Array },
};

/**
 * readGeoTiffWindow — one pixel window of a DEM GeoTIFF as f32, at its
 * native numeric depth. `toColourspace('b-w')` is load-bearing: sharp's
 * default sRGB output silently triples a single-band DEM into three
 * interleaved copies. An 8-bit depth THROWS rather than rescaling — a
 * byte-depth DEM is a wrong/pre-stretched file, and rescaling would fabricate metres.
 */
export async function readGeoTiffWindow(
  path: string,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<Float32Array> {
  const image = sharp(path, { limitInputPixels: false, unlimited: true });
  const depth = (await image.metadata()).depth;
  const spec = depth === undefined ? undefined : DEPTHS[depth as keyof typeof DEPTHS];
  if (spec === undefined) {
    throw new Error(
      `readGeoTiffWindow: ${path} has depth '${depth}', not a DEM numeric depth — never rescale`,
    );
  }

  const { data, info } = await image
    .toColourspace('b-w')
    .extract({ left, top, width, height })
    .raw({ depth: spec.raw })
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 1) {
    throw new Error(`readGeoTiffWindow: ${path} yielded ${info.channels} channels, expected 1`);
  }
  // A window under 8 kB comes back on Node's shared Buffer pool at an
  // arbitrary offset, which a typed-array view refuses unless it divides the
  // element size — so a misaligned small read is copied out first.
  const bytes = spec.view.BYTES_PER_ELEMENT;
  const samples =
    data.byteOffset % bytes === 0
      ? new spec.view(data.buffer, data.byteOffset, width * height)
      : new spec.view(data.buffer.slice(data.byteOffset, data.byteOffset + width * height * bytes));
  return samples instanceof Float32Array ? samples : Float32Array.from(samples);
}
