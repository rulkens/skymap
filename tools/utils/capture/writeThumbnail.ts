import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { OUTPUT_PX, WEBP_QUALITY } from './shotDefaults';

/** Downscales a screenshot to the card size and writes it as webp; returns its bytes. */
export async function writeThumbnail(png: Buffer, outPath: string): Promise<number> {
  const webp = await sharp(png)
    .resize(OUTPUT_PX, OUTPUT_PX)
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  writeFileSync(outPath, webp);
  return webp.length;
}
