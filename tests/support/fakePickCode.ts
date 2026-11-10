/**
 * Why both this and `testPickCode` exist: this one starts at 40, clear of `testPickCode`'s dense low codes, so a
 * stamp that hardcodes a code instead of calling `pickCode` fails; `testPickCode` is the real
 * dense allocator, for tests that compose several Layers.
 *
 * A Layer's `pickCode` that hands out codes from `first` (default 40) in first-ask
 * order: far from the dense low codes a row could still pack by mistake, so a
 * round trip through it fails on any stamp site that skips `pickCode`.
 */
export function fakePickCode(first = 40): (pickSourceId: string) => number {
  const ids: string[] = [];
  return (pickSourceId) => {
    if (!ids.includes(pickSourceId)) ids.push(pickSourceId);
    return first + ids.indexOf(pickSourceId);
  };
}
