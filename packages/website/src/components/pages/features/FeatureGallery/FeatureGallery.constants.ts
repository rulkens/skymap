import { narrowSizes } from '../../../../utils/narrowSizes.ts';

// The large visual takes seven of the page grid's twelve columns.
export const SIZES = narrowSizes('100vw', 'min(calc(58vw - 4rem), 41rem)');
export const THUMB_SIZES = '6rem';
// A piece is drawn at about three tenths of the picture, wider on a phone where it stands beside the caption.
export const PIECE_SIZES = narrowSizes('42vw', '13rem');
// A bar is half the picture wide, and on a phone the column's width.
export const BAR_SIZES = narrowSizes('100vw', '22rem');
export const CUTOUT_SIZES = narrowSizes('70vw', '28rem');
