import {
  ANTIQUE_CHROME_GROUND,
  ANTIQUE_CHROME_INK,
  ANTIQUE_GAMBOGE,
  ANTIQUE_VERDIGRIS,
  HOVER_WASH_STRENGTH,
  INSET_FRAME,
  PANEL_FRAME,
  TITLE_CARTOUCHE_HEIGHT,
  WASH_STRENGTH,
} from '../../data/ui/antiqueChrome';
import { multiplyWashHex } from '../color/multiplyWashHex';
import { checkBoxSvg } from './checkBoxSvg';
import { scalePointerSvg } from './scalePointerSvg';
import { scaleTrackSvg } from './scaleTrackSvg';
import { tabletSvg } from './tabletSvg';
import { CARTOUCHE_CAP, CARTOUCHE_END, cartoucheSvg } from './cartoucheSvg';
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
  const inset = engravedFrameSvg(INSET_FRAME, ink, false);
  const cartouche = cartoucheSvg(TITLE_CARTOUCHE_HEIGHT, ink, ground);
  const tablet = (g: string): string => svgDataUrl(tabletSvg(ink, g).svg);
  const { slice: ts } = tabletSvg(ink, ground);
  const scale = scaleTrackSvg(ink, ground);
  const box = (on: boolean): string =>
    `${svgDataUrl(checkBoxSvg(on, ink, ANTIQUE_VERDIGRIS, ground))} center / 100% 100% no-repeat`;
  const tokens: Record<string, string> = {
    '--frame-image': `${svgDataUrl(frame.svg)} ${f(frame.slice)} / ${f(frame.slice)}px round`,
    '--frame-border': `${f(frame.border)}px`,
    '--frame-slice': `${f(frame.slice)}px`,
    '--inset-frame-image': `${svgDataUrl(inset.svg)} ${f(inset.slice)} / ${f(inset.slice)}px round`,
    '--inset-frame-border': `${f(inset.border)}px`,
    '--frame-edge': `${svgDataUrl(edge.svg)} 0 0 / ${f(edge.tile)}px ${f(edge.height)}px round no-repeat`,
    '--title-cartouche-image': `${svgDataUrl(cartouche)} ${CARTOUCHE_CAP} ${CARTOUCHE_END} fill / ${CARTOUCHE_CAP}px ${CARTOUCHE_END}px stretch`,
    '--title-cartouche-border': `0 ${CARTOUCHE_END}px`,
    '--title-cartouche-height': `${TITLE_CARTOUCHE_HEIGHT}px`,
    '--tablet-image': `${tablet(ground)} ${ts} fill / ${ts}px stretch`,
    '--tablet-source-hover': tablet(multiplyWashHex(ground, ANTIQUE_GAMBOGE, HOVER_WASH_STRENGTH)),
    '--tablet-source-pressed': tablet(multiplyWashHex(ground, ANTIQUE_GAMBOGE, WASH_STRENGTH)),
    '--tablet-source-selected': tablet(multiplyWashHex(ground, ANTIQUE_VERDIGRIS, WASH_STRENGTH)),
    '--toggle-image': box(false),
    '--toggle-image-on': box(true),
    '--scale-track-image': `${svgDataUrl(scale.svg)} 0 ${scale.end} ${scale.height} ${scale.start} / 0 ${scale.end}px ${scale.height}px ${scale.start}px round`,
    '--scale-track-height': `${scale.height}px`,
    '--slider-fill': multiplyWashHex(ground, ANTIQUE_VERDIGRIS, WASH_STRENGTH),
    '--slider-pointer': `${svgDataUrl(scalePointerSvg(ink, ground))} center / contain no-repeat`,
  };
  const body = Object.entries(tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return `:root[data-look='antique']{${body}}`;
}
