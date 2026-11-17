import type { HexString } from '../../@types/math/HexString';
import type { PaperParams } from '../../@types/ui/antiqueChrome/PaperParams';
import { paperNoiseFilter } from './paperNoiseFilter';
import { svgDocument } from './svgDocument';
import { svgNumber as f } from './svgNumber';

/** The scroll ends' width and the curl caps' height: the 9-slice insets that keep them whole. */
export const CARTOUCHE_END = 22;
export const CARTOUCHE_CAP = 9;
const BODY_INSET = 8;
/** The body between the ends repeats with `round`: wide enough that its grain never reads as a pattern. */
const BODY_REPEAT = 40;

/**
 * A title cartouche `height` px tall, 9-slice: a banderole between two rolled
 * scroll ends, double-ruled top and bottom, on an opaque `ground` with the panels'
 * paper grain. Sliced at `CARTOUCHE_CAP CARTOUCHE_END fill`, the curls stay whole
 * while the body repeats along the title's width and the rolls stretch to a wrapped
 * title's height.
 */
export function cartoucheSvg(
  height: number,
  ink: string,
  ground: HexString,
  paper: PaperParams,
): string {
  const H = height;
  const W = 2 * CARTOUCHE_END + BODY_REPEAT;
  const r = W - BODY_INSET;
  const box = `x="${BODY_INSET}" y="1.2" width="${r - BODY_INSET}" height="${f(H - 2.4)}"`;
  const grain = paperNoiseFilter(
    'g',
    f(paper.grain),
    7,
    W,
    ground,
    paper.tone,
    paper.grainStrength,
    false,
  );
  const body =
    `<defs>${grain}<clipPath id="c"><rect ${box}/></clipPath></defs>` +
    `<rect ${box} fill="${ground}"/><rect width="${W}" height="${f(H)}" filter="url(#g)" clip-path="url(#c)"/>` +
    `<path d="M${BODY_INSET} 1.2H${r}M${BODY_INSET} ${f(H - 1.2)}H${r}" stroke="${ink}" stroke-width="1.3"/>` +
    `<path d="M${BODY_INSET} 3.9H${r}M${BODY_INSET} ${f(H - 3.9)}H${r}" stroke="${ink}" stroke-width=".5"/>`;
  const end =
    `<path d="M2.5 7C2.5 1.6 10.5 1.6 10.5 7V${f(H - 7)}C10.5 ${f(H - 1.6)} 2.5 ${f(H - 1.6)} 2.5 ${f(H - 7)}Z" fill="${ground}" stroke="${ink}" stroke-width=".9"/>` +
    `<path d="M4 8V${f(H - 8)}M5.3 7V${f(H - 7)}M6.6 7V${f(H - 7)}" stroke="${ink}" stroke-width=".45"/>` +
    `<path d="M9.4 6.4C9.4 3.4 4 3.4 4 6.2C4 8.4 7.6 8.6 7.6 6.6C7.6 5.4 5.8 5.4 5.8 6.4" fill="none" stroke="${ink}" stroke-width=".8" stroke-linecap="round"/>` +
    `<path d="M10.5 ${f(H - 5)}C13 ${f(H - 5)} 15 ${f(H - 3)} 16 ${f(H - 1.2)}" fill="none" stroke="${ink}" stroke-width=".6"/>`;
  return svgDocument(W, H, `${body}${end}<g transform="translate(${W} 0) scale(-1 1)">${end}</g>`);
}
