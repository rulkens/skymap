import { narrowSizes } from '../../../../utils/narrowSizes.ts';

export const RENDER = 'features-link-saturn';
// Saturn's gold, from the render.
export const ACCENT = 'var(--site-accent-planet)';
// Seven of the page grid's twelve columns wide; the window's width on a phone.
export const RENDER_SIZES = narrowSizes('100vw', 'min(calc(58vw - 4rem), 41rem)');
export const CARD_SIZES = narrowSizes('50vw', '15rem');
export const CLOCK_SIZES = narrowSizes('80vw', '21rem');
// What each parameter of the address sets, in the address's order.
export const WORDS: Record<string, string> = {
  focus: 'what you look at',
  t: 'the moment',
  pose: 'where the camera stands',
};
