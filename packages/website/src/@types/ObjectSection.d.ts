import type { ObjectKind } from './ObjectKind';

/**
 * One headed list of the object catalogue page. `split` says how a long list
 * is cut into smaller ones: by the body a row belongs to, or by first letter.
 * `one` and `many` are the noun the count line uses.
 */
export type ObjectSection = {
  id: string;
  title: string;
  kinds: readonly ObjectKind[];
  one: string;
  many: string;
  split?: 'parent' | 'letter';
};
