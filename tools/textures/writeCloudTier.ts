import sharp from 'sharp';

const WEBP_QUALITY = 80;

/**
 * writeCloudTier — the build's cloud-shell output: one grey channel, the same
 * format the daily bake (`tools/cloud-bake-rs`) writes, so either map can fill
 * the clouds slot. The source's grey IS the coverage (white cloud on black sky)
 * and the runtime samples it raw, deriving both opacity and the sRGB colour
 * from the one byte. Lossy at the bake's quality: grey cloud has no packed
 * fields to smear, and lossless costs about three times the bytes.
 */
export async function writeCloudTier(
  srcPath: string,
  widthPx: number,
  outPath: string,
): Promise<void> {
  await sharp(srcPath, { limitInputPixels: false })
    .greyscale()
    .resize({ width: widthPx, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
}
