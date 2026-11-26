import sharp from 'sharp';

// Lossy WebP stores grey as luma with neutral chroma; libwebp's integer YUV→RGB can still land
// G one step off R and B, so a grey map decodes within a level or two, not exactly.
const GREY_TOLERANCE = 2;

/** Throws unless `path` decodes as a `tierPx × tierPx/2` grey image: the last gate before a tier is published. */
export async function checkCloudTier(path: string, tierPx: number): Promise<void> {
  const { data, info } = await sharp(path, { limitInputPixels: false })
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== tierPx || info.height !== tierPx / 2) {
    throw new Error(
      `checkCloudTier: ${path} is ${info.width}×${info.height}, want ${tierPx}×${tierPx / 2}`,
    );
  }
  if (info.channels < 3) return;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    if (
      Math.abs(data[i + 1]! - r) > GREY_TOLERANCE ||
      Math.abs(data[i + 2]! - r) > GREY_TOLERANCE
    ) {
      throw new Error(`checkCloudTier: ${path} is not grey (pixel ${i / info.channels})`);
    }
  }
}
