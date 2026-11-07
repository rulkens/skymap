/**
 * The antique chrome's one fixed parameter set (picked in the prototype, see
 * docs/superpowers/plans/2026-11-07-antique-chrome-kit.md). Colours are baked
 * into the generated SVGs, so they must match `styles/antique.css`'s
 * `--antique-ink` and `--antique-slip`; a test holds them together.
 */
import type { EngravedFrameParams } from '../../@types/ui/antiqueChrome/EngravedFrameParams';

/** The canvas pass's `INK` (shaders/antiqueLook/fragment.wesl). */
export const ANTIQUE_CHROME_INK = '#2b2118';
/** The paper the panels are cut from. */
export const ANTIQUE_CHROME_GROUND = '#f7efda';

export const PANEL_FRAME: EngravedFrameParams = {
  outer: 1.6,
  hair: 0.6,
  gap: 1.6,
  band: 5,
  cell: 7,
  ornament: 28,
};

/** The colourist's box (shaders/antiqueLook/pigments.wesl): gamboge marks hover and press, verdigris what is on. */
export const ANTIQUE_GAMBOGE = '#e6bd4d';
export const ANTIQUE_VERDIGRIS = '#6b9e80';
/** How deep a full wash lies; hover lays a lighter one. */
export const WASH_STRENGTH = 0.48;
export const HOVER_WASH_STRENGTH = 0.22;

/** The thumbnail engraving's filter (components/EngravingFilter), named by styles/antique.css. */
export const ANTIQUE_ENGRAVE_FILTER_ID = 'antique-engrave';
/** Hatch line spacing, CSS px: near the plate's body engraving at the card's thumbnail size. */
export const ENGRAVE_HATCH_PITCH = 4;

/** Tall enough for one line of 15 px small capitals between the scroll's double rules. */
export const TITLE_CARTOUCHE_HEIGHT = 32;
