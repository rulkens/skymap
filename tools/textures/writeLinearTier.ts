import sharp from 'sharp';

/**
 * writeLinearTier — the build's first LINEAR-data output primitive (spec §9.3):
 * resize a prepared linear RGBA buffer to a tier width and write it as PNG with
 * NO sRGB gamma re-encoding.
 *
 * ### Why this is separate from the sRGB `writeBodyTier` path
 *
 * The albedo/colour writers (`writeBodyTier`, `writeTintedMonoTier`) emit JPEG
 * and let the runtime sample through an sRGB texture format — correct for a
 * gamma-encoded picture. A linear-packed map is the opposite kind of thing: its
 * channels are numeric FIELDS (roughness, an ocean mask, a normal vector), not
 * colour. Two properties therefore matter and both are the absence of a
 * transform:
 *
 *  - **No gamma / colourspace conversion.** sharp does not apply an sRGB gamma to
 *    a raw buffer unless asked (no `.toColourspace('srgb')`, no `.gamma()` here),
 *    so the byte values pass through untouched. Applying one would bend the
 *    packed numbers along their curve — a roughness of 0.5 would no longer read
 *    back as 0.5.
 *  - **PNG, not JPEG.** JPEG's lossy DCT + chroma subsampling would smear the
 *    packed channels across pixel boundaries (worst along coastlines in the
 *    ocean mask); PNG is lossless and per-pixel exact.
 *
 * The resize is width-only (the maps are 2:1 equirect, so height follows). It is
 * a downsample of a wider prepared buffer, or an identity op when the buffer is
 * already at the tier width (the material path resizes its source first) — either
 * way no upscaling and no gamma.
 */
export async function writeLinearTier(
  rgba: { data: Buffer; info: { width: number; height: number; channels: number } },
  widthPx: number,
  outPath: string,
): Promise<void> {
  await sharp(rgba.data, {
    // sharp types `channels` as its `1 | 2 | 3 | 4` union; the signature keeps
    // the caller's `info` plainly typed, so narrow it at the boundary.
    raw: {
      width: rgba.info.width,
      height: rgba.info.height,
      channels: rgba.info.channels as 1 | 2 | 3 | 4,
    },
    limitInputPixels: false,
  })
    .resize({ width: widthPx })
    .png()
    .toFile(outPath);
}
