import type { ScaleTrackImage } from '../../@types/ui/antiqueChrome/ScaleTrackImage';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

const UNIT = 16;
const END = 3;
const HEIGHT = 12;
const TOP = 4;
const MID = 7;
const BOTTOM = 10;

/**
 * A scale of miles as on Blaeu's maps: the first unit subdivided into quarters
 * alternating between the bar's two rows, then a two-unit middle (ink above, then
 * ink below) that `round` repeats, then the end rule. Ticks rise above the bar.
 */
export function scaleTrackSvg(ink: string, ground: string): ScaleTrackImage {
  const W = UNIT + 2 * UNIT + END;
  const q = (UNIT - 0.5) / 4;
  let cells = '';
  for (let i = 0; i < 4; i++) cells += `M${f(0.5 + i * q)} ${i % 2 ? MID : TOP}h${f(q)}v3h${f(-q)}Z`;
  cells += `M${UNIT} ${TOP}h${UNIT}v3h${-UNIT}ZM${2 * UNIT} ${MID}h${UNIT}v3h${-UNIT}Z`;
  const g =
    `<rect x=".5" y="${TOP}" width="${W - 1}" height="${BOTTOM - TOP}" fill="${ground}" stroke="${ink}" stroke-width=".8"/>` +
    `<path d="M0 ${MID}H${W}" stroke="${ink}" stroke-width=".4"/>` +
    `<path d="${cells}" fill="${ink}"/>` +
    `<path d="M.5 1V${TOP}M${UNIT} 1V${TOP}M${f(UNIT / 2)} 2.5V${TOP}M${W - 0.5} 1V${TOP}" stroke="${ink}" stroke-width=".7"/>`;
  return { svg: svgDocument(W, HEIGHT, g), start: UNIT, end: END, height: HEIGHT };
}
