/**
 * shallowEqualRef — structural equality for a SelectionRef-or-null. Every pick
 * builds a fresh ref object, so `===` would always miss; a SelectionRef is flat
 * primitives, so a one-level key/value compare IS structural equality. Lives as
 * its own util (not react-redux's shallowEqual) because src/state may not import
 * react-redux. Used by the selection slice's dedup-on-write.
 */
import type { SelectionRef } from '../../@types/engine/SelectionRef';

export function shallowEqualRef(a: SelectionRef | null, b: SelectionRef | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const ak = Object.keys(a) as Array<keyof SelectionRef>;
  const bk = Object.keys(b) as Array<keyof SelectionRef>;
  if (ak.length !== bk.length) return false;
  return ak.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
}
