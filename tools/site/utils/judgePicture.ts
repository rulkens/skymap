import type { SiteShot } from '../../../packages/website/src/@types/SiteShot';
import type { PictureJudgement } from '../@types/PictureJudgement';
import type { PictureMeasure } from '../@types/PictureMeasure';
import { pictureFit } from './pictureFit';
import { shotOfSrc } from './shotOfSrc';

// A source within 5% of the width it is drawn at shows no softness; below that the eye starts to see it.
const UPSCALE_SLACK = 0.95;
// `cover` cutting away more than this loses part of what the shot was framed to show.
const CROP_LIMIT = 0.3;
const STRETCH_SLACK = 0.02;
const TRANSPARENT = /^(ui|cut)-/;

const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * One picture's report: what was chosen against what the box needs, what `cover` cuts away, and
 * the problems as flags. `row` is the picture's manifest row, `null` for a video (which has no
 * srcset, so its source is its decoded width).
 */
export function judgePicture(
  m: PictureMeasure,
  section: string,
  dpr: number,
  row: Pick<SiteShot, 'id' | 'link' | 'widths'> | null,
): PictureJudgement {
  const file = m.src
    ? decodeURIComponent(new URL(m.src, 'http://localhost').pathname).split('/').pop()!
    : '';
  const loaded = m.naturalWidth > 0 && m.naturalHeight > 0;
  const fit = loaded
    ? pictureFit(m.box.width, m.box.height, m.naturalWidth, m.naturalHeight, m.objectFit, dpr)
    : null;
  const sourceWidth = row ? (shotOfSrc(m.src)?.width ?? null) : loaded ? m.naturalWidth : null;
  const widestFile = row ? Math.max(...row.widths) : null;
  const flags: string[] = [];
  if (!loaded) flags.push('NOT LOADED: the browser has decoded nothing for it');
  if (fit && sourceWidth !== null && sourceWidth < fit.neededWidth * UPSCALE_SLACK) {
    const need = Math.round(fit.neededWidth);
    const cause =
      widestFile !== null && widestFile >= fit.neededWidth * UPSCALE_SLACK
        ? `a ${widestFile} px file exists, so the \`sizes\` attribute undersells the box`
        : `the widest file is ${widestFile ?? sourceWidth} px: reshoot with a wider width or a larger size`;
    flags.push(
      `UPSCALED x${(sourceWidth / fit.neededWidth).toFixed(2)}: ${sourceWidth} px drawn over ${need} device px; ${cause}`,
    );
  }
  if (fit && fit.croppedShare > CROP_LIMIT)
    flags.push(
      `CROPPED: \`object-fit: cover\` cuts away ${percent(fit.croppedShare)} of the frame`,
    );
  if (fit && Math.abs(fit.stretch - 1) > STRETCH_SLACK)
    flags.push(`STRETCHED: drawn at ${fit.stretch.toFixed(2)} times its own aspect`);
  if (m.kind === 'img' && m.alt === null) flags.push('NO ALT: the alt attribute is missing');
  return {
    index: m.index,
    kind: m.kind,
    shotId: row?.id ?? null,
    file,
    link: row?.link ?? null,
    section,
    box: { width: Math.round(m.box.width), height: Math.round(m.box.height) },
    sourceWidth,
    neededWidth: fit ? Math.round(fit.neededWidth) : null,
    widestFile,
    croppedShare: fit ? Math.round(fit.croppedShare * 100) / 100 : null,
    transparent: row !== null && TRANSPARENT.test(row.id),
    hiddenNow: false,
    alt: m.alt,
    luma: null,
    flags,
  };
}
