import { lowerBoundBigUint64 } from '../data/lowerBoundBigUint64';

/**
 * An `objIDs` → first-row lookup (-1 on a miss), for the palette join's tens of
 * thousands of membership asks. A `Map<bigint, number>` over GLADE-large's
 * ~1.6 M rows costs ~125 MB; a natively sorted copy plus one first-row column
 * costs 12 B a row and builds in a fraction of a second.
 */
export function buildObjIdLookup(objIDs: BigUint64Array): (id: bigint) => number {
  const sorted = objIDs.slice().sort();
  const firstRow = new Int32Array(sorted.length).fill(-1);
  // Rows ascend, so the first write at an id's slot is its lowest row.
  for (let row = 0; row < objIDs.length; row++) {
    const at = lowerBoundBigUint64(sorted, objIDs[row]!);
    if (firstRow[at] === -1) firstRow[at] = row;
  }
  return (id) => {
    const at = lowerBoundBigUint64(sorted, id);
    return at < sorted.length && sorted[at] === id ? firstRow[at]! : -1;
  };
}
