/**
 * One command-palette row a Layer publishes through `Layer.search`.
 * `id` is the row's FOCUS id — `actionForRow` focuses it verbatim, so it must
 * be what the Layer's own `focusId` row claims and decodes.
 * `class` is the ranker's existing distinction, not a new one: `primary` rows
 * take `PRIMARY_TIEBREAK` and are uncapped, `catalog` rows are capped beside
 * the alias rows, so a loaded catalog can migrate onto this member unchanged.
 */
export type LayerSearchEntry = {
  readonly id: string;
  readonly names: readonly string[];
  readonly class: 'primary' | 'catalog';
};
