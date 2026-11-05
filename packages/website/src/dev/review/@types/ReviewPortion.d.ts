/** The part of one text node that a mark's text covers; a mark that crosses inline elements has several. */
export type ReviewPortion = {
  node: Text;
  start: number;
  end: number;
};
