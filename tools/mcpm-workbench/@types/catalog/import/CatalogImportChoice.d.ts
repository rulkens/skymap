/** CatalogImportChoice — one option of an import dialog choice, with the help line shown while it is chosen. */
export type CatalogImportChoice<V extends string> = {
  readonly value: V;
  readonly label: string;
  readonly hint: string;
};
