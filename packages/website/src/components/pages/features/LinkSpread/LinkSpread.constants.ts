import { narrowSizes } from '../../../../utils/narrowSizes.ts';

export const RENDER = 'features-link-saturn';
// Seven of the page grid's twelve columns wide; the window's width on a phone.
export const RENDER_SIZES = narrowSizes('100vw', 'min(calc(58vw - 4rem), 41rem)');
export const CARD_SIZES = narrowSizes('50vw', '15rem');
export const CLOCK_SIZES = narrowSizes('80vw', '21rem');
