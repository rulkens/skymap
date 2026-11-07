import type { SliceImage } from '../../@types/ui/antiqueChrome/SliceImage';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

const END = 22;
const BODY_INSET = 8;

/**
 * A title cartouche `height` px tall, 3-slice: a banderole between two rolled
 * scroll ends, double-ruled top and bottom, on an opaque `ground`. Apply with
 * `border-image-slice: 0 <slice> fill` so the ends stay whole and the ruled body
 * stretches to the title's width.
 */
export function cartoucheSvg(height: number, ink: string, ground: string): SliceImage {
  const H = height;
  const W = 2 * END + 2;
  const r = W - BODY_INSET;
  const body =
    `<rect x="${BODY_INSET}" y="1.2" width="${r - BODY_INSET}" height="${f(H - 2.4)}" fill="${ground}"/>` +
    `<path d="M${BODY_INSET} 1.2H${r}M${BODY_INSET} ${f(H - 1.2)}H${r}" stroke="${ink}" stroke-width="1.3"/>` +
    `<path d="M${BODY_INSET} 3.9H${r}M${BODY_INSET} ${f(H - 3.9)}H${r}" stroke="${ink}" stroke-width=".5"/>`;
  const end =
    `<path d="M2.5 7C2.5 1.6 10.5 1.6 10.5 7V${f(H - 7)}C10.5 ${f(H - 1.6)} 2.5 ${f(H - 1.6)} 2.5 ${f(H - 7)}Z" fill="${ground}" stroke="${ink}" stroke-width=".9"/>` +
    `<path d="M4 8V${f(H - 8)}M5.3 7V${f(H - 7)}M6.6 7V${f(H - 7)}" stroke="${ink}" stroke-width=".45"/>` +
    `<path d="M9.4 6.4C9.4 3.4 4 3.4 4 6.2C4 8.4 7.6 8.6 7.6 6.6C7.6 5.4 5.8 5.4 5.8 6.4" fill="none" stroke="${ink}" stroke-width=".8" stroke-linecap="round"/>` +
    `<path d="M10.5 ${f(H - 5)}C13 ${f(H - 5)} 15 ${f(H - 3)} 16 ${f(H - 1.2)}" fill="none" stroke="${ink}" stroke-width=".6"/>`;
  const svg = svgDocument(W, H, `${body}${end}<g transform="translate(${W} 0) scale(-1 1)">${end}</g>`);
  return { svg, slice: END, border: END };
}
