/** One row of the layer picker: the address it stores, its name, and 1 for an item under its layer. */
export type LayerOption = {
  readonly address: string;
  readonly text: string;
  readonly depth: 0 | 1;
};
