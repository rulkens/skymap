import { fact } from '../../../../data/fact.ts';
import { narrowSizes } from '../../../../utils/narrowSizes.ts';

export const RENDER = 'features-andromeda';
export const DISTANCE = fact('andromeda-distance').figure!;
// Eight of the page grid's twelve columns, the window's width on a phone.
export const RENDER_SIZES = narrowSizes('100vw', 'min(calc(66vw - 3rem), 47rem)');
export const PIECE_SIZES = narrowSizes('48vw', '20rem');
