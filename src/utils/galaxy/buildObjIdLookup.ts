/**
 * An `objIDs` → lowest-row lookup (-1 on a miss), for the palette join's tens of
 * thousands of membership asks. A `Map<bigint, number>` over GLADE-large's
 * ~1.6 M rows costs ~125 MB; a row order sorted by id costs 4 B a row. A stable
 * LSD radix sort builds it in ~65 ms at 1.6 M rows (a comparator sort takes
 * ~450 ms), and stability leaves equal ids in row order, so lower-bound lands
 * on the lowest row. Ids are read as two u32 halves, never as BigInts per row.
 */
export function buildObjIdLookup(objIDs: BigUint64Array): (id: bigint) => number {
  const n = objIDs.length;
  // Little-endian view (every WebGPU host): word 2i is id i's low half, 2i+1 its high half.
  const words = new Uint32Array(objIDs.buffer, objIDs.byteOffset, n * 2);
  let order = new Uint32Array(n);
  let scratch = new Uint32Array(n);
  for (let row = 0; row < n; row++) order[row] = row;
  const offsets = new Uint32Array(1 << 16);
  for (let pass = 0; pass < 4; pass++) {
    const word = pass >> 1;
    const shift = (pass & 1) * 16;
    offsets.fill(0);
    for (let i = 0; i < n; i++) offsets[(words[2 * order[i]! + word]! >>> shift) & 0xffff]!++;
    let sum = 0;
    for (let d = 0; d < offsets.length; d++) {
      const c = offsets[d]!;
      offsets[d] = sum;
      sum += c;
    }
    for (let i = 0; i < n; i++) {
      const row = order[i]!;
      scratch[offsets[(words[2 * row + word]! >>> shift) & 0xffff]!++] = row;
    }
    [order, scratch] = [scratch, order];
  }
  return (id) => {
    const hi = Number(id >> 32n);
    const lo = Number(id & 0xffffffffn);
    let a = 0;
    let b = n;
    while (a < b) {
      const mid = (a + b) >> 1;
      const row = order[mid]!;
      const h = words[2 * row + 1]!;
      if (h < hi || (h === hi && words[2 * row]! < lo)) a = mid + 1;
      else b = mid;
    }
    if (a === n) return -1;
    const row = order[a]!;
    return words[2 * row + 1] === hi && words[2 * row] === lo ? row : -1;
  };
}
