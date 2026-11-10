/** Whether an edit leaves a param as it is: a list compares item by item, since every edit builds a new one. */
import type { ParamValue } from '../../@types/kinds/ParamValue';

export function sameParamValue(a: unknown, b: ParamValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return Object.is(a, b);
}
