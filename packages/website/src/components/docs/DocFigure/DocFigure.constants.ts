import { MEDIA } from '../../../data/media.ts';
import { narrowSizes } from '../../../utils/narrowSizes.ts';

// The picture's box at each layout of DocsLayout: nine columns of the page grid, or the text's seven and then six.
// 1239px is the page at its widest (site.css --wrap-max, 77.5rem), not a layout break.
export const WIDE_SIZES = narrowSizes('100vw', '(max-width: 1239px) calc(75vw - 4.875rem), 53.25rem');
export const COLUMN_SIZES = narrowSizes(
  '100vw',
  `not ${MEDIA.broad} calc(58.33vw - 4.46rem), (max-width: 1239px) calc(50vw - 4.25rem), 34.5rem`,
);
