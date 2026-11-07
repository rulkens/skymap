/**
 * lookTarget — where a `swap` line draws this frame. Under the antique look the
 * swap chain belongs to the `stylize` step alone: the scene goes to `print`,
 * the captions to their own transparent `overlay` row so the look can ink them
 * as lettering rather than treat them as scene light.
 */

export function lookTarget(target: string, as: 'print' | 'overlay', antique: boolean): string {
  return antique && target === 'swap' ? as : target;
}
