import { PRESS_PICTURES } from '../../../../data/pressPictures.ts';
import { siteShot } from '../../../../data/siteShot.ts';
import { shotSources } from '../../../../utils/shotSources.ts';

export const press = PRESS_PICTURES.map((row) => {
  const sources = shotSources(row.shot);
  // The manifest lists widths widest first, and the srcset keeps that order; the file keeps the shot's shape.
  const width = siteShot(row.shot).widths[0]!;
  return {
    ...row,
    view: siteShot(row.shot),
    file: sources.full,
    pixels: `${width} × ${Math.round((width * sources.height) / sources.width)}`,
    credit: `${row.credit}.`,
  };
});
