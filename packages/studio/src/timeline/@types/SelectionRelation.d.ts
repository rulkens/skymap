/** How a row stands to the selected one: part of it (a step inside the selected block) or holding it (a block around the selection). */
export type SelectionRelation = {
  /** Inside the selection: the depth of the selected block in this row's ancestor chain, where its rail runs. */
  readonly insideAt: number | null;
  /** A block the selection sits in. */
  readonly contains: boolean;
};
