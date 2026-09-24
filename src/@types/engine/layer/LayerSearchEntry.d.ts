import type { SelectionRef } from '../SelectionRef';

/**
 * One command-palette row a Layer publishes through `Layer.search`.
 * `class` is the ranker's existing distinction, not a new one: `primary` rows
 * take `PRIMARY_TIEBREAK` and are uncapped, `catalog` rows are capped beside
 * the alias rows, so a loaded catalog can migrate onto this member unchanged.
 */
export type LayerSearchEntry = {
  readonly id: string;
  readonly names: readonly string[];
  readonly ref: SelectionRef;
  readonly class: 'primary' | 'catalog';
};
