import {
  ANTIQUE_CHROME_GROUND,
  ANTIQUE_CHROME_INK,
  ANTIQUE_GAMBOGE,
  ANTIQUE_VERDIGRIS,
  HOVER_WASH_STRENGTH,
  INK_WEAR,
  INSET_FRAME,
  PANEL_FOXING,
  PANEL_FRAME,
  PANEL_PAPER,
  TITLE_CARTOUCHE_HEIGHT,
  WASH_STRENGTH,
} from '../../data/ui/antiqueChrome';
import type { EngravedFrameParams } from '../../@types/ui/antiqueChrome/EngravedFrameParams';
import type { SliceImage } from '../../@types/ui/antiqueChrome/SliceImage';
import { multiplyWashHex } from '../color/multiplyWashHex';
import { checkBoxSvg } from './checkBoxSvg';
import { scalePointerSvg } from './scalePointerSvg';
import { scaleTrackSvg } from './scaleTrackSvg';
import { tabletSvg } from './tabletSvg';
import { CARTOUCHE_CAP, CARTOUCHE_END, cartoucheSvg } from './cartoucheSvg';
import { engravedEdgeSvg } from './engravedEdgeSvg';
import { engravedFrameLayout } from './engravedFrameLayout';
import { engravedFrameSvg } from './engravedFrameSvg';
import { foxingSvg } from './foxingSvg';
import { inkWearSvg } from './inkWearSvg';
import { paperTileSvg } from './paperTileSvg';
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
  // Each token prints from its own seed, so no two parts wear alike.
  const worn = (svg: string, seed: number, calm?: Parameters<typeof inkWearSvg>[3]): string =>
    svgDataUrl(inkWearSvg(svg, INK_WEAR, seed, calm));
  const frame = engravedFrameSvg(PANEL_FRAME, ink, true);
  const inset = engravedFrameSvg(INSET_FRAME, ink, false);
  const framed = ({ svg, slice: c }: SliceImage, p: EngravedFrameParams, seed: number): string => {
    const s = 2 * c + engravedFrameLayout(p).tile;
    // The edges repeat the middle strips: no wobble there.
    return `${worn(svg, seed, [
      [c, 0, s - 2 * c, s],
      [0, c, s, s - 2 * c],
    ])} ${f(c)} / ${f(c)}px round`;
  };
  const edge = engravedEdgeSvg(PANEL_FRAME, ink);
  const cartouche = cartoucheSvg(TITLE_CARTOUCHE_HEIGHT, ink, ground, PANEL_PAPER);
  const tablet = (pigment?: string, strength = 0): string =>
    worn(tabletSvg(ink, ground, PANEL_PAPER, pigment ? { pigment, strength } : undefined).svg, 15);
  const { slice: ts } = tabletSvg(ink, ground, PANEL_PAPER);
  const scale = scaleTrackSvg(ink, ground);
  const box = (on: boolean): string =>
    `${worn(checkBoxSvg(on, ink, ANTIQUE_VERDIGRIS, ground, PANEL_PAPER), on ? 17 : 18)} center / 100% 100% no-repeat`;
  const tokens: Record<string, string> = {
    '--frame-image': framed(frame, PANEL_FRAME, 11),
    '--frame-border': `${f(frame.border)}px`,
    '--frame-slice': `${f(frame.slice)}px`,
    '--inset-frame-image': framed(inset, INSET_FRAME, 13),
    '--inset-frame-border': `${f(inset.border)}px`,
    '--frame-edge': `${worn(edge.svg, 12, [[0, 0, edge.tile, edge.height]])} 0 0 / ${f(edge.tile)}px ${f(edge.height)}px round no-repeat`,
    '--title-cartouche-image': `${worn(cartouche, 14)} ${CARTOUCHE_CAP} ${CARTOUCHE_END} fill / ${CARTOUCHE_CAP}px ${CARTOUCHE_END}px round stretch`,
    '--title-cartouche-border': `0 ${CARTOUCHE_END}px`,
    '--title-cartouche-height': `${TITLE_CARTOUCHE_HEIGHT}px`,
    '--tablet-image': `${tablet()} ${ts} fill / ${ts}px round`,
    '--tablet-source-hover': tablet(ANTIQUE_GAMBOGE, HOVER_WASH_STRENGTH),
    '--tablet-source-pressed': tablet(ANTIQUE_GAMBOGE, WASH_STRENGTH),
    '--tablet-source-selected': tablet(ANTIQUE_VERDIGRIS, WASH_STRENGTH),
    '--toggle-image': box(false),
    '--toggle-image-on': box(true),
    '--scale-track-image': `${svgDataUrl(scale.svg)} 0 ${scale.end} ${scale.height} ${scale.start} / 0 ${scale.end}px ${scale.height}px ${scale.start}px round`,
    '--scale-track-height': `${scale.height}px`,
    '--slider-fill': multiplyWashHex(ground, ANTIQUE_VERDIGRIS, WASH_STRENGTH),
    '--slider-pointer': `${worn(scalePointerSvg(ink, ground), 19)} center / contain no-repeat`,
    // The slips' ground layers; styles/antique.css stacks them over the slip colour.
    '--sheet-paper': `${svgDataUrl(paperTileSvg(PANEL_PAPER, ground, 21))} 0 0 / ${PANEL_PAPER.size}px ${PANEL_PAPER.size}px`,
    '--sheet-foxing': `${svgDataUrl(foxingSvg(PANEL_FOXING, 23))} 37% 61% / ${PANEL_FOXING.width}px ${PANEL_FOXING.height}px`,
  };
  const body = Object.entries(tokens)
    .map(([k, v]) => `${k}:${v};`)
    .join('');
  return `:root[data-look='antique']{${body}}`;
}
