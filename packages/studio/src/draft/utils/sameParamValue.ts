/** Whether an edit leaves a param as it is: a list or an action compares by content, since every edit builds a new one. */
import type { ParamValue } from '../../@types/kinds/ParamValue';

export function sameParamValue(a: unknown, b: ParamValue): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object') {
    // Plain JSON data by the ClipData contract, built in one key order by the same creators.
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return Object.is(a, b);
}
