import { svgDocument } from './svgDocument';

export const CHECK_BOX_SIZE = 15;

/**
 * An engraved check box: a double-ruled square on `ground`; checked adds a saltire
 * cut with swelling burin strokes over a `wash`. The saltire carries the state,
 * the wash only adds to it (colour is never the only signal).
 */
export function checkBoxSvg(checked: boolean, ink: string, wash: string, ground: string): string {
  let g =
    `<rect x=".6" y=".6" width="13.8" height="13.8" fill="${ground}" stroke="${ink}" stroke-width="1.1"/>` +
    `<rect x="2.7" y="2.7" width="9.6" height="9.6" fill="none" stroke="${ink}" stroke-width=".45"/>`;
  if (checked) {
    g +=
      `<rect x="3.3" y="3.6" width="8.8" height="8.6" fill="${wash}" fill-opacity=".62"/>` +
      `<path d="M3.4 3.4Q8.6 6.1 11.6 11.6Q6.1 8.6 3.4 3.4ZM11.6 3.4Q8.9 8.6 3.4 11.6Q6.4 6.1 11.6 3.4Z" fill="${ink}"/>`;
  }
  return svgDocument(CHECK_BOX_SIZE, CHECK_BOX_SIZE, g);
}
