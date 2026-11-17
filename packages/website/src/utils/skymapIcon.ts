/**
 * The Skymap icon as a standalone SVG file: the Void mark on a navy-to-black tile. The favicon, the
 * apple-touch-icon, the press kit and the desktop app's icons are all drawn from here.
 * Landmine: the drop shadow is its own shape under the tile. An SVG filter on the tile itself runs in
 * linearRGB in Chromium and librsvg and bands the dark navy into teal steps.
 */
import type { IconTile } from '../@types/IconTile';
import type { MarkDrawing } from '../@types/MarkDrawing';
import { MARK_COLOURS, MARK_LINE_OPACITY } from '../data/markColours';
import { squirclePath } from './squirclePath';
import { voidMark } from './voidMark';

export function skymapIcon(tile: IconTile, drawing: MarkDrawing): string {
  const { ground, panel, fg } = MARK_COLOURS;
  const fill = `<radialGradient id="tile" cx="0.5" cy="0" r="1.1"><stop offset="0" stop-color="${panel}"/><stop offset="1" stop-color="${ground}"/></radialGradient>`;
  const svg = (size: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>\n`;
  if (tile !== 'mac') {
    const rect = `<rect width="100" height="100" rx="${tile === 'rounded' ? 22 : 0}"`;
    return svg(
      100,
      `<defs>${fill}<clipPath id="clip">${rect}/></clipPath></defs>` +
        `${rect} fill="url(#tile)"/>` +
        `<g clip-path="url(#clip)">${voidMark(drawing)}</g>`,
    );
  }
  // Apple's grid: the tile is 824 of 1024, inset 100, which leaves room for the shadow.
  const shape = squirclePath(100, 100, 824);
  return svg(
    1024,
    `<defs>${fill}` +
      `<filter id="shadow" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="${ground}" flood-opacity="0.35"/></filter>` +
      `<clipPath id="clip"><path d="${shape}"/></clipPath></defs>` +
      `<path d="${shape}" fill="${ground}" filter="url(#shadow)"/>` +
      `<path d="${shape}" fill="url(#tile)"/>` +
      `<g clip-path="url(#clip)"><g transform="translate(100 100) scale(8.24)">${voidMark(drawing)}</g></g>` +
      // A heavier edge for the small drawing, or the tile loses its edge on a dark Dock at 32 px.
      `<path d="${shape}" fill="none" stroke="${fg}" stroke-opacity="${MARK_LINE_OPACITY}" stroke-width="${drawing === 'small' ? 14 : 3}"/>`,
  );
}
