import { fact } from '../../../../data/fact.ts';

export const RENDER = 'features-andromeda';
export const DISTANCE = fact('andromeda-distance').figure!;
// Eight of the page grid's twelve columns, the window's width on a phone.
export const RENDER_SIZES = '(max-width: 900px) 100vw, min(calc(66vw - 3rem), 47rem)';
export const PIECE_SIZES = '(max-width: 900px) 48vw, 20rem';
