import type { HexString } from '../../@types/math/HexString';
import type { PaperParams } from '../../@types/ui/antiqueChrome/PaperParams';
import { paperNoiseFilter } from './paperNoiseFilter';
import { svgDocument } from './svgDocument';
import { svgNumber } from './svgNumber';

export const CHECK_BOX_SIZE = 15;

/**
 * An engraved check box: a double-ruled square on grained `ground`; checked adds a saltire
 * cut with swelling burin strokes over a `wash`. The saltire carries the state,
 * the wash only adds to it (colour is never the only signal).
 */
export function checkBoxSvg(
  checked: boolean,
  ink: string,
  wash: string,
  ground: HexString,
  paper: PaperParams,
): string {
  const S = CHECK_BOX_SIZE;
  const grain = paperNoiseFilter(
    'g',
    svgNumber(paper.grain),
    9,
    S,
    ground,
    paper.tone,
    paper.grainStrength,
    false,
  );
  let g =
    `<defs>${grain}</defs><rect x=".6" y=".6" width="13.8" height="13.8" fill="${ground}"/>` +
    `<rect x=".6" y=".6" width="13.8" height="13.8" filter="url(#g)"/>` +
    `<rect x=".6" y=".6" width="13.8" height="13.8" fill="none" stroke="${ink}" stroke-width="1.1"/>` +
    `<rect x="2.7" y="2.7" width="9.6" height="9.6" fill="none" stroke="${ink}" stroke-width=".45"/>`;
  if (checked) {
    g +=
      `<rect x="3.3" y="3.6" width="8.8" height="8.6" fill="${wash}" fill-opacity=".62"/>` +
      `<path d="M3.4 3.4Q8.6 6.1 11.6 11.6Q6.1 8.6 3.4 3.4ZM11.6 3.4Q8.9 8.6 3.4 11.6Q6.4 6.1 11.6 3.4Z" fill="${ink}"/>`;
  }
  return svgDocument(S, S, g);
}
