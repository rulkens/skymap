/** An object pick `pickObjectSaga` is still answering, or one it gave up on: its field shows which. */
export type PickStatus = {
  /** The field's row, by `rowKey`. */
  readonly row: string;
  readonly param: string;
  readonly focusId: string;
  readonly failed: boolean;
};
