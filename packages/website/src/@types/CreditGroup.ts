import type { CreditEntry } from './CreditEntry';

/**
 * One `##` section of ATTRIBUTIONS.md: its title, the paragraphs of its
 * opening text (terms the entries under it refer to as "quoted above") and
 * its entries, in the file's order.
 */
export type CreditGroup = {
  readonly title: string;
  readonly notes: readonly string[];
  readonly entries: readonly CreditEntry[];
};
