import {
  ANTIQUE_CHROME_GROUND,
  ANTIQUE_CHROME_INK,
  PANEL_FRAME,
  TITLE_CARTOUCHE_HEIGHT,
} from '../../data/ui/antiqueChrome';
import { cartoucheSvg } from './cartoucheSvg';
import { engravedEdgeSvg } from './engravedEdgeSvg';
import { engravedFrameSvg } from './engravedFrameSvg';
import { svgDataUrl } from './svgDataUrl';
import { svgNumber as f } from './svgNumber';

/**
 * The antique chrome's generated image tokens as one stylesheet, scoped to
 * `:root[data-look='antique']` so a stale copy can never leak the look. The
 * component modules read these through `var(--token, <plain look's value>)`.
 */
export function antiqueChromeCss(): string {
  const ink = ANTIQUE_CHROME_INK;
  const ground = ANTIQUE_CHROME_GROUND;
  const frame = engravedFrameSvg(PANEL_FRAME, ink, true);
  const edge = engravedEdgeSvg(PANEL_FRAME, ink);
  const cartouche = cartoucheSvg(TITLE_CARTOUCHE_HEIGHT, ink, ground);
  const tokens: Record<string, string> = {
    '--frame-image': `${svgDataUrl(frame.svg)} ${f(frame.slice)} / ${f(frame.slice)}px round`,
    '--frame-border': `${f(frame.border)}px`,
    '--frame-slice': `${f(frame.slice)}px`,
    '--frame-edge': `${svgDataUrl(edge.svg)} 0 0 / ${f(edge.tile)}px ${f(edge.height)}px round no-repeat`,
    '--title-cartouche-image': `${svgDataUrl(cartouche.svg)} 0 ${cartouche.slice} fill / 0 ${cartouche.slice}px stretch`,
    '--title-cartouche-border': `0 ${cartouche.border}px`,
    '--title-cartouche-height': `${TITLE_CARTOUCHE_HEIGHT}px`,
  };
  const body = Object.entries(tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return `:root[data-look='antique']{${body}}`;
}
