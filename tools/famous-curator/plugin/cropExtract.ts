/**
 * cropExtract — shared helper for rotated / out-of-image crops.
 *
 * Wraps `sharp().extract(...)` with two relaxations the UI exposes:
 *
 *   1. Rotation: the crop rect has a `rotationDeg` field.  To get pixels
 *      along the rotated rect's local axes, we rotate the source by the
 *      INVERSE of the crop rotation (canvas auto-expands, transparent
 *      background fills the corners) and then extract an axis-aligned
 *      rectangle from the rotated image.
 *
 *   2. Out-of-image crops: the crop's CENTER stays inside the image but
 *      its corners may extend outside.  We `.extend(...)` with transparent
 *      padding before `.extract(...)` whenever the extract rect escapes
 *      the (possibly rotated) image bounds.  Resulting bytes have alpha=0
 *      in those regions.
 *
 * Rotation === 0 is the happy path — no rotation step, only padding if
 * the crop is out of bounds.  For an in-bounds, unrotated crop the
 * result is identical to a bare `sharp().extract({left,top,width,height})`.
 */
import sharp from 'sharp';
import type { Sharp } from 'sharp';

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

export type RotatedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

/**
 * Returns a sharp pipeline at the extracted-but-not-yet-encoded stage.
 * The caller chains `.png()` / `.webp()` / `.resize()` etc.
 */
export async function rotatedExtract(sourcePath: string, crop: RotatedCrop): Promise<Sharp> {
  const width = Math.round(crop.width);
  const height = Math.round(crop.height);

  if (crop.rotationDeg === 0) {
    const meta = await sharp(sourcePath).metadata();
    const left = Math.round(crop.x);
    const top = Math.round(crop.y);
    return await padExtract(sharp(sourcePath), meta.width!, meta.height!, left, top, width, height);
  }

  // Rotate the source by the inverse of the crop rotation.  We negate
  // here because `crop.rotationDeg` is the angle of the crop relative
  // to the source; rotating the source by -that aligns the crop's
  // local axes with the rotated image's axes.
  const rotatedBuf = await sharp(sourcePath)
    .rotate(-crop.rotationDeg, { background: TRANSPARENT })
    .png()
    .toBuffer();
  const rotatedMeta = await sharp(rotatedBuf).metadata();
  const rotW = rotatedMeta.width!;
  const rotH = rotatedMeta.height!;

  // Map the crop center from source coords to rotated-image coords.
  // Sharp's .rotate(α) rotates clockwise by α (y-down screen frame),
  // so source-point P maps to rotated-point:
  //   P_rot = R(-rotationDeg) · (P - sourceCenter) + rotatedCenter
  const srcMeta = await sharp(sourcePath).metadata();
  const srcW = srcMeta.width!;
  const srcH = srcMeta.height!;
  const cxSrc = crop.x + crop.width / 2;
  const cySrc = crop.y + crop.height / 2;
  const dx = cxSrc - srcW / 2;
  const dy = cySrc - srcH / 2;
  // R(-rotationDeg) on (dx, dy):
  //   x' =  dx·cos(rot) + dy·sin(rot)
  //   y' = -dx·sin(rot) + dy·cos(rot)
  const rad = (crop.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cxRot = dx * cos + dy * sin + rotW / 2;
  const cyRot = -dx * sin + dy * cos + rotH / 2;

  const left = Math.round(cxRot - crop.width / 2);
  const top = Math.round(cyRot - crop.height / 2);
  return await padExtract(sharp(rotatedBuf), rotW, rotH, left, top, width, height);
}

/**
 * Extract `(left, top, width, height)` from `s`, padding any out-of-image
 * region with transparent pixels.  Equivalent to `s.extract(...)` when
 * the rect is fully inside `(imgW, imgH)`.
 *
 * Sharp's `.extract()` runs against the INPUT image, ignoring earlier
 * operations in the pipeline.  We can't chain `.extend(...).extract(...)`
 * — the extract would slice the pre-extend image and the padding would
 * be appended afterward.  So when padding is needed we materialise the
 * extended bytes to a buffer first, then start a fresh sharp pipeline
 * for the extract.
 */
async function padExtract(
  s: Sharp,
  imgW: number,
  imgH: number,
  left: number,
  top: number,
  width: number,
  height: number,
): Promise<Sharp> {
  const padLeft = Math.max(0, -left);
  const padTop = Math.max(0, -top);
  const padRight = Math.max(0, left + width - imgW);
  const padBottom = Math.max(0, top + height - imgH);
  if (padLeft + padTop + padRight + padBottom === 0) {
    return s.extract({ left, top, width, height });
  }
  const extended = await s
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();
  return sharp(extended).extract({
    left: left + padLeft,
    top: top + padTop,
    width,
    height,
  });
}
