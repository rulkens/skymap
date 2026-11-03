import type { PictureFit } from '../@types/PictureFit';

/**
 * How an image of `naturalWidth` x `naturalHeight` (only its aspect counts: a srcset image reports
 * a density-corrected size) fills a `boxWidth` x `boxHeight` CSS box under `objectFit`, on a screen
 * of `dpr` device pixels per CSS pixel. `scale-down` is taken as `contain` and `none` as `fill`.
 */
export function pictureFit(
  boxWidth: number,
  boxHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  objectFit: string,
  dpr: number,
): PictureFit {
  const aspect = naturalWidth / naturalHeight;
  const drawnWidth =
    objectFit === 'cover'
      ? Math.max(boxWidth, boxHeight * aspect)
      : objectFit === 'contain' || objectFit === 'scale-down'
        ? Math.min(boxWidth, boxHeight * aspect)
        : boxWidth;
  const croppedShare =
    objectFit === 'cover' ? 1 - (boxWidth * boxHeight) / (drawnWidth * (drawnWidth / aspect)) : 0;
  const filled = !['cover', 'contain', 'scale-down'].includes(objectFit);
  return {
    drawnWidth,
    neededWidth: drawnWidth * dpr,
    croppedShare,
    stretch: filled ? boxWidth / boxHeight / aspect : 1,
  };
}
