import type { ObjectKind } from './ObjectKind';

/**
 * One named thing of the app, as the object catalogue page lists it. `id` is
 * the value a link carries (after `focus=`, `exhibit=` or `tour=`); `link` is
 * the whole hash body, absent for a place the app reaches by search alone.
 * `anchor` is the row's own id on the page, so other pages and the docs search
 * can land on it.
 */
export type ObjectRow = {
  name: string;
  kind: ObjectKind;
  id: string;
  anchor: string;
  link?: string;
  parent?: string;
  aliases?: readonly string[];
  note?: string;
};
