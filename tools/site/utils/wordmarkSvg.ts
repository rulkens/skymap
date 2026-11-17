import { parse } from 'opentype.js';

import type { WordmarkInk } from '../@types/WordmarkInk';
import {
  TRAIL,
  VIEW_BOX,
} from '../../../packages/website/src/components/shared/text/Wordmark/Wordmark.constants';

const OFFSETS = [0, 0.55, 1];

/**
 * The site's Wordmark as a file of its own: the word as outlines, so it draws the same with no font installed,
 * and the trail's fade as SVG 1.1 colour and opacity, which design tools read where they do not read CSS
 * `rgb(r g b / a)`. Its box is the component's, at one unit per pixel.
 */
export function wordmarkSvg(font: Buffer, ink: WordmarkInk): string {
  const face = parse(
    font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer,
  );
  const word = face.getPath('skymap', 0, 0, 100).toPathData(2);
  const stops = ink.fade.map((colour, i) => {
    const [r, g, b, a] = colour.match(/[\d.]+/g)!;
    return `<stop offset="${OFFSETS[i]}" stop-color="rgb(${r},${g},${b})" stop-opacity="${a ?? 1}"/>`;
  });
  const { from, bend, to } = TRAIL;
  const [, , width, height] = VIEW_BOX;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX.join(' ')}" width="${width}" height="${height}">`,
    `<title>Skymap</title>`,
    `<defs><linearGradient id="trail" gradientUnits="userSpaceOnUse" x1="${from[0]}" x2="${to[0]}" y1="0" y2="0">${stops.join('')}</linearGradient></defs>`,
    `<path d="M ${from.join(' ')} Q ${bend.join(' ')} ${to.join(' ')}" fill="none" stroke="url(#trail)" stroke-width="2.5" stroke-linecap="round"/>`,
    `<path d="${word}" fill="${ink.word}"/>`,
    '</svg>',
    '',
  ].join('\n');
}
