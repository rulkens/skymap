import type { SelectionRefBase } from '../../@types/engine/selection/SelectionRefBase';
/**
 * shallowEqualRef — structural equality for a SelectionRefBase-or-null. Every pick
 * builds a fresh ref object, so `===` would always miss; a SelectionRefBase is flat
 * primitives, so a one-level key/value compare IS structural equality. Lives as
 * its own util (not react-redux's shallowEqual) because src/state may not import
 * react-redux. Used by the selection slice's dedup-on-write.
 */

export function shallowEqualRef(a: SelectionRefBase | null, b: SelectionRefBase | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const ak = Object.keys(a) as Array<keyof SelectionRefBase>;
  const bk = Object.keys(b) as Array<keyof SelectionRefBase>;
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
