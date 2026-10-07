import type { FoldMeasure } from '../@types/FoldMeasure';
import type { FoldSize } from '../@types/FoldSize';

// Layout lands on fractions of a pixel; half of one is not an overflow anyone can see.
const SLACK_PX = 0.5;
// A heading's line: this much of what follows a docs page's opening paragraphs has to be on the first screen.
const BODY_SHOWING_PX = 40;

/**
 * Why a page's opening section breaks the first-screen rule in a window, or
 * `null` when it holds. Wide: the whole section, its picture's label included,
 * ends inside the window. A phone cannot hold all of that beside a picture of
 * a decent size, so there the title and the lead must be inside and the
 * picture must have begun. A docs page's opening is a title and a lead over
 * paragraphs, which fit a screen however long the page's way in is; so there
 * the first thing that is not a paragraph (the first heading, table, figure,
 * diagram, list or example) must have begun on the first screen too. Not on a
 * phone, where the title and the lead alone can fill the screen.
 * `measure` is `null` when no section is marked.
 */
export function foldVerdict(measure: FoldMeasure | null, size: FoldSize): string | null {
  if (!measure) return 'no element carries data-opening';
  const limit = size.height + SLACK_PX;
  const over = (edge: number) => `${Math.round(edge - size.height)}px below the first screen`;
  if (measure.titleBottom !== null && measure.titleBottom > limit)
    return `the title ends ${over(measure.titleBottom)}`;
  if (measure.leadBottom !== null && measure.leadBottom > limit)
    return `the lead ends ${over(measure.leadBottom)}`;
  if (size.phone) {
    return measure.pictureTop !== null && measure.pictureTop >= size.height
      ? `the picture starts ${over(measure.pictureTop)}`
      : null;
  }
  if (measure.bodyTop !== null && measure.bodyTop + BODY_SHOWING_PX > limit)
    return `the first heading, table or figure starts ${over(measure.bodyTop + BODY_SHOWING_PX)}`;
  return measure.bottom > limit ? `the section ends ${over(measure.bottom)}` : null;
}
