/**
 * totalVariation — TV distance between two histograms, normalising each to
 * a probability vector first (so raw voxel counts and pre-normalised
 * fractions both work). Bounded in [0,1]; unlike χ² or KL it never blows up
 * on an empty bin, which matters here because the low-density tail of a
 * trace histogram is nearly all zeros (spec §9).
 */
export function totalVariation(a: Float64Array, b: Float64Array): number {
  if (a.length !== b.length) {
    throw new Error(`totalVariation: length mismatch (a=${a.length}, b=${b.length})`);
  }
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < a.length; i++) {
    sumA += a[i]!;
    sumB += b[i]!;
  }
  if (sumA === 0 || sumB === 0) {
    throw new Error('totalVariation: cannot normalise a histogram whose total mass is 0');
  }
  let acc = 0;
  for (let i = 0; i < a.length; i++) {
    acc += Math.abs(a[i]! / sumA - b[i]! / sumB);
  }
  return acc / 2;
}
