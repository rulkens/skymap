/** `index` brought into `0..count-1`, going round at both ends: the view after the last is the first. */
export function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}
