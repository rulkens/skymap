import sharp from 'sharp';

/**
 * writeCloudTier — the build's sRGB-colour-PLUS-alpha output primitive for the
 * cloud shell (spec §9.1): resize a source to a tier width, DERIVE an alpha
 * channel from luminance when the source has none, and write PNG keeping the RGB
 * as sRGB colour.
 *
 * ### Alpha from luminance — the whole point
 *
 * The NASA Blue Marble cloud composite is a white-cloud-on-black equirect with
 * NO alpha channel: opacity is encoded implicitly as brightness. A bright pixel
 * is thick cloud; pure black is clear sky. So we read the resized pixels raw and
 * synthesise alpha = the Rec.709 luminance of the RGB — white cloud → opaque,
 * black sky → fully transparent — while keeping the RGB itself as the cloud's
 * (near-white) colour. A source that already carries a real alpha channel keeps
 * it untouched; only a 3-channel (or mono) source gets the luminance derivation.
 *
 * ### sRGB colour, NOT the linear path
 *
 * Contrast `writeLinearTier` (`material` / `normal`): those maps pack numeric
 * fields and must NOT be gamma-touched. The cloud RGB is the opposite — it IS
 * gamma-encoded sRGB colour, sampled at runtime through an `*-srgb` format like
 * the day albedo. sharp writes a raw buffer's bytes through to PNG without
 * applying any gamma, so the source's sRGB bytes pass through byte-for-byte
 * (correct here) — the distinction from `writeLinearTier` is semantic (what the
 * bytes mean, and how the runtime samples them), not a different sharp call.
 * PNG (lossless) is mandatory because JPEG cannot carry the alpha channel.
 *
 * The resize is width-only (the composite is 2:1 equirect, so height follows) and
 * a downsample — we never upscale (spec §3).
 */
export async function writeCloudTier(
  srcPath: string,
  widthPx: number,
  outPath: string,
): Promise<void> {
  const src = await sharp(srcPath, { limitInputPixels: false })
    .resize({ width: widthPx })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = src.info;
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const base = i * channels;
    const r = src.data[base] ?? 0;
    const g = channels >= 2 ? (src.data[base + 1] ?? r) : r;
    const b = channels >= 3 ? (src.data[base + 2] ?? r) : r;
    rgba[i * 4 + 0] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    // Keep an existing alpha; otherwise derive it from Rec.709 luminance so
    // bright cloud is opaque and black sky is clear.
    rgba[i * 4 + 3] =
      channels >= 4
        ? (src.data[base + 3] ?? 255)
        : Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  }

  await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outPath);
}
