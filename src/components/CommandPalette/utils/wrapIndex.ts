/**
 * wrapIndex — advance a list highlight by `delta`, wrapping past either end.
 *
 * The command palette's Up/Down keys move the active row; at the top edge Up
 * should jump to the bottom (and Down at the bottom back to the top), so the
 * highlight cycles instead of sticking. `((i + delta) % len + len) % len` keeps
 * the result in `[0, len)` even when `i + delta` is negative — JS `%` returns a
 * negative remainder, so the extra `+ len` is what makes Up-from-zero land on
 * the last row rather than a negative index. An empty list has no valid index,
 * so it stays at 0.
 */
export function wrapIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}
