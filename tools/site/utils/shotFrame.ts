import sharp, { type Sharp } from 'sharp';

import type { SiteShotSettings } from '../../../packages/website/src/@types/SiteShotSettings';

/** A shot's master PNG cut to the row's `crop`, given in CSS pixels of a frame taken at `dpr`. */
export function shotFrame(
  master: string | Buffer,
  crop: SiteShotSettings['crop'],
  dpr: number,
): Sharp {
  return crop
    ? sharp(master).extract({
        left: crop.left * dpr,
        top: crop.top * dpr,
        width: crop.width * dpr,
        height: crop.height * dpr,
      })
    : sharp(master);
}
