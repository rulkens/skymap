import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

/**
 * One tile of the thumbnail engraving's hatch screen: a triangle wave along a
 * diagonal (1 on the line's centre, 0 between lines), one period per `pitch` px
 * tile, so `feTile` repeats it seamlessly. `anti` runs it along the other
 * diagonal, for the cross-hatch in deep shadow.
 */
export function hatchTileSvg(pitch: number, anti: boolean): string {
  const h = f(pitch / 2);
  const [y1, y2] = anti ? [f(pitch), h] : ['0', h];
  return svgDocument(
    pitch,
    pitch,
    `<linearGradient id="g" gradientUnits="userSpaceOnUse" spreadMethod="repeat" x1="0" y1="${y1}" x2="${h}" y2="${y2}">` +
      `<stop offset="0" stop-color="#000"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#000"/>` +
      `</linearGradient><rect width="${f(pitch)}" height="${f(pitch)}" fill="url(#g)"/>`,
  );
}
