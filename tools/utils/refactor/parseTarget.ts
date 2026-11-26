/**
 * parseTarget: split a `file#symbol` or `file#Type.prop` address into its parts.
 *
 * `#` cannot appear in a path or an identifier and `.` cannot appear in an identifier,
 * so one split on the first `#` and one on `.` are unambiguous. A malformed address
 * throws with the offending input, before any engine query, so a batch aborts unwritten.
 */

import type { Target } from '../../@types/refactor/Target';

export function parseTarget(address: string): Target {
  const hashIndex = address.indexOf('#');
  if (hashIndex === -1) {
    throw new Error(
      `Invalid address '${address}': expected 'file#symbol' or 'file#Type.prop' (missing '#' delimiter).`,
    );
  }

  const file = address.slice(0, hashIndex);
  const rest = address.slice(hashIndex + 1);
  if (file === '') throw new Error(`Invalid address '${address}': the file part is empty.`);
  if (rest === '') throw new Error(`Invalid address '${address}': the symbol part is empty.`);

  const parts = rest.split('.');
  if (parts.length === 1) return { kind: 'symbol', file, symbol: rest };
  if (parts.length > 2) {
    throw new Error(`Invalid address '${address}': expected one '.' ('Type.prop'), found more.`);
  }
  const [typeName, prop] = parts;
  if (!typeName || !prop) {
    throw new Error(`Invalid address '${address}': the type or the property part is empty.`);
  }
  return { kind: 'prop', file, typeName, prop };
}
