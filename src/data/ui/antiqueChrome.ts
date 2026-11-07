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

/** Tall enough for one line of 15 px small capitals between the scroll's double rules. */
export const TITLE_CARTOUCHE_HEIGHT = 32;
