/**
 * A page's opening section (`[data-opening]`) as measured in a window, in CSS
 * pixels from the window's top; `null` for a part the section does not have.
 * `bottom` is the section's own lower edge, the label included.
 */
export type FoldMeasure = {
  bottom: number;
  titleBottom: number | null;
  leadBottom: number | null;
  pictureTop: number | null;
};
